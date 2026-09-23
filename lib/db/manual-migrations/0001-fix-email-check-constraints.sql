-- The email CHECK constraints were declared in a JS template literal as
-- '[^@\s]', which JS cooks to '[^@s]'. Databases created with `drizzle-kit
-- push` therefore reject every email containing the letter "s" (orders,
-- carts, abandoned carts). `push` does not update changed CHECK bodies, so
-- run this once against every existing database:
--   psql "$DATABASE_URL" -f lib/db/manual-migrations/0001-fix-email-check-constraints.sql
BEGIN;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_email_canonical_check;
ALTER TABLE orders ADD CONSTRAINT orders_email_canonical_check CHECK (
  email IS NULL OR (length(email) > 0 AND email = lower(btrim(email)) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+$')
);
ALTER TABLE carts DROP CONSTRAINT IF EXISTS carts_email_canonical_check;
ALTER TABLE carts ADD CONSTRAINT carts_email_canonical_check CHECK (
  email IS NULL OR (length(email) > 0 AND email = lower(btrim(email)) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+$')
);
ALTER TABLE abandoned_carts DROP CONSTRAINT IF EXISTS abandoned_carts_email_canonical_check;
ALTER TABLE abandoned_carts ADD CONSTRAINT abandoned_carts_email_canonical_check CHECK (
  length(email) > 0 AND email = lower(btrim(email)) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+$'
);
COMMIT;
