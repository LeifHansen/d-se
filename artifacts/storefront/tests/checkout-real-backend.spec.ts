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
    await expect(page.getByTestId("checkout-success-page")).toBeVisible();
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

// ---------------------------------------------------------------------------
// Failure-mode coverage for POST /api/checkout against the real api-server.
// Each case asserts:
//   1. the HTTP response (status + JSON body), and
//   2. the resulting database state (no stray orders, cart untouched, etc.).
//
// We talk to /api/checkout directly via Playwright's `request` fixture
// (which goes through the same vite-dev proxy as the browser) instead of
// driving the UI — the route's failure paths return JSON before any UI is
// rendered, so a request-level test is both faster and more precise.
// ---------------------------------------------------------------------------

async function createEmptyCart(unique: string): Promise<string> {
  const cartId = `cart-e2e-real-empty-${unique}`;
  await withDb(async (c) => {
    await c.query(
      `INSERT INTO carts (id, created_at, updated_at) VALUES ($1, NOW(), NOW())`,
      [cartId],
    );
  });
  return cartId;
}

async function cleanupCart(cartId: string): Promise<void> {
  await withDb(async (c) => {
    const ordersRes = await c.query<{ id: number }>(
      `SELECT id FROM orders WHERE cart_id = $1`,
      [cartId],
    );
    for (const row of ordersRes.rows) {
      await c.query(`DELETE FROM order_items WHERE order_id = $1`, [row.id]);
      await c.query(`DELETE FROM orders WHERE id = $1`, [row.id]);
    }
    await c.query(`DELETE FROM abandoned_carts WHERE cart_id = $1`, [cartId]);
    await c.query(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId]);
    await c.query(`DELETE FROM carts WHERE id = $1`, [cartId]);
  });
}

async function countOrdersForCart(cartId: string): Promise<number> {
  return withDb(async (c) => {
    const r = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM orders WHERE cart_id = $1`,
      [cartId],
    );
    return Number(r.rows[0].n);
  });
}

test.describe("checkout failure paths against real api-server", () => {
  test("rejects checkout when the cart is empty and creates no order", async ({
    request,
  }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const cartId = await createEmptyCart(unique);
    try {
      const res = await request.post("/api/checkout", {
        data: {
          cartId,
          email: "empty-cart@example.com",
        },
      });
      expect(res.status()).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toMatch(/empty/i);

      // No orders row for this cart, and the cart itself was not marked
      // checked-out.
      expect(await countOrdersForCart(cartId)).toBe(0);
      await withDb(async (c) => {
        const cartRes = await c.query<{ checked_out_at: Date | null }>(
          `SELECT checked_out_at FROM carts WHERE id = $1`,
          [cartId],
        );
        expect(cartRes.rowCount).toBe(1);
        expect(cartRes.rows[0].checked_out_at).toBeNull();
      });
    } finally {
      await cleanupCart(cartId);
    }
  });

  test("checking out the same cart twice creates exactly one order", async ({
    request,
  }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const localSeed = await seedProductAndCart(unique);
    try {
      // First checkout: succeeds (dev-fallback).
      const first = await request.post("/api/checkout", {
        data: {
          cartId: localSeed.cartId,
          email: "double-checkout@example.com",
        },
      });
      expect(first.status()).toBe(200);
      const firstBody = (await first.json()) as {
        url: string;
        orderId: number;
      };
      expect(firstBody.orderId).toBeGreaterThan(0);
      expect(firstBody.url).toMatch(
        new RegExp(`/checkout/success\\?orderId=${firstBody.orderId}`),
      );

      // The first call should have emptied cart_items + stamped checked_out_at.
      await withDb(async (c) => {
        const items = await c.query(
          `SELECT 1 FROM cart_items WHERE cart_id = $1`,
          [localSeed.cartId],
        );
        expect(items.rowCount).toBe(0);
      });

      // Second checkout against the same (now empty) cart must fail with the
      // empty-cart guard, NOT silently create another order.
      const second = await request.post("/api/checkout", {
        data: {
          cartId: localSeed.cartId,
          email: "double-checkout@example.com",
        },
      });
      expect(second.status()).toBe(400);
      const secondBody = (await second.json()) as { error?: string };
      expect(secondBody.error).toMatch(/empty/i);

      // Exactly one orders row exists for this cart — the first one.
      expect(await countOrdersForCart(localSeed.cartId)).toBe(1);
    } finally {
      await cleanupSeed(localSeed);
    }
  });

  test("rejects a shippingRateId supplied without an address and creates no order", async ({
    request,
  }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const localSeed = await seedProductAndCart(unique);
    try {
      const res = await request.post("/api/checkout", {
        data: {
          cartId: localSeed.cartId,
          email: "rate-no-address@example.com",
          shippingRateId: "flat-standard",
          // address intentionally omitted
        },
      });
      expect(res.status()).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toMatch(/shipping address is required/i);

      // No order row was created, the seeded cart_items survived, and the
      // cart was not marked checked-out.
      expect(await countOrdersForCart(localSeed.cartId)).toBe(0);
      await withDb(async (c) => {
        const items = await c.query(
          `SELECT 1 FROM cart_items WHERE cart_id = $1`,
          [localSeed.cartId],
        );
        expect(items.rowCount).toBe(1);
        const cartRes = await c.query<{ checked_out_at: Date | null }>(
          `SELECT checked_out_at FROM carts WHERE id = $1`,
          [localSeed.cartId],
        );
        expect(cartRes.rowCount).toBe(1);
        expect(cartRes.rows[0].checked_out_at).toBeNull();
      });
    } finally {
      await cleanupSeed(localSeed);
    }
  });

  test("rejects a stale/unknown shippingRateId and creates no order", async ({
    request,
  }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const localSeed = await seedProductAndCart(unique);
    try {
      const res = await request.post("/api/checkout", {
        data: {
          cartId: localSeed.cartId,
          email: "stale-rate@example.com",
          shippingRateId: `bogus-rate-${unique}`,
          address: {
            name: "E2E Real Buyer",
            street1: "1 Real St",
            city: "Town",
            state: "CA",
            zip: "90210",
            country: "US",
          },
        },
      });
      expect(res.status()).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toMatch(/selected shipping rate is no longer available/i);

      expect(await countOrdersForCart(localSeed.cartId)).toBe(0);
      await withDb(async (c) => {
        const items = await c.query(
          `SELECT 1 FROM cart_items WHERE cart_id = $1`,
          [localSeed.cartId],
        );
        expect(items.rowCount).toBe(1);
        const cartRes = await c.query<{ checked_out_at: Date | null }>(
          `SELECT checked_out_at FROM carts WHERE id = $1`,
          [localSeed.cartId],
        );
        expect(cartRes.rowCount).toBe(1);
        expect(cartRes.rows[0].checked_out_at).toBeNull();
      });
    } finally {
      await cleanupSeed(localSeed);
    }
  });

  test("rejects an invalid/expired discount code and creates no order", async ({
    request,
  }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const localSeed = await seedProductAndCart(unique);
    // Seed an expired discount so we exercise the "Discount: Code has expired"
    // branch of validateDiscount, then also assert that an entirely unknown
    // code returns "Discount: Invalid code".
    const expiredCode = `E2EEXP${unique.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10)}`;
    const unknownCode = `E2ENOPE${unique.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10)}`;
    await withDb(async (c) => {
      await c.query(
        `INSERT INTO discount_codes
           (code, type, value, active, expires_at, redemptions_count, created_at, updated_at)
         VALUES ($1, 'percent', 10, TRUE, NOW() - INTERVAL '1 day', 0, NOW(), NOW())`,
        [expiredCode],
      );
    });
    try {
      const expiredRes = await request.post("/api/checkout", {
        data: {
          cartId: localSeed.cartId,
          email: "expired-discount@example.com",
          discountCode: expiredCode,
        },
      });
      expect(expiredRes.status()).toBe(400);
      const expiredBody = (await expiredRes.json()) as { error?: string };
      expect(expiredBody.error).toMatch(/^Discount:/);
      expect(expiredBody.error).toMatch(/expired/i);

      const unknownRes = await request.post("/api/checkout", {
        data: {
          cartId: localSeed.cartId,
          email: "unknown-discount@example.com",
          discountCode: unknownCode,
        },
      });
      expect(unknownRes.status()).toBe(400);
      const unknownBody = (await unknownRes.json()) as { error?: string };
      expect(unknownBody.error).toMatch(/^Discount:/);
      expect(unknownBody.error).toMatch(/invalid code/i);

      // Neither attempt created an order, the seeded cart_items survived,
      // and the cart was not marked checked-out.
      expect(await countOrdersForCart(localSeed.cartId)).toBe(0);
      await withDb(async (c) => {
        const items = await c.query(
          `SELECT 1 FROM cart_items WHERE cart_id = $1`,
          [localSeed.cartId],
        );
        expect(items.rowCount).toBe(1);
        const cartRes = await c.query<{ checked_out_at: Date | null }>(
          `SELECT checked_out_at FROM carts WHERE id = $1`,
          [localSeed.cartId],
        );
        expect(cartRes.rowCount).toBe(1);
        expect(cartRes.rows[0].checked_out_at).toBeNull();
      });
    } finally {
      await withDb(async (c) => {
        await c.query(`DELETE FROM discount_codes WHERE code = $1`, [
          expiredCode,
        ]);
      });
      await cleanupSeed(localSeed);
    }
  });

  test("applies a valid discount code and lowers the persisted order total", async ({
    request,
  }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const localSeed = await seedProductAndCart(unique);
    const validCode = `E2EOK${unique.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10)}`;
    await withDb(async (c) => {
      await c.query(
        `INSERT INTO discount_codes
           (code, type, value, active, redemptions_count, created_at, updated_at)
         VALUES ($1, 'percent', 10, TRUE, 0, NOW(), NOW())`,
        [validCode],
      );
    });
    try {
      const res = await request.post("/api/checkout", {
        data: {
          cartId: localSeed.cartId,
          email: "valid-discount@example.com",
          discountCode: validCode,
        },
      });
      expect(res.status()).toBe(200);
      const body = (await res.json()) as { url: string; orderId: number };
      expect(body.orderId).toBeGreaterThan(0);
      expect(body.url).toMatch(
        new RegExp(`/checkout/success\\?orderId=${body.orderId}`),
      );

      // Seeded product is $42.00 (4200¢); 10% off = 420¢ discount.
      // No address/shippingRateId in this request → shipping = 0.
      const expectedSubtotal = 4200;
      const expectedDiscount = 420;
      const expectedTotal = expectedSubtotal - expectedDiscount;

      await withDb(async (c) => {
        const orderRes = await c.query<{
          id: number;
          subtotal_cents: number;
          discount_cents: number;
          total_cents: number;
          discount_code: string | null;
        }>(
          `SELECT id, subtotal_cents, discount_cents, total_cents, discount_code
             FROM orders WHERE id = $1`,
          [body.orderId],
        );
        expect(orderRes.rowCount).toBe(1);
        const order = orderRes.rows[0];
        expect(order.subtotal_cents).toBe(expectedSubtotal);
        expect(order.discount_cents).toBe(expectedDiscount);
        expect(order.total_cents).toBe(expectedTotal);
        expect(order.discount_code).toBe(validCode);
      });
    } finally {
      await withDb(async (c) => {
        await c.query(`DELETE FROM discount_codes WHERE code = $1`, [
          validCode,
        ]);
      });
      await cleanupSeed(localSeed);
    }
  });

  test("rejects a malformed email and creates no order", async ({
    request,
  }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const localSeed = await seedProductAndCart(unique);
    try {
      const res = await request.post("/api/checkout", {
        data: {
          cartId: localSeed.cartId,
          email: "not-a-valid-email",
        },
      });
      // Zod's .email() rejects this in CreateCheckoutBody before the route
      // touches the DB.
      expect(res.status()).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(typeof body.error).toBe("string");
      expect(body.error!.length).toBeGreaterThan(0);

      // No order row was created, the seeded cart_items survived, and the
      // cart was not marked checked-out.
      expect(await countOrdersForCart(localSeed.cartId)).toBe(0);
      await withDb(async (c) => {
        const items = await c.query(
          `SELECT 1 FROM cart_items WHERE cart_id = $1`,
          [localSeed.cartId],
        );
        expect(items.rowCount).toBe(1);
        const cartRes = await c.query<{ checked_out_at: Date | null }>(
          `SELECT checked_out_at FROM carts WHERE id = $1`,
          [localSeed.cartId],
        );
        expect(cartRes.rowCount).toBe(1);
        expect(cartRes.rows[0].checked_out_at).toBeNull();
      });
    } finally {
      await cleanupSeed(localSeed);
    }
  });
});
