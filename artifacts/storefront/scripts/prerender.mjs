#!/usr/bin/env node
// Post-build prerender: bake per-route <head> meta into static HTML files
// so search bots and social previewers see route-specific SEO without
// running JS.
//
// Single source of truth: this script parses src/App.tsx for the wouter
// <Route path="…"> declarations and refuses to start the build if any
// router route is missing a metadata entry below — there is no separate
// hand-maintained route list to drift out of sync.
//
// Static routes pull metadata from STATIC_META; the dynamic
// /products/:slug route is enumerated at build time by querying
// DATABASE_URL via `pg` for published products. Every emitted file
// passes a verify() check (title, canonical, description, og:title,
// twitter:card, JSON-LD) so any future regression in head injection
// fails the build loudly.
//
// The body remains the SPA shell; react-helmet-async takes over once
// the bundle hydrates. Production serving is handled by
// scripts/serve.mjs which uses try_files semantics so the per-route
// prerendered HTML is always preferred over the SPA shell fallback.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist", "public");
const APP_TSX = path.join(ROOT, "src", "App.tsx");

const SITE_URL = (
  process.env.VITE_SITE_URL ||
  process.env.SITE_URL ||
  (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "") ||
  "https://dose.example.com"
).replace(/\/$/, "");

const SITE_NAME = "DŌSE";
const SITE_TAGLINE = "Liquid THC Wellness Elixir";
const SITE_DESCRIPTION =
  "DŌSE is a precisely formulated THC-infused beverage dropper. Add a drop to any drink for a calm, controlled lift. Wellness elixir, dialed in.";
const TWITTER_HANDLE = "@dosewellness";

const ADMIN_DEFAULT_DESCRIPTION = "DŌSE admin dashboard.";

// Per-route SEO metadata. Every wouter route in src/App.tsx must either
// appear here (with `dynamic: false`) or be marked `dynamic: true` and
// have a corresponding generator below (e.g. /products/:slug → DB).
const ROUTE_META = {
  "/": {
    dynamic: false,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  "/shop": {
    dynamic: false,
    title: `Shop | ${SITE_NAME}`,
    description:
      "Browse the DŌSE collection — precisely formulated THC-infused beverage droppers and wellness elixirs, dialed in.",
  },
  "/contact": {
    dynamic: false,
    title: `Contact | ${SITE_NAME}`,
    description:
      "Get in touch with the DŌSE team. We respond to questions about products, orders, wholesale, and press within one business day.",
  },
  "/privacy": {
    dynamic: false,
    title: `Privacy Policy | ${SITE_NAME}`,
    description:
      "How DŌSE Wellness Co. collects, uses, and protects your information when you visit our site or purchase our products.",
  },
  "/terms": {
    dynamic: false,
    title: `Terms of Service | ${SITE_NAME}`,
    description:
      "The terms that govern your use of dose.com and any purchase you make from DŌSE Wellness Co.",
  },
  "/shipping-policy": {
    dynamic: false,
    title: `Shipping Policy | ${SITE_NAME}`,
    description:
      "Where DŌSE ships, the methods and timelines we offer, and what to expect after you place an order.",
  },
  "/returns": {
    dynamic: false,
    title: `Returns & Refunds | ${SITE_NAME}`,
    description:
      "Our 30-day satisfaction guarantee, how to start a return, and how refunds are processed for DŌSE orders.",
  },
  "/accessibility": {
    dynamic: false,
    title: `Accessibility Statement | ${SITE_NAME}`,
    description:
      "DŌSE Wellness Co.'s commitment to making dose.com usable by everyone, aligned with WCAG 2.2 Level AA.",
  },
  "/cart": {
    dynamic: false,
    title: `Cart | ${SITE_NAME}`,
    description: "Review your DŌSE cart before checkout.",
    noindex: true,
  },
  "/unsubscribe": {
    dynamic: false,
    title: `Unsubscribe | ${SITE_NAME}`,
    description: "Manage your DŌSE email subscription.",
    noindex: true,
  },
  // Dynamic — sourced from products table at build time.
  "/products/:slug": { dynamic: true, kind: "product" },
};

// Auto-cover every /admin/* route with a noindex shell so admin pages
// can never accidentally be indexed, and so adding a new admin route to
// the router doesn't require touching this file.
function adminMetaFor(routePath) {
  const tail = routePath.replace(/^\/admin\/?/, "");
  const label = tail
    ? tail
        .split("/")
        .map((seg) => seg.replace(/(^|-)([a-z])/g, (_, p, c) => (p ? " " : "") + c.toUpperCase()))
        .join(" · ")
    : "";
  return {
    dynamic: false,
    title: label ? `Admin · ${label} | ${SITE_NAME}` : `Admin | ${SITE_NAME}`,
    description: ADMIN_DEFAULT_DESCRIPTION,
    noindex: true,
  };
}

function metaFor(routePath) {
  if (ROUTE_META[routePath]) return ROUTE_META[routePath];
  if (routePath === "/admin" || routePath.startsWith("/admin/")) {
    return adminMetaFor(routePath);
  }
  return null;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function absoluteUrl(p) {
  if (!p) return SITE_URL;
  if (/^https?:\/\//.test(p)) return p;
  return `${SITE_URL}${p.startsWith("/") ? p : `/${p}`}`;
}

function buildHead(route) {
  const canonical = absoluteUrl(route.path);
  const image = absoluteUrl(route.image || "/opengraph.jpg");
  const robots = route.noindex
    ? "noindex,nofollow"
    : "index,follow,max-image-preview:large";
  const type = route.type || "website";
  const t = escapeHtml(route.title);
  const d = escapeHtml(route.description);
  return `    <title>${t}</title>
    <meta name="description" content="${d}" />
    <link rel="canonical" href="${canonical}" />
    <meta name="robots" content="${robots}" />

    <!-- Open Graph -->
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${t}" />
    <meta property="og:locale" content="en_US" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="${TWITTER_HANDLE}" />
    <meta name="twitter:creator" content="${TWITTER_HANDLE}" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${image}" />`;
}

function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/favicon.svg"),
    description: SITE_DESCRIPTION,
    sameAs: [
      "https://www.instagram.com/dosewellness",
      "https://twitter.com/dosewellness",
    ],
  };
}

function buildWebSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/shop?search={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

function buildProductJsonLd(p) {
  const url = absoluteUrl(`/products/${p.slug}`);
  const price = (Number(p.priceCents) / 100).toFixed(2);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description || undefined,
    image: (p.images || []).map((src) => absoluteUrl(src)),
    sku: p.slug,
    brand: { "@type": "Brand", name: SITE_NAME },
    url,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: (p.currency || "usd").toUpperCase(),
      price,
      availability:
        Number(p.inventory) > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };
}

function jsonLdScript(data) {
  const json = JSON.stringify(data, (_k, v) => (v === undefined ? undefined : v));
  return `    <script type="application/ld+json">${json}</script>`;
}

function injectHead(html, headBlock, jsonLdBlocks) {
  const headOpen = html.indexOf("<head>");
  const headClose = html.indexOf("</head>");
  if (headOpen === -1 || headClose === -1) {
    throw new Error("Could not locate <head>...</head> in built index.html");
  }

  const before = html.slice(0, headOpen + "<head>".length);
  const headInner = html.slice(headOpen + "<head>".length, headClose);
  const after = html.slice(headClose);

  const stripPatterns = [
    /<title>[\s\S]*?<\/title>\s*/gi,
    /<meta\s+name=["']description["'][^>]*>\s*/gi,
    /<meta\s+name=["']robots["'][^>]*>\s*/gi,
    /<link\s+rel=["']canonical["'][^>]*>\s*/gi,
    /<meta\s+property=["']og:[^"']+["'][^>]*>\s*/gi,
    /<meta\s+name=["']twitter:[^"']+["'][^>]*>\s*/gi,
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi,
  ];
  let cleaned = headInner;
  for (const re of stripPatterns) cleaned = cleaned.replace(re, "");

  return `${before}\n${headBlock}\n${jsonLdBlocks.join("\n")}\n${cleaned}${after}`;
}

// Parse <Route path="…"> declarations out of src/App.tsx so the SPA
// router itself is the single source of truth for what needs SEO.
async function parseSpaRoutes() {
  const src = await fs.readFile(APP_TSX, "utf8");
  const routes = new Set();
  const re = /<Route\s+[^>]*path=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    routes.add(m[1]);
  }
  if (routes.size === 0) {
    throw new Error("[prerender] no <Route path=...> declarations found in src/App.tsx");
  }
  return [...routes];
}

async function fetchProducts() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    if (process.env.PRERENDER_ALLOW_NO_DB === "1") {
      console.warn(
        "[prerender] DATABASE_URL not set and PRERENDER_ALLOW_NO_DB=1 — skipping /products/:slug prerender.",
      );
      return [];
    }
    throw new Error(
      "[prerender] DATABASE_URL is required to enumerate /products/:slug for SEO. " +
        "Set DATABASE_URL or set PRERENDER_ALLOW_NO_DB=1 to opt out (will leave product pages without per-route SEO).",
    );
  }
  const { Pool } = pg;
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
    max: 2,
  });
  try {
    const result = await pool.query(
      `SELECT slug, name, description, short_description, price_cents,
              currency, images, inventory, seo_title, seo_description, updated_at
         FROM products
        WHERE published = true`,
    );
    return result.rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description,
      shortDescription: r.short_description,
      priceCents: r.price_cents,
      currency: r.currency,
      images: r.images || [],
      inventory: r.inventory,
      seoTitle: r.seo_title,
      seoDescription: r.seo_description,
      updatedAt: r.updated_at,
    }));
  } finally {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
  }
}

function productToRoute(p) {
  const baseTitle = p.seoTitle || p.name;
  const description =
    p.seoDescription ||
    p.shortDescription ||
    (p.description
      ? p.description.replace(/\s+/g, " ").trim().slice(0, 200)
      : SITE_DESCRIPTION);
  return {
    path: `/products/${p.slug}`,
    title: `${baseTitle} | ${SITE_NAME}`,
    description,
    type: "product",
    image: (p.images && p.images[0]) || "/opengraph.jpg",
  };
}

async function writeRoute(indexHtml, route, extraJsonLd) {
  const head = buildHead(route);
  const orgJsonLd = jsonLdScript(buildOrganizationJsonLd());
  const siteJsonLd = jsonLdScript(buildWebSiteJsonLd());
  const blocks = [orgJsonLd, siteJsonLd];
  if (extraJsonLd) blocks.push(jsonLdScript(extraJsonLd));
  const out = injectHead(indexHtml, head, blocks);
  const target =
    route.path === "/"
      ? path.join(DIST, "index.html")
      : path.join(DIST, route.path.replace(/^\//, ""), "index.html");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, out, "utf8");
  return target;
}

async function verify(target, route) {
  const html = await fs.readFile(target, "utf8");
  const expectedTitle = `<title>${escapeHtml(route.title)}</title>`;
  const expectedCanonical = `rel="canonical" href="${absoluteUrl(route.path)}"`;
  const expectedRobots = route.noindex ? "noindex,nofollow" : "index,follow";
  const checks = [
    [expectedTitle, "title"],
    [expectedCanonical, "canonical"],
    [`name="description"`, "description"],
    [`property="og:title"`, "og:title"],
    [`name="twitter:card"`, "twitter:card"],
    [`application/ld+json`, "json-ld"],
    [expectedRobots, "robots"],
  ];
  for (const [needle, label] of checks) {
    if (!html.includes(needle)) {
      throw new Error(
        `[prerender] Verification failed for ${route.path}: missing ${label}`,
      );
    }
  }
}

async function main() {
  const indexPath = path.join(DIST, "index.html");
  const indexHtml = await fs.readFile(indexPath, "utf8");

  const spaRoutes = await parseSpaRoutes();

  // Drift check: every wouter route must have either a static metadata
  // entry (or be auto-covered by adminMetaFor) or be a known dynamic
  // route. This catches drift the moment someone adds a new <Route> to
  // src/App.tsx without thinking about SEO.
  const missing = [];
  for (const r of spaRoutes) {
    const meta = metaFor(r);
    if (!meta) missing.push(r);
  }
  if (missing.length) {
    throw new Error(
      `[prerender] router routes missing prerender metadata: ${missing.join(", ")}. ` +
        `Add an entry to ROUTE_META in scripts/prerender.mjs.`,
    );
  }
  // Inverse drift: every entry in ROUTE_META must correspond to a real
  // router route, otherwise it's dead config.
  const stale = Object.keys(ROUTE_META).filter((p) => !spaRoutes.includes(p));
  if (stale.length) {
    throw new Error(
      `[prerender] ROUTE_META has entries not in src/App.tsx: ${stale.join(", ")}. ` +
        `Remove them or wire them into the SPA router.`,
    );
  }

  const staticRoutes = spaRoutes
    .filter((r) => !metaFor(r).dynamic)
    .map((p) => ({ path: p, type: "website", ...metaFor(p) }));

  let written = 0;

  for (const route of staticRoutes) {
    const target = await writeRoute(indexHtml, route);
    await verify(target, route);
    written += 1;
    console.log(`[prerender] wrote ${path.relative(ROOT, target)}`);
  }

  // Dynamic routes — currently just /products/:slug.
  const dynamicProductRoutes = spaRoutes.filter(
    (r) => metaFor(r).dynamic && metaFor(r).kind === "product",
  );
  let productCount = 0;
  if (dynamicProductRoutes.length > 0) {
    const products = await fetchProducts();
    for (const p of products) {
      const route = productToRoute(p);
      const target = await writeRoute(indexHtml, route, buildProductJsonLd(p));
      await verify(target, route);
      written += 1;
      productCount += 1;
      console.log(`[prerender] wrote ${path.relative(ROOT, target)}`);
    }
  }

  console.log(
    `[prerender] done — ${written} route(s) (${staticRoutes.length} static, ${productCount} product)`,
  );
}

main().catch((err) => {
  console.error("[prerender] failed:", err);
  process.exit(1);
});
