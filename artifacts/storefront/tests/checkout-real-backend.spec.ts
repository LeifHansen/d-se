import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// ---------------------------------------------------------------------------
// True end-to-end checkout: storefront → real api-server → real Postgres.
//
// Unlike checkout.spec.ts (which stubs /api/cart and /api/checkout in the
// browser to catch frontend regressions), this spec runs a live api-server
// process behind a vite-dev proxy and asserts the contract the real route
// emits:
//   - POST /api/checkout creates an `orders` row,
//   - returns { url: "/checkout/success?orderId=N", orderId: N } in
//     dev-fallback (Stripe disabled),
//   - empties cart_items for the cart id, and
//   - stamps carts.checked_out_at.
//
// Stripe is forced off via the env in playwright.checkout-real.config.ts so
// the dev-fallback branch in artifacts/api-server/src/routes/orders.ts runs.
// ---------------------------------------------------------------------------

const STORED_CART_KEY = "dose-cart-id";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set to run the real-backend checkout test");
}

type Seed = {
  cartId: string;
  productId: number;
  productSlug: string;
};

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function seedProductAndCart(unique: string): Promise<Seed> {
  return withDb(async (c) => {
    const slug = `e2e-real-checkout-${unique}`;
    const cartId = `cart-e2e-real-${unique}`;
    const productRes = await c.query<{ id: number }>(
      `INSERT INTO products (slug, name, description, price_cents, currency, inventory, published)
       VALUES ($1, 'E2E Real Checkout Tincture', 'fixture for the real-backend checkout spec', 4200, 'usd', 25, TRUE)
       RETURNING id`,
      [slug],
    );
    const productId = productRes.rows[0].id;
    await c.query(
      `INSERT INTO carts (id, created_at, updated_at) VALUES ($1, NOW(), NOW())`,
      [cartId],
    );
    await c.query(
      `INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 1)`,
      [cartId, productId],
    );
    return { cartId, productId, productSlug: slug };
  });
}

async function cleanupSeed(seed: Seed): Promise<void> {
  await withDb(async (c) => {
    // Order cleanup first (FK on order_items -> orders).
    const ordersRes = await c.query<{ id: number }>(
      `SELECT id FROM orders WHERE cart_id = $1`,
      [seed.cartId],
    );
    for (const row of ordersRes.rows) {
      await c.query(`DELETE FROM order_items WHERE order_id = $1`, [row.id]);
      await c.query(`DELETE FROM orders WHERE id = $1`, [row.id]);
    }
    await c.query(`DELETE FROM abandoned_carts WHERE cart_id = $1`, [
      seed.cartId,
    ]);
    await c.query(`DELETE FROM cart_items WHERE cart_id = $1`, [seed.cartId]);
    await c.query(`DELETE FROM carts WHERE id = $1`, [seed.cartId]);
    await c.query(`DELETE FROM products WHERE id = $1`, [seed.productId]);
  });
}

async function seedCartIdInBrowser(page: Page, cartId: string): Promise<void> {
  await page.addInitScript(
    ([cartKey, cartValue]) => {
      try {
        window.localStorage.setItem(cartKey, cartValue);
        // Pre-dismiss the age gate + cookie banner so they don't intercept
        // pointer events on the checkout form.
        window.localStorage.setItem("dose-age-confirmed", "yes");
        window.localStorage.setItem("dose-cookies-decision", "accept");
      } catch {
        // ignore
      }
    },
    [STORED_CART_KEY, cartId],
  );
}

test.describe("checkout against real api-server (dev-fallback Stripe)", () => {
  let seed: Seed;

  test.beforeEach(async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    seed = await seedProductAndCart(unique);
  });

  test.afterEach(async () => {
    if (seed) await cleanupSeed(seed);
  });

  test("submitting /checkout creates a real order, redirects to /checkout/success, and clears the cart", async ({
    page,
  }) => {
    await seedCartIdInBrowser(page, seed.cartId);

    // Start at /cart and click "Continue to checkout" so we exercise the
    // real cart -> checkout navigation path, not just a direct /checkout
    // load.
    await page.goto("/cart");
    await expect(page.getByTestId("cart-items")).toBeVisible();
    await page.getByTestId("cart-checkout").click();
    await page.waitForURL(/\/checkout(\?|$)/);
    await expect(page.getByTestId("page-checkout")).toBeVisible();

    // Sanity-check that the proxied /api/cart actually returned our seeded
    // line item — otherwise the form will short-circuit to "bag empty".
    await expect(page.getByTestId("checkout-email")).toBeVisible();

    await page.getByTestId("checkout-email").fill("real-backend@example.com");
    await page.getByTestId("checkout-name").fill("E2E Real Buyer");
    await page.getByTestId("checkout-street1").fill("1 Real St");
    await page.getByTestId("checkout-city").fill("Town");
    await page.getByTestId("checkout-state").fill("CA");
    await page.getByTestId("checkout-zip").fill("90210");

    await page.getByTestId("checkout-calc-shipping").click();
    // The flat-shipping fallback returns at least one rate; the form auto-
    // selects the first one. Wait for any rate radio to be checked.
    await expect(page.locator('input[name="shipping-rate"]:checked')).toHaveCount(1, {
      timeout: 10_000,
    });

    await page.getByTestId("checkout-submit").click();

    // The dev-fallback branch returns { url: "/checkout/success?orderId=N" }
    // and the storefront does window.location.href = result.url, so we wait
    // for the navigation and parse the real (server-assigned) order id.
    await page.waitForURL(/\/checkout\/success\?orderId=\d+/);
    const url = new URL(page.url());
    const orderIdParam = url.searchParams.get("orderId");
    expect(orderIdParam).toMatch(/^\d+$/);
    const orderId = Number(orderIdParam);
    expect(orderId).toBeGreaterThan(0);

    // ---- Database assertions: real persistence happened. -------------------
    await withDb(async (c) => {
      const orderRes = await c.query<{
        id: number;
        status: string;
        cart_id: string | null;
        email: string | null;
        subtotal_cents: number;
        total_cents: number;
      }>(
        `SELECT id, status, cart_id, email, subtotal_cents, total_cents
           FROM orders WHERE id = $1`,
        [orderId],
      );
      expect(orderRes.rowCount).toBe(1);
      const order = orderRes.rows[0];
      expect(order.cart_id).toBe(seed.cartId);
      expect(order.email).toBe("real-backend@example.com");
      // Dev fallback flips status to "paid" before responding.
      expect(order.status).toBe("paid");
      expect(order.subtotal_cents).toBe(4200);
      // Subtotal + flat-rate standard shipping (595 + 1 item * 100 = 695).
      expect(order.total_cents).toBe(4200 + 695);

      const itemsRes = await c.query<{
        product_id: number;
        quantity: number;
        price_cents: number;
        product_name: string;
      }>(
        `SELECT product_id, quantity, price_cents, product_name
           FROM order_items WHERE order_id = $1`,
        [orderId],
      );
      expect(itemsRes.rows).toHaveLength(1);
      expect(itemsRes.rows[0].product_id).toBe(seed.productId);
      expect(itemsRes.rows[0].quantity).toBe(1);
      expect(itemsRes.rows[0].price_cents).toBe(4200);

      const cartRes = await c.query<{ checked_out_at: Date | null }>(
        `SELECT checked_out_at FROM carts WHERE id = $1`,
        [seed.cartId],
      );
      expect(cartRes.rowCount).toBe(1);
      expect(cartRes.rows[0].checked_out_at).not.toBeNull();

      const cartItemsRes = await c.query(
        `SELECT 1 FROM cart_items WHERE cart_id = $1`,
        [seed.cartId],
      );
      expect(cartItemsRes.rowCount).toBe(0);
    });
  });
});
