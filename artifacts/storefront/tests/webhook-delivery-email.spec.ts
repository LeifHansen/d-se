import { test, expect } from "@playwright/test";
import { Client } from "pg";

// ---------------------------------------------------------------------------
// End-to-end coverage for the EasyPost delivery webhook + delivery email.
//
// The api-server's webhooks route (artifacts/api-server/src/routes/webhooks.ts)
// flips an order from `shipped` -> `delivered` on a tracker.updated event,
// claims the delivery email send by stamping `delivered_email_sent_at`, mints
// a `lookup_token` if the order doesn't have one yet, and emails the shopper
// a link of the form `${SITE_URL}/orders/:id?token=…`.
//
// The unit/integration suite already covers the webhook handler in isolation
// (artifacts/api-server/src/__tests__/webhook.test.ts). This spec exists so
// the link the customer actually clicks — including its token format — is
// continuously verified against the live storefront + by-token lookup route.
// If the token format ever drifts, or the order page stops rendering for a
// token-authenticated load, this test fails before any shopper is affected.
// ---------------------------------------------------------------------------

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set to run the delivery-webhook e2e test",
  );
}

const API_URL = process.env.E2E_API_URL ?? "http://localhost:18182";

type Seed = {
  cartId: string;
  productId: number;
  orderId: number;
  trackingCode: string;
  email: string;
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

async function seedShippedOrder(unique: string): Promise<Seed> {
  const slug = `e2e-webhook-delivery-${unique}`;
  const cartId = `cart-e2e-delivery-${unique}`;
  const trackingCode = `E2EDLV${unique.toUpperCase()}`;
  const email = `delivery-e2e-${unique}@example.com`;

  return withDb(async (c) => {
    const productRes = await c.query<{ id: number }>(
      `INSERT INTO products (slug, name, description, price_cents, currency, inventory, published)
       VALUES ($1, 'E2E Delivery Tincture', 'fixture for the delivery webhook spec', 3300, 'usd', 10, TRUE)
       RETURNING id`,
      [slug],
    );
    const productId = productRes.rows[0].id;

    await c.query(
      `INSERT INTO carts (id, created_at, updated_at) VALUES ($1, NOW(), NOW())`,
      [cartId],
    );

    // Seed the order in `shipped` status with a tracking code so the webhook
    // is allowed to transition it (TRACKABLE_ORDER_STATUSES) and the join
    // by tracking_code resolves. Crucially, leave `lookup_token` NULL so the
    // webhook itself mints + persists the token we'll then load with.
    const orderRes = await c.query<{ id: number }>(
      `INSERT INTO orders
         (email, status, subtotal_cents, shipping_cents, tax_cents, total_cents,
          currency, cart_id, tracking_code, carrier)
       VALUES ($1, 'shipped', 3300, 500, 0, 3800, 'usd', $2, $3, 'USPS')
       RETURNING id`,
      [email, cartId, trackingCode],
    );
    const orderId = orderRes.rows[0].id;

    await c.query(
      `INSERT INTO order_items (order_id, product_id, product_name, product_image, quantity, price_cents)
       VALUES ($1, $2, 'E2E Delivery Tincture', NULL, 1, 3300)`,
      [orderId, productId],
    );

    return { cartId, productId, orderId, trackingCode, email };
  });
}

async function cleanupSeed(seed: Seed): Promise<void> {
  await withDb(async (c) => {
    await c.query(`DELETE FROM order_items WHERE order_id = $1`, [seed.orderId]);
    await c.query(`DELETE FROM orders WHERE id = $1`, [seed.orderId]);
    await c.query(`DELETE FROM cart_items WHERE cart_id = $1`, [seed.cartId]);
    await c.query(`DELETE FROM carts WHERE id = $1`, [seed.cartId]);
    await c.query(`DELETE FROM products WHERE id = $1`, [seed.productId]);
  });
}

test.describe("EasyPost delivery webhook -> delivery email link", () => {
  let seed: Seed;

  test.beforeEach(async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    seed = await seedShippedOrder(unique);
  });

  test.afterEach(async () => {
    if (seed) await cleanupSeed(seed);
  });

  test("tracker.updated=delivered transitions the order and the email's orderUrl loads the order page", async ({
    page,
    request,
  }) => {
    // Fire the webhook directly at the api-server. EASYPOST_WEBHOOK_SECRET
    // is unset in this test config, so no signature header is required.
    const webhookRes = await request.post(`${API_URL}/api/webhooks/easypost`, {
      headers: { "content-type": "application/json" },
      data: {
        description: "tracker.updated",
        result: {
          object: "Tracker",
          id: `trk_e2e_${seed.orderId}`,
          tracking_code: seed.trackingCode,
          shipment_id: null,
          status: "delivered",
          carrier: "USPS",
        },
      },
    });
    expect(webhookRes.status()).toBe(200);
    const webhookBody = (await webhookRes.json()) as {
      received?: boolean;
      orderId?: number;
      status?: string;
    };
    expect(webhookBody.received).toBe(true);
    expect(webhookBody.orderId).toBe(seed.orderId);
    expect(webhookBody.status).toBe("delivered");

    // The handler should have transitioned the order, claimed the delivery
    // email send, and persisted a lookup_token — that's the same token the
    // delivery email's `orderUrl` embeds.
    const stamped = await withDb(async (c) =>
      c.query<{
        status: string;
        delivered_email_sent_at: Date | null;
        lookup_token: string | null;
      }>(
        `SELECT status, delivered_email_sent_at, lookup_token
           FROM orders WHERE id = $1`,
        [seed.orderId],
      ),
    );
    expect(stamped.rowCount).toBe(1);
    expect(stamped.rows[0].status).toBe("delivered");
    expect(stamped.rows[0].delivered_email_sent_at).not.toBeNull();
    const lookupToken = stamped.rows[0].lookup_token;
    expect(lookupToken).toBeTruthy();

    // Reconstruct the same path the delivery email links to. SITE_URL only
    // affects the host portion, which the storefront baseURL supplies; the
    // path + token format is what we're guarding against drift.
    const orderUrl = `/orders/${seed.orderId}?token=${encodeURIComponent(
      lookupToken!,
    )}`;

    const navResponse = await page.goto(orderUrl);
    expect(navResponse, "page.goto returned a response").not.toBeNull();
    expect(navResponse!.status()).toBe(200);

    // The order detail page renders the lookup form first and only swaps in
    // the order summary once the by-token POST resolves. Wait for the real
    // order content (item rows + a total) to confirm the token round-tripped
    // through the live api-server.
    await expect(page.getByTestId("page-order-detail")).toBeVisible();
    await expect(page.getByTestId("order-summary")).toBeVisible();
    await expect(page.getByTestId("order-total")).toContainText("$");
    await expect(page.getByText(`Order #${seed.orderId}`).first()).toBeVisible();
    await expect(page.getByText("E2E Delivery Tincture")).toBeVisible();

    // Token-channel usage is recorded on a successful by-token load — proves
    // the storefront actually went through the by-token route, not a stale
    // email-based lookup.
    const usage = await withDb(async (c) =>
      c.query<{ lookup_token_last_channel: string | null }>(
        `SELECT lookup_token_last_channel FROM orders WHERE id = $1`,
        [seed.orderId],
      ),
    );
    expect(usage.rows[0].lookup_token_last_channel).toBe("token");
  });
});
