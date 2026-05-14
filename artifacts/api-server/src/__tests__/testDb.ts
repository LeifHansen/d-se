import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@workspace/db/schema";

export const pglite = new PGlite();
export const db = drizzle(pglite, { schema });

const DDL = `
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  short_description TEXT,
  price_cents INTEGER NOT NULL,
  compare_at_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'usd',
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  inventory INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  weight_oz NUMERIC(10,2),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  seo_title TEXT,
  seo_description TEXT,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT,
  discount_code_id INTEGER,
  discount_code TEXT,
  checked_out_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id SERIAL PRIMARY KEY,
  cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discount_codes (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  value INTEGER NOT NULL,
  min_subtotal_cents INTEGER,
  max_redemptions INTEGER,
  redemptions_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  stripe_coupon_id TEXT,
  stripe_promotion_code_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  shipping_address JSONB,
  shipping_rate_id TEXT,
  shipment_id TEXT,
  tracking_code TEXT,
  label_url TEXT,
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  discount_code_id INTEGER,
  discount_code TEXT,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  cart_id TEXT,
  analytics_event_id TEXT,
  analytics_client_id TEXT,
  analytics_fbp TEXT,
  analytics_fbc TEXT,
  analytics_client_ip TEXT,
  analytics_user_agent TEXT,
  purchase_tracked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  product_image TEXT,
  quantity INTEGER NOT NULL,
  price_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS abandoned_carts (
  id SERIAL PRIMARY KEY,
  cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  user_id TEXT,
  first_reminder_sent_at TIMESTAMP,
  second_reminder_sent_at TIMESTAMP,
  recovered_at TIMESTAMP,
  recovered_order_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  source TEXT,
  resend_contact_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  unsubscribe_token TEXT UNIQUE,
  unsubscribed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_submission_fingerprints (
  hash TEXT NOT NULL,
  ip TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  first_seen TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hash, ip)
);

CREATE TABLE IF NOT EXISTS stripe_processed_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  order_id INTEGER,
  rating INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
  author_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

let initialized = false;

export async function initSchema(): Promise<void> {
  if (initialized) return;
  await pglite.exec(DDL);
  initialized = true;
}

export async function resetDb(): Promise<void> {
  await initSchema();
  await pglite.exec(`
    TRUNCATE TABLE
      newsletter_subscribers,
      product_reviews,
      abandoned_carts,
      order_items,
      orders,
      cart_items,
      carts,
      discount_codes,
      products,
      stripe_processed_events
    RESTART IDENTITY CASCADE;
  `);
}
