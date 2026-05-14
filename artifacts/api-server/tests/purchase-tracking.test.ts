import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

process.env.NODE_ENV = "test";
process.env.DISABLE_ABANDONED_CART = "1";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret_for_purchase_tracking";
process.env.GA4_ID = "G-TEST123";
process.env.GA4_API_SECRET = "ga4-secret-test";
process.env.META_PIXEL_ID = "1234567890";
process.env.META_CAPI_TOKEN = "meta-capi-token-test";
process.env.REPLIT_CONNECTORS_HOSTNAME = "connectors.test.invalid";
if (!process.env.REPL_IDENTITY) process.env.REPL_IDENTITY = "test-identity";
if (!process.env.PORT) process.env.PORT = "0";
if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = "test-session-secret";
// Force flat-rate shipping codepath: never let the test hit a real EasyPost.
delete process.env.EASYPOST_API_KEY;

type CapturedCall = { url: string; body: unknown };
const ga4Calls: CapturedCall[] = [];
const metaCalls: CapturedCall[] = [];

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  // Replit connector fetch — return canned Stripe creds.
  if (url.includes("connectors.test.invalid")) {
    if (url.includes("connector_names=stripe")) {
      return new Response(
        JSON.stringify({
          items: [
            {
              settings: {
                publishable: "pk_test_dummy",
                secret: "sk_test_dummy",
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    // Resend / anything else: empty items so callers no-op gracefully.
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (url.startsWith("https://www.google-analytics.com/mp/collect")) {
    let body: unknown = null;
    try {
      body = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      body = init?.body;
    }
    ga4Calls.push({ url, body });
    return new Response("", { status: 204 });
  }

  if (url.startsWith("https://graph.facebook.com/")) {
    let body: unknown = null;
    try {
      body = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      body = init?.body;
    }
    metaCalls.push({ url, body });
    return new Response(JSON.stringify({ events_received: 1 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Pass through localhost (the test server itself).
  return realFetch(input as Parameters<typeof realFetch>[0], init);
}) as typeof fetch;

// ---------------------------------------------------------------------------
// Mock Stripe API server. Stripe's Node SDK uses node:http, not fetch, so we
// stand up a local HTTP server and redirect every Stripe instance to it via a
// prototype-level monkey-patch on _getPropsFromConfig.
// ---------------------------------------------------------------------------
const stripeApiCalls: Array<{
  method: string;
  path: string;
  body: Record<string, string>;
}> = [];

function parseFormBody(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of raw.split("&")) {
    if (!pair) continue;
    const [k, v = ""] = pair.split("=");
    out[decodeURIComponent(k.replace(/\+/g, " "))] = decodeURIComponent(
      v.replace(/\+/g, " "),
    );
  }
  return out;
}

const stripeMockHandler = async (req: IncomingMessage, res: ServerResponse) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  const body = parseFormBody(raw);
  stripeApiCalls.push({
    method: req.method ?? "GET",
    path: req.url ?? "",
    body,
  });

  if (req.method === "POST" && req.url === "/v1/checkout/sessions") {
    const id = `cs_test_mock_${stripeApiCalls.length}_${Date.now()}`;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id,
        object: "checkout.session",
        url: `https://checkout.stripe.test/${id}`,
        payment_status: "unpaid",
        status: "open",
        livemode: false,
        metadata: Object.fromEntries(
          Object.entries(body).filter(([k]) => k.startsWith("metadata[")),
        ),
      }),
    );
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { message: `unmocked ${req.method} ${req.url}` } }));
};

const stripeMockServer = createServer((req, res) => {
  void stripeMockHandler(req, res).catch((err) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: String(err) } }));
  });
});
stripeMockServer.listen(0, "127.0.0.1");
await new Promise<void>((resolve) =>
  stripeMockServer.once("listening", () => resolve()),
);
const stripeMockPort = (stripeMockServer.address() as AddressInfo).port;

const Stripe = (await import("stripe")).default;
type StripeProto = {
  _getPropsFromConfig: (config: unknown) => Record<string, unknown>;
};
const proto = (Stripe as unknown as { prototype: StripeProto }).prototype;
const originalGetProps = proto._getPropsFromConfig;
proto._getPropsFromConfig = function patched(config: unknown) {
  const props = originalGetProps.call(this, config);
  return {
    ...props,
    host: "127.0.0.1",
    port: stripeMockPort,
    protocol: "http",
    maxNetworkRetries: 0,
  };
};

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

const stripe = new Stripe("sk_test_dummy");

function buildSignedRequest(payloadObj: unknown) {
  const payload = JSON.stringify(payloadObj);
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
  return { payload, header };
}

test("POST /api/checkout → Stripe webhook: analytics persist, GA4+Meta fire, redelivery is idempotent", async (t) => {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Seed catalog + cart so /api/checkout has something real to convert.
  const slug = `test-widget-${Date.now()}`;
  const [product] = await db
    .insert(productsTable)
    .values({
      slug,
      name: "Test Widget",
      description: "End-to-end test product",
      priceCents: 1999,
      currency: "usd",
      images: ["https://example.test/widget.png"],
      inventory: 10,
      published: true,
    })
    .returning();

  const cartId = `cart-test-${Date.now()}`;
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
      proto._getPropsFromConfig = originalGetProps;
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await new Promise<void>((resolve) =>
        stripeMockServer.close(() => resolve()),
      );
      await pool.end();
    }
  });

  // ---- Drive the real /api/checkout route ----
  const checkoutBody = {
    cartId,
    email: "buyer@example.com",
    address: {
      name: "Test Buyer",
      street1: "123 Test St",
      city: "Testville",
      state: "CA",
      zip: "94000",
      country: "US",
    },
    shippingRateId: "flat-standard",
    analyticsEventId: "evt-from-checkout-abc",
    analyticsClientId: "GA1.1.111.222",
    analyticsFbp: "fb.1.1700000000000.1234567890",
    analyticsFbc: "fb.1.1700000000000.IwAR_test",
  };
  const checkoutRes = await fetch(`${baseUrl}/api/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (TestRunner)",
      "X-Forwarded-For": "203.0.113.42",
    },
    body: JSON.stringify(checkoutBody),
  });
  assert.equal(checkoutRes.status, 200, "checkout should succeed");
  const checkoutJson = (await checkoutRes.json()) as {
    url: string;
    orderId: number;
  };
  assert.ok(checkoutJson.orderId, "orderId returned");
  createdOrderId = checkoutJson.orderId;
  assert.match(
    checkoutJson.url,
    /^https:\/\/checkout\.stripe\.test\//,
    "checkout url comes from mock Stripe",
  );

  // Assert Stripe SDK was called with our metadata (analyticsEventId, orderId).
  const sessionCall = stripeApiCalls.find(
    (c) => c.method === "POST" && c.path === "/v1/checkout/sessions",
  );
  assert.ok(sessionCall, "Stripe checkout.sessions.create was invoked");
  assert.equal(
    sessionCall.body["metadata[orderId]"],
    String(createdOrderId),
    "metadata.orderId echoed to Stripe",
  );
  assert.equal(
    sessionCall.body["metadata[analyticsEventId]"],
    "evt-from-checkout-abc",
    "metadata.analyticsEventId echoed to Stripe",
  );
  assert.equal(
    sessionCall.body["metadata[cartId]"],
    cartId,
    "metadata.cartId echoed to Stripe",
  );

  // Read the order row written by /api/checkout — analytics columns and the
  // stripeSessionId must be persisted by the real route, not test seed data.
  const [orderRow] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, createdOrderId));
  assert.ok(orderRow, "order row exists");
  assert.equal(orderRow.status, "pending");
  assert.equal(orderRow.email, "buyer@example.com");
  assert.equal(orderRow.cartId, cartId);
  assert.equal(orderRow.subtotalCents, 1999 * 2);
  assert.equal(orderRow.shippingCents, 595 + 2 * 100); // flat-standard formula
  assert.equal(orderRow.totalCents, orderRow.subtotalCents + orderRow.shippingCents);
  assert.ok(
    orderRow.stripeSessionId && orderRow.stripeSessionId.startsWith("cs_test_mock_"),
    "stripeSessionId persisted from Stripe response",
  );
  assert.equal(orderRow.analyticsEventId, "evt-from-checkout-abc");
  assert.equal(orderRow.analyticsClientId, "GA1.1.111.222");
  assert.equal(orderRow.analyticsFbp, "fb.1.1700000000000.1234567890");
  assert.equal(orderRow.analyticsFbc, "fb.1.1700000000000.IwAR_test");
  assert.equal(orderRow.analyticsClientIp, "203.0.113.42");
  assert.equal(orderRow.analyticsUserAgent, "Mozilla/5.0 (TestRunner)");
  assert.equal(orderRow.purchaseTrackedAt, null, "not yet tracked pre-webhook");

  // ---- Build a Stripe-signed checkout.session.completed event for that session ----
  const sessionId = orderRow.stripeSessionId!;
  const event = {
    id: `evt_test_${createdOrderId}`,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type: "checkout.session.completed",
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        metadata: {
          orderId: String(createdOrderId),
          cartId,
          analyticsEventId: "evt-from-checkout-abc",
        },
        payment_intent: `pi_test_${createdOrderId}`,
        customer_email: "buyer@example.com",
        customer_details: { email: "buyer@example.com" },
        amount_total: orderRow.totalCents,
        total_details: {
          amount_tax: 0,
          amount_discount: 0,
          amount_shipping: orderRow.shippingCents,
        },
      },
    },
  };

  // ---- First delivery ----
  const { payload, header } = buildSignedRequest(event);
  const res1 = await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": header,
    },
    body: payload,
  });
  assert.equal(res1.status, 200, "first webhook delivery should return 200");
  const body1 = (await res1.json()) as { received?: boolean };
  assert.equal(body1.received, true);

  const [updated] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, createdOrderId));

  assert.equal(updated.status, "paid", "order should be marked paid");
  assert.equal(updated.email, "buyer@example.com");
  assert.equal(updated.stripePaymentIntentId, `pi_test_${createdOrderId}`);
  assert.ok(updated.purchaseTrackedAt instanceof Date, "purchaseTrackedAt set");
  const firstTrackedAt = updated.purchaseTrackedAt!.getTime();

  // Analytics columns survived from /api/checkout through the webhook update.
  assert.equal(updated.analyticsEventId, "evt-from-checkout-abc");
  assert.equal(updated.analyticsClientId, "GA1.1.111.222");
  assert.equal(updated.analyticsFbp, "fb.1.1700000000000.1234567890");
  assert.equal(updated.analyticsFbc, "fb.1.1700000000000.IwAR_test");
  assert.equal(updated.analyticsClientIp, "203.0.113.42");
  assert.equal(updated.analyticsUserAgent, "Mozilla/5.0 (TestRunner)");

  // GA4 MP fired with the expected payload.
  assert.equal(ga4Calls.length, 1, "GA4 MP should fire exactly once");
  const ga = ga4Calls[0];
  assert.match(ga.url, /measurement_id=G-TEST123/);
  assert.match(ga.url, /api_secret=ga4-secret-test/);
  const gaBody = ga.body as {
    client_id: string;
    events: Array<{
      name: string;
      params: {
        transaction_id: string;
        value: number;
        currency: string;
        items: Array<{
          item_id: string;
          item_name: string;
          quantity: number;
          price: number;
        }>;
      };
    }>;
  };
  assert.equal(gaBody.client_id, "GA1.1.111.222");
  assert.equal(gaBody.events[0].name, "purchase");
  assert.equal(gaBody.events[0].params.transaction_id, String(createdOrderId));
  assert.equal(
    gaBody.events[0].params.value,
    Math.round(orderRow.totalCents) / 100,
  );
  assert.equal(gaBody.events[0].params.currency, "USD");
  assert.deepEqual(
    gaBody.events[0].params.items.map((i) => ({
      item_id: i.item_id,
      item_name: i.item_name,
      quantity: i.quantity,
      price: i.price,
    })),
    [
      {
        item_id: String(product.id),
        item_name: "Test Widget",
        quantity: 2,
        price: 19.99,
      },
    ],
  );

  // Meta CAPI fired with expected payload (including hashed email + fbp/fbc).
  assert.equal(metaCalls.length, 1, "Meta CAPI should fire exactly once");
  const meta = metaCalls[0];
  assert.match(meta.url, /\/1234567890\/events/);
  assert.match(meta.url, /access_token=meta-capi-token-test/);
  const metaBody = meta.body as {
    data: Array<{
      event_name: string;
      event_id: string;
      action_source: string;
      user_data: {
        em?: string[];
        fbp?: string;
        fbc?: string;
        client_ip_address?: string;
        client_user_agent?: string;
      };
      custom_data: {
        currency: string;
        value: number;
        order_id: string;
        contents: Array<{ id: string; quantity: number; item_price: number }>;
        content_type: string;
      };
    }>;
  };
  const ev = metaBody.data[0];
  assert.equal(ev.event_name, "Purchase");
  assert.equal(ev.action_source, "website");
  assert.equal(ev.event_id, "evt-from-checkout-abc");
  const expectedEmailHash = createHash("sha256")
    .update("buyer@example.com")
    .digest("hex");
  assert.deepEqual(ev.user_data.em, [expectedEmailHash]);
  assert.equal(ev.user_data.fbp, "fb.1.1700000000000.1234567890");
  assert.equal(ev.user_data.fbc, "fb.1.1700000000000.IwAR_test");
  assert.equal(ev.user_data.client_ip_address, "203.0.113.42");
  assert.equal(ev.user_data.client_user_agent, "Mozilla/5.0 (TestRunner)");
  assert.equal(ev.custom_data.currency, "USD");
  assert.equal(ev.custom_data.value, Math.round(orderRow.totalCents) / 100);
  assert.equal(ev.custom_data.order_id, String(createdOrderId));
  assert.equal(ev.custom_data.content_type, "product");
  assert.deepEqual(ev.custom_data.contents, [
    { id: String(product.id), quantity: 2, item_price: 19.99 },
  ]);

  // ---- Re-delivery (idempotency) ----
  const ga4Before = ga4Calls.length;
  const metaBefore = metaCalls.length;

  const redelivery = buildSignedRequest(event);
  const res2 = await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": redelivery.header,
    },
    body: redelivery.payload,
  });
  assert.equal(res2.status, 200, "redelivery should still return 200");

  const [afterRedelivery] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, createdOrderId));

  // purchaseTrackedAt timestamp must be unchanged (no double-fire).
  assert.equal(
    afterRedelivery.purchaseTrackedAt!.getTime(),
    firstTrackedAt,
    "purchaseTrackedAt must not change on redelivery",
  );
  assert.equal(afterRedelivery.status, "paid");
  assert.equal(
    ga4Calls.length,
    ga4Before,
    "GA4 must not fire on idempotent redelivery",
  );
  assert.equal(
    metaCalls.length,
    metaBefore,
    "Meta CAPI must not fire on idempotent redelivery",
  );
});
