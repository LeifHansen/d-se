import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

// Resolve packages from sibling workspace packages that already depend on them.
const requireFromApiServer = createRequire(
  path.join(repoRoot, "artifacts/api-server/package.json"),
);
const requireFromDb = createRequire(path.join(repoRoot, "lib/db/package.json"));

const { Storage } = requireFromApiServer("@google-cloud/storage");
const { Pool } = requireFromDb("pg");

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const publicBaseRaw = process.env.PUBLIC_OBJECT_SEARCH_PATHS;
if (!publicBaseRaw) {
  throw new Error("PUBLIC_OBJECT_SEARCH_PATHS must be set");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const publicBase = publicBaseRaw.split(",")[0].trim();
const m = publicBase.match(/^\/([^/]+)\/(.+)$/);
if (!m) throw new Error(`Cannot parse PUBLIC_OBJECT_SEARCH_PATHS: ${publicBase}`);
const bucketName = m[1];
const prefix = m[2];

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

const brandDir = path.join(repoRoot, "artifacts", "storefront", "src", "assets", "brand");

const items = [
  {
    src: path.join(brandDir, "Untitled-5.jpg"),
    publicPath: "dose/original-dropper.jpg",
    slug: "original-dropper",
    name: "Original Dropper",
    shortDescription: "10 mg • 30 doses",
    description:
      "The flagship DŌSE tincture. A clean, hemp-derived THC dropper layered with lemongrass and bergamot for a bright, citrus-forward ritual. Zero added sugar, predictable onset, gentle landing.",
    priceCents: 4800,
    inventory: 120,
    tags: ["bestseller", "thc", "dropper"],
    seoTitle: "Original Dropper — DŌSE",
    seoDescription:
      "Hemp-derived THC dropper with lemongrass + bergamot. 10 mg per dose, 30 doses, zero added sugar.",
  },
  {
    src: path.join(brandDir, "bottle-hero.jpg"),
    publicPath: "dose/wellness-elixir.jpg",
    slug: "wellness-elixir",
    name: "Wellness Elixir",
    shortDescription: "5 mg + CBD • 30 doses",
    description:
      "A balanced 1:1 THC:CBD blend tuned with adaptogens like ashwagandha. Calm without couch-lock, designed for the moments between everything else.",
    priceCents: 5400,
    inventory: 90,
    tags: ["new", "cbd", "adaptogen"],
    seoTitle: "Wellness Elixir — DŌSE",
    seoDescription:
      "A 1:1 THC:CBD elixir with ashwagandha. Calm without couch-lock — 30 doses per bottle.",
  },
  {
    src: path.join(brandDir, "Untitled-11_copy.jpg"),
    publicPath: "dose/nightcap.jpg",
    slug: "nightcap",
    name: "Nightcap",
    shortDescription: "10 mg + CBN • 30 doses",
    description:
      "A sleep-leaning ritual built on THC + CBN with chamomile and valerian. Drift, don't crash. Made for the slow, deliberate close to a long day.",
    priceCents: 5600,
    inventory: 75,
    tags: ["limited", "sleep", "cbn"],
    seoTitle: "Nightcap — DŌSE",
    seoDescription:
      "THC + CBN sleep blend with chamomile and valerian. Drift, don't crash.",
  },
];

const bucket = storage.bucket(bucketName);
for (const it of items) {
  const data = await readFile(it.src);
  await bucket.file(`${prefix}/${it.publicPath}`).save(data, {
    contentType: "image/jpeg",
    resumable: false,
  });
  console.log(`Uploaded ${it.publicPath} (${data.length} bytes)`);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  for (const p of items) {
    const images = [`/api/storage/public-objects/${p.publicPath}`];
    const r = await pool.query(
      `INSERT INTO products (slug, name, short_description, description, price_cents, inventory, images, tags, featured, published, seo_title, seo_description)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,true,true,$9,$10)
       ON CONFLICT (slug) DO UPDATE SET
         name=EXCLUDED.name,
         short_description=EXCLUDED.short_description,
         description=EXCLUDED.description,
         price_cents=EXCLUDED.price_cents,
         inventory=EXCLUDED.inventory,
         images=EXCLUDED.images,
         tags=EXCLUDED.tags,
         featured=true,
         published=true,
         seo_title=EXCLUDED.seo_title,
         seo_description=EXCLUDED.seo_description,
         updated_at=NOW()
       RETURNING id, slug`,
      [
        p.slug,
        p.name,
        p.shortDescription,
        p.description,
        p.priceCents,
        p.inventory,
        JSON.stringify(images),
        JSON.stringify(p.tags),
        p.seoTitle,
        p.seoDescription,
      ],
    );
    console.log("upserted", r.rows[0]);
  }
} finally {
  await pool.end();
}

console.log("DŌSE seed complete");
