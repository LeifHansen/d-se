import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

process.env.NODE_ENV = "test";
process.env.DISABLE_ABANDONED_CART = "1";
process.env.RESEND_FROM_EMAIL = "test@example.com";
if (!process.env.PORT) process.env.PORT = "0";
if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = "test-session-secret";
// Force flat-rate shipping codepath: never let the test hit a real EasyPost.
delete process.env.EASYPOST_API_KEY;
// Force the dev fallback in /api/checkout (no Stripe configured) so the order
// is created and immediately marked paid without touching Stripe at all.
delete process.env.REPLIT_CONNECTORS_HOSTNAME;
delete process.env.REPL_IDENTITY;
delete process.env.WEB_REPL_RENEWAL;

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  // Block any unexpected outbound calls (Resend, GA4, Meta, connectors, …).
  // The dev-fallback checkout path should not reach out to any of them.
  if (
    url.startsWith("https://api.resend.com/") ||
    url.startsWith("https://www.google-analytics.com/") ||
    url.startsWith("https://graph.facebook.com/") ||
    url.includes("connectors")
  ) {
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return realFetch(input as Parameters<typeof realFetch>[0], init);
}) as typeof fetch;

const {
  db,
  ordersTable,
  orderItemsTable,
  productsTable,
  cartsTable,
  cartItemsTable,
  pool,
} = await import("@workspace/db");
const { eq } = await import("drizzle-orm");
const app = (await import("../src/app")).default;

test("GET /api/orders/:id receipt: returns full order for matching cartId, 404 for wrong one", async (t) => {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  const slug = `test-receipt-widget-${Date.now()}`;
  const [product] = await db
    .insert(productsTable)
    .values({
      slug,
      name: "Receipt Test Widget",
      description: "Receipt test product",
      priceCents: 2599,
      currency: "usd",
      images: ["https://example.test/receipt-widget.png"],
      inventory: 10,
      published: true,
    })
    .returning();

  const cartId = `cart-receipt-${Date.now()}`;
  await db.insert(cartsTable).values({ id: cartId });
  await db.insert(cartItemsTable).values({
    cartId,
    productId: product.id,
    quantity: 2,
  });

  let createdOrderId: number | null = null;
  t.after(async () => {
    try {
      if (createdOrderId !== null) {
        await db
          .delete(orderItemsTable)
          .where(eq(orderItemsTable.orderId, createdOrderId));
        await db.delete(ordersTable).where(eq(ordersTable.id, createdOrderId));
      }
      await db.delete(cartItemsTable).where(eq(cartItemsTable.cartId, cartId));
      await db.delete(cartsTable).where(eq(cartsTable.id, cartId));
      await db.delete(productsTable).where(eq(productsTable.id, product.id));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await pool.end();
    }
  });

  const address = {
    name: "Receipt Buyer",
    street1: "789 Receipt Ave",
    city: "Testville",
    state: "CA",
    zip: "94000",
    country: "US",
  };

  const checkoutRes = await fetch(`${baseUrl}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cartId,
      email: "receipt@example.com",
      address,
      shippingRateId: "flat-standard",
    }),
  });
  assert.equal(checkoutRes.status, 200, "guest checkout should succeed");
  const checkoutJson = (await checkoutRes.json()) as {
    url: string;
    orderId: number;
  };
  createdOrderId = checkoutJson.orderId;
  assert.ok(createdOrderId, "orderId returned");
  assert.match(
    checkoutJson.url,
    /\/checkout\/success\?orderId=/,
    "dev fallback redirects to /checkout/success",
  );

  // ---- Happy path: GET /api/orders/:id?cartId=… returns the receipt ----
  const receiptRes = await fetch(
    `${baseUrl}/api/orders/${createdOrderId}?cartId=${encodeURIComponent(cartId)}`,
  );
  assert.equal(receiptRes.status, 200, "guest receipt lookup with cartId works");
  const receipt = (await receiptRes.json()) as {
    id: number;
    status: string;
    email: string | null;
    items: Array<{
      productId: number;
      productName: string;
      quantity: number;
      priceCents: number;
    }>;
    subtotalCents: number;
    shippingCents: number;
    totalCents: number;
    currency: string;
    shippingAddress?: {
      name: string;
      street1: string;
      city: string;
      state: string;
      zip: string;
      country: string;
    };
  };

  assert.equal(receipt.id, createdOrderId);
  assert.equal(receipt.status, "paid", "dev fallback marks the order paid");
  assert.equal(receipt.email, "receipt@example.com");
  assert.equal(receipt.currency, "usd");
  assert.equal(receipt.subtotalCents, 2599 * 2);
  assert.equal(receipt.shippingCents, 595 + 2 * 100); // flat-standard formula
  assert.equal(
    receipt.totalCents,
    receipt.subtotalCents + receipt.shippingCents,
  );
  assert.equal(receipt.items.length, 1);
  assert.equal(receipt.items[0].productId, product.id);
  assert.equal(receipt.items[0].productName, "Receipt Test Widget");
  assert.equal(receipt.items[0].quantity, 2);
  assert.equal(receipt.items[0].priceCents, 2599);
  assert.ok(receipt.shippingAddress, "shipping address present on receipt");
  assert.equal(receipt.shippingAddress!.name, address.name);
  assert.equal(receipt.shippingAddress!.street1, address.street1);
  assert.equal(receipt.shippingAddress!.city, address.city);
  assert.equal(receipt.shippingAddress!.state, address.state);
  assert.equal(receipt.shippingAddress!.zip, address.zip);
  assert.equal(receipt.shippingAddress!.country, address.country);

  // ---- Negative: wrong cartId must 404 (don't leak existence) ----
  const wrongRes = await fetch(
    `${baseUrl}/api/orders/${createdOrderId}?cartId=not-the-real-cart-id`,
  );
  assert.equal(
    wrongRes.status,
    404,
    "guest with wrong cartId should get 404, not the order",
  );

  // ---- Negative: no auth at all (no cartId, no sessionId, not signed in) ----
  const bareRes = await fetch(`${baseUrl}/api/orders/${createdOrderId}`);
  assert.equal(
    bareRes.status,
    404,
    "guest with no credentials should get 404",
  );

  // ---- Negative: wrong sessionId must 404 ----
  const wrongSessionRes = await fetch(
    `${baseUrl}/api/orders/${createdOrderId}?sessionId=cs_test_not_real`,
  );
  assert.equal(
    wrongSessionRes.status,
    404,
    "guest with wrong sessionId should get 404",
  );
});
