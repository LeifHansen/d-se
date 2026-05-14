// Test: catch broken link previews before they ship.
//
// Runs scripts/prerender.mjs against a small fixture catalog (one
// published product + one published blog post) seeded into the live
// DATABASE_URL, and asserts that the emitted per-slug HTML for both
// /shop/<slug> and /journal/<slug> contains the expected <title>,
// canonical, OG/Twitter tags, and a valid Product/Article JSON-LD
// block.
//
// Also asserts that running with PRERENDER_ALLOW_NO_DB=1 and no
// DATABASE_URL still succeeds and just skips the dynamic per-slug
// pages (static routes still emit).
//
// Designed to run in CI on every PR alongside the rest of the e2e
// suite, after `pnpm --filter @workspace/db run push` has set up the
// products + blog_posts tables.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STOREFRONT_ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(STOREFRONT_ROOT, "dist", "public");
const INDEX_PATH = path.join(DIST_DIR, "index.html");
const PRERENDER_SCRIPT = path.join(STOREFRONT_ROOT, "scripts", "prerender.mjs");

// A minimal SPA shell that has the markers prerender.mjs needs:
// a <head>...</head> block to inject into, and a <div id="root">.
const FIXTURE_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>placeholder</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/index.js"></script>
  </body>
</html>
`;

const FIXTURE_PRODUCT_SLUG = "prerender-test-product";
const FIXTURE_PRODUCT_NAME = "Prerender Test Elixir";
const FIXTURE_PRODUCT_DESCRIPTION =
  "A fixture product used to verify per-slug SEO prerendering.";
const FIXTURE_PRODUCT_PRICE_CENTS = 4200;

const FIXTURE_POST_SLUG = "prerender-test-article";
const FIXTURE_POST_TITLE = "Prerender Test Article";
const FIXTURE_POST_EXCERPT = "A fixture article for SEO prerender tests.";

const SITE_URL = "https://prerender-test.example.com";
const SITE_NAME = "DŌSE";

const HAS_DB = !!process.env.DATABASE_URL;

let savedIndexBuf = null;
let savedDistExisted = false;

async function ensureFixtureIndex() {
  try {
    savedIndexBuf = await fs.readFile(INDEX_PATH);
    savedDistExisted = true;
  } catch {
    savedIndexBuf = null;
  }
  await fs.mkdir(DIST_DIR, { recursive: true });
  await fs.writeFile(INDEX_PATH, FIXTURE_INDEX_HTML, "utf8");
}

async function restoreIndex() {
  if (savedIndexBuf) {
    await fs.writeFile(INDEX_PATH, savedIndexBuf);
  } else if (savedDistExisted === false) {
    // Best-effort cleanup: only remove the file we wrote, not the dir,
    // so we don't stomp on a real build that happened to land here.
    try {
      await fs.unlink(INDEX_PATH);
    } catch {
      /* ignore */
    }
  }
}

async function withPool(fn) {
  const { Pool } = pg;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    max: 2,
  });
  try {
    return await fn(pool);
  } finally {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
  }
}

async function seedFixtures() {
  await withPool(async (pool) => {
    await pool.query(`DELETE FROM products WHERE slug = $1`, [
      FIXTURE_PRODUCT_SLUG,
    ]);
    await pool.query(`DELETE FROM blog_posts WHERE slug = $1`, [
      FIXTURE_POST_SLUG,
    ]);
    await pool.query(
      `INSERT INTO products (slug, name, description, short_description,
                             price_cents, currency, images, inventory,
                             published)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, true)`,
      [
        FIXTURE_PRODUCT_SLUG,
        FIXTURE_PRODUCT_NAME,
        FIXTURE_PRODUCT_DESCRIPTION,
        "Short fixture description.",
        FIXTURE_PRODUCT_PRICE_CENTS,
        "usd",
        JSON.stringify(["/fixtures/product.jpg"]),
        7,
      ],
    );
    await pool.query(
      `INSERT INTO blog_posts (slug, title, excerpt, content, cover_image,
                               author, published, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, NOW())`,
      [
        FIXTURE_POST_SLUG,
        FIXTURE_POST_TITLE,
        FIXTURE_POST_EXCERPT,
        "Fixture body.",
        "/fixtures/article.jpg",
        "Test Author",
      ],
    );
  });
}

async function clearFixtures() {
  if (!HAS_DB) return;
  try {
    await withPool(async (pool) => {
      await pool.query(`DELETE FROM products WHERE slug = $1`, [
        FIXTURE_PRODUCT_SLUG,
      ]);
      await pool.query(`DELETE FROM blog_posts WHERE slug = $1`, [
        FIXTURE_POST_SLUG,
      ]);
    });
  } catch {
    /* ignore cleanup errors */
  }
}

function runPrerender({ withDb }) {
  const env = { ...process.env, VITE_SITE_URL: SITE_URL };
  if (withDb) {
    delete env.PRERENDER_ALLOW_NO_DB;
  } else {
    delete env.DATABASE_URL;
    env.PRERENDER_ALLOW_NO_DB = "1";
  }
  const result = spawnSync(process.execPath, [PRERENDER_SCRIPT], {
    cwd: STOREFRONT_ROOT,
    env,
    encoding: "utf8",
  });
  return result;
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(m[1]));
    } catch (err) {
      throw new Error(
        `Invalid JSON-LD block: ${err.message}\nRaw: ${m[1].slice(0, 200)}`,
      );
    }
  }
  return blocks;
}

before(async () => {
  await ensureFixtureIndex();
});

after(async () => {
  await clearFixtures();
  await restoreIndex();
});

test("prerender emits per-slug shop + journal HTML with valid SEO and JSON-LD", async (t) => {
  if (!HAS_DB) {
    t.skip("DATABASE_URL not set — skipping per-slug prerender assertions");
    return;
  }

  await seedFixtures();

  const result = runPrerender({ withDb: true });
  assert.equal(
    result.status,
    0,
    `prerender exited with code ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );

  // /shop/<slug>/index.html
  const shopPath = path.join(
    DIST_DIR,
    "shop",
    FIXTURE_PRODUCT_SLUG,
    "index.html",
  );
  const shopHtml = await fs.readFile(shopPath, "utf8");

  const expectedProductTitle = `${FIXTURE_PRODUCT_NAME} | ${SITE_NAME}`;
  assert.match(
    shopHtml,
    new RegExp(`<title>${expectedProductTitle}</title>`),
    "shop page must have product title",
  );
  assert.ok(
    shopHtml.includes(
      `rel="canonical" href="${SITE_URL}/shop/${FIXTURE_PRODUCT_SLUG}"`,
    ),
    "shop page must have canonical to /shop/<slug>",
  );
  assert.ok(
    shopHtml.includes(`property="og:title"`),
    "shop page must have og:title",
  );
  assert.ok(
    shopHtml.includes(`property="og:description"`),
    "shop page must have og:description",
  );
  assert.ok(
    shopHtml.includes(`name="twitter:card"`),
    "shop page must have twitter:card",
  );
  assert.ok(
    shopHtml.includes(`name="description"`),
    "shop page must have meta description",
  );

  const shopJsonLd = extractJsonLdBlocks(shopHtml);
  const product = shopJsonLd.find((b) => b["@type"] === "Product");
  assert.ok(product, "shop page must include a Product JSON-LD block");
  assert.equal(product.name, FIXTURE_PRODUCT_NAME);
  assert.equal(product.url, `${SITE_URL}/shop/${FIXTURE_PRODUCT_SLUG}`);
  assert.equal(product.sku, FIXTURE_PRODUCT_SLUG);
  assert.ok(product.offers, "Product JSON-LD must have offers");
  assert.equal(product.offers["@type"], "Offer");
  assert.equal(product.offers.price, "42.00");
  assert.equal(product.offers.priceCurrency, "USD");
  assert.equal(
    product.offers.availability,
    "https://schema.org/InStock",
    "in-stock fixture must report InStock availability",
  );

  // /journal/<slug>/index.html
  const journalPath = path.join(
    DIST_DIR,
    "journal",
    FIXTURE_POST_SLUG,
    "index.html",
  );
  const journalHtml = await fs.readFile(journalPath, "utf8");

  const expectedArticleTitle = `${FIXTURE_POST_TITLE} | ${SITE_NAME}`;
  assert.match(
    journalHtml,
    new RegExp(`<title>${expectedArticleTitle}</title>`),
    "journal page must have article title",
  );
  assert.ok(
    journalHtml.includes(
      `rel="canonical" href="${SITE_URL}/journal/${FIXTURE_POST_SLUG}"`,
    ),
    "journal page must have canonical to /journal/<slug>",
  );
  assert.ok(
    journalHtml.includes(`property="og:title"`),
    "journal page must have og:title",
  );
  assert.ok(
    journalHtml.includes(`name="twitter:card"`),
    "journal page must have twitter:card",
  );

  const journalJsonLd = extractJsonLdBlocks(journalHtml);
  const article = journalJsonLd.find((b) => b["@type"] === "Article");
  assert.ok(article, "journal page must include an Article JSON-LD block");
  assert.equal(article.headline, FIXTURE_POST_TITLE);
  assert.equal(article.url, `${SITE_URL}/journal/${FIXTURE_POST_SLUG}`);
  assert.ok(article.datePublished, "Article must have datePublished");
  assert.ok(article.publisher, "Article must have publisher");
  assert.equal(article.publisher.name, SITE_NAME);
});

test("prerender succeeds with PRERENDER_ALLOW_NO_DB=1 and no DATABASE_URL", async () => {
  // Pre-clean any per-slug HTML left over from a prior run so we can
  // assert absence below without false negatives. We use a slug that
  // is guaranteed not to exist in any seeded data (and not used by
  // the DB-backed test above).
  const noDbSlug = "prerender-no-db-fixture-slug";
  const shopSlugDir = path.join(DIST_DIR, "shop", noDbSlug);
  const journalSlugDir = path.join(DIST_DIR, "journal", noDbSlug);
  for (const dir of [shopSlugDir, journalSlugDir]) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  const result = runPrerender({ withDb: false });
  assert.equal(
    result.status,
    0,
    `prerender (no-db) exited with code ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );

  // Static route should still be emitted (e.g. /shop landing page).
  const shopLanding = path.join(DIST_DIR, "shop", "index.html");
  const shopLandingHtml = await fs.readFile(shopLanding, "utf8");
  assert.ok(
    shopLandingHtml.includes(`<title>Shop | ${SITE_NAME}</title>`),
    "static /shop landing page must still be emitted in no-db mode",
  );
  assert.ok(
    shopLandingHtml.includes(
      `rel="canonical" href="${SITE_URL}/shop"`,
    ),
    "static /shop landing must have canonical",
  );

  // Confirm the prerender script announced it was skipping dynamic
  // pages rather than silently fetching them.
  const out = `${result.stdout}\n${result.stderr}`;
  assert.match(
    out,
    /PRERENDER_ALLOW_NO_DB=1|skipping/i,
    "prerender should warn that it is skipping dynamic pages without a DB",
  );

  // Assert the dynamic per-slug outputs were NOT produced. Without a
  // DB, prerender has no slug list to enumerate, so these directories
  // must remain absent — proves the skip path actually skipped.
  for (const dir of [shopSlugDir, journalSlugDir]) {
    let exists = true;
    try {
      await fs.stat(path.join(dir, "index.html"));
    } catch {
      exists = false;
    }
    assert.equal(
      exists,
      false,
      `no-db prerender must not emit per-slug HTML at ${dir}`,
    );
  }

  // The summary line should also report 0 dynamic outputs so we'd
  // catch a regression where an empty DB list still wrote files.
  assert.match(
    out,
    /\b0 product\b.*\b0 shop\b.*\b0 blog\b.*\b0 journal\b/,
    "no-db prerender summary should report zero dynamic outputs",
  );
});
