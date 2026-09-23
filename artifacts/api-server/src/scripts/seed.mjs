// Idempotent catalog seed for the DŌSE launch SKU (slug-keyed upsert).
// Images reference files the storefront serves from `public/brand/`, so this
// works locally without object storage. Swap them for uploaded images via the
// admin UI once S3/Tigris is configured.
//
// Usage: DATABASE_URL=postgres://... pnpm --filter @workspace/api-server seed
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const { Pool } = createRequire(path.join(repoRoot, "lib/db/package.json"))("pg");

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL not set; skipping seed");
  process.exit(0);
}

const products = [
  {
    slug: "dose-beverage-dropper",
    name: "DŌSE Beverage Dropper",
    shortDescription: "1000mg hemp-derived Delta-9 THC · 10mL",
    description:
      "A precision beverage additive: 1000mg of hemp-derived Delta-9 THC in a water-soluble emulsion. Rapid onset, long-term stability, and every batch lab-tested and traceable from vetted farm to final drop.",
    // Placeholder launch price — confirm before going live.
    priceCents: 6500,
    inventory: 100,
    weightOz: "4",
    images: [
      "/brand/dose2-bottle-product.png",
      "/brand/dose-bottle-hero.jpg",
      "/brand/dose2-bottle-collage.png",
    ],
    tags: ["thc", "dropper", "bestseller"],
    seoTitle: "DŌSE Beverage Dropper — 1000mg Hemp-Derived Delta-9 THC",
    seoDescription:
      "Water-soluble 1000mg hemp-derived Delta-9 THC beverage dropper. Lab-tested, farm-to-final-product traceability.",
  },
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  for (const p of products) {
    const r = await pool.query(
      `INSERT INTO products (slug, name, short_description, description, price_cents, inventory, weight_oz, images, tags, featured, published, seo_title, seo_description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,true,true,$10,$11)
       ON CONFLICT (slug) DO UPDATE SET
         name=EXCLUDED.name,
         short_description=EXCLUDED.short_description,
         description=EXCLUDED.description,
         weight_oz=EXCLUDED.weight_oz,
         images=EXCLUDED.images,
         tags=EXCLUDED.tags,
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
        p.weightOz,
        JSON.stringify(p.images),
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
