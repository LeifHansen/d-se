import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  numeric,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const productsTable = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    shortDescription: text("short_description"),
    priceCents: integer("price_cents").notNull(),
    compareAtCents: integer("compare_at_cents"),
    currency: text("currency").notNull().default("usd"),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    inventory: integer("inventory").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
    weightOz: numeric("weight_oz", { precision: 10, scale: 2 }),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    featured: boolean("featured").notNull().default(false),
    published: boolean("published").notNull().default(true),
    stripeProductId: text("stripe_product_id"),
    stripePriceId: text("stripe_price_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("products_slug_idx").on(t.slug)],
);

export type Product = typeof productsTable.$inferSelect;
export type InsertProduct = typeof productsTable.$inferInsert;
