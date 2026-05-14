import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, resetDb } from "./testDb";
import { ordersTable } from "@workspace/db";
import { makeApp, seedCart, seedProduct } from "./helpers";

vi.mock("../lib/stripe", () => ({
  getStripe: async () => ({}),
  isStripeConfigured: async () => false,
  getStripePublishableKey: async () => "pk_test",
}));

vi.mock("../lib/email", () => ({
  sendOrderConfirmation: vi.fn(async () => {}),
  sendAbandonedCartEmail: vi.fn(async () => {}),
  sendLowStockDigest: vi.fn(async () => {}),
  sendWelcomeEmail: vi.fn(async () => {}),
  STORE_NAME: "Test",
}));

vi.mock("../routes/shipping", () => ({
  computeShippingRates: async () => [],
}));

const ordersModule = await import("../routes/orders");
const ordersRouter = ordersModule.default;
const { __resetLookupRateLimitForTests } = ordersModule;

const app = makeApp((r) => {
  r.use(ordersRouter);
});

async function createOrder(email: string | null): Promise<{
  orderId: number;
  lookupToken: string;
}> {
  const product = await seedProduct({
    slug: `lookup-${Math.random().toString(36).slice(2, 8)}`,
    priceCents: 2_500,
  });
  const cartId = `cart-lookup-${Math.random().toString(36).slice(2, 8)}`;
  await seedCart({ cartId, productId: product.id, quantity: 1 });
  const res = await request(app)
    .post("/api/checkout")
    .send({ cartId, email: email ?? undefined });
  expect(res.status).toBe(200);
  const orderId = res.body.orderId as number;
  const [row] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));
  expect(row.lookupToken).toBeTruthy();
  return { orderId, lookupToken: row.lookupToken! };
}

describe("POST /api/orders/lookup — guest order authorization", () => {
  beforeEach(async () => {
    await resetDb();
    __resetLookupRateLimitForTests();
  });

  it("persists a non-null lookup_token on every new order", async () => {
    const { orderId, lookupToken } = await createOrder("buyer@example.com");
    expect(typeof lookupToken).toBe("string");
    expect(lookupToken.length).toBeGreaterThanOrEqual(32);

    // Sanity: a second order also gets a token, and tokens differ.
    const second = await createOrder("buyer2@example.com");
    expect(second.lookupToken).not.toBe(lookupToken);
    expect(second.orderId).not.toBe(orderId);
  });

  it("returns the order when the magic-link token matches", async () => {
    const { orderId, lookupToken } = await createOrder("buyer@example.com");
    const res = await request(app)
      .post("/api/orders/lookup")
      .send({ orderId, token: lookupToken });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(orderId);
    expect(res.body.email).toBe("buyer@example.com");
  });

  it("returns 404 when the token is wrong", async () => {
    const { orderId } = await createOrder("buyer@example.com");
    const res = await request(app)
      .post("/api/orders/lookup")
      .send({ orderId, token: "definitely-not-the-real-token-xxxxxxxxxx" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns the order when the email matches (case-insensitive)", async () => {
    const { orderId } = await createOrder("Buyer@Example.com");
    const res = await request(app)
      .post("/api/orders/lookup")
      .send({ orderId, email: "buyer@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(orderId);
  });

  it("returns 404 when the email does not match", async () => {
    const { orderId } = await createOrder("buyer@example.com");
    const res = await request(app)
      .post("/api/orders/lookup")
      .send({ orderId, email: "someone-else@example.com" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns 404 for a non-existent order id even with a valid-looking token", async () => {
    const res = await request(app)
      .post("/api/orders/lookup")
      .send({ orderId: 99_999, token: "anything" });
    expect(res.status).toBe(404);
  });

  it("rejects requests that supply neither email nor token", async () => {
    const { orderId } = await createOrder("buyer@example.com");
    const res = await request(app)
      .post("/api/orders/lookup")
      .send({ orderId });
    expect(res.status).toBe(400);
  });

  it("returns 410 with code lookup_token_expired when the token is older than the TTL", async () => {
    const { orderId, lookupToken } = await createOrder("buyer@example.com");
    // Backdate the token issuance well past the 90-day default TTL.
    const issuedAt = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    await db
      .update(ordersTable)
      .set({ lookupTokenIssuedAt: issuedAt })
      .where(eq(ordersTable.id, orderId));

    const res = await request(app)
      .post("/api/orders/lookup")
      .send({ orderId, token: lookupToken });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("lookup_token_expired");

    // Email-based lookup should still succeed for the same order.
    const emailRes = await request(app)
      .post("/api/orders/lookup")
      .send({ orderId, email: "buyer@example.com" });
    expect(emailRes.status).toBe(200);
    expect(emailRes.body.id).toBe(orderId);
  });

  it("records lookup_token_last_used_at on a successful token lookup", async () => {
    const { orderId, lookupToken } = await createOrder("buyer@example.com");
    const before = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));
    expect(before[0].lookupTokenLastUsedAt).toBeNull();

    const res = await request(app)
      .post("/api/orders/lookup")
      .send({ orderId, token: lookupToken });
    expect(res.status).toBe(200);

    const after = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));
    expect(after[0].lookupTokenLastUsedAt).toBeInstanceOf(Date);
  });

  it("throttles repeated failed lookups with a 429", async () => {
    const { orderId, lookupToken } = await createOrder("buyer@example.com");
    // 5 failed attempts are allowed (each returns 404), the 6th gets blocked.
    for (let i = 0; i < 5; i++) {
      const bad = await request(app)
        .post("/api/orders/lookup")
        .send({ orderId, token: `wrong-token-${i}-xxxxxxxxxxxxxxxxxxxxxxxx` });
      expect(bad.status).toBe(404);
    }
    const blocked = await request(app)
        .post("/api/orders/lookup")
        .send({ orderId, token: "still-wrong-xxxxxxxxxxxxxxxxxxxxxxxxxxxx" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeTruthy();

    // Even the *correct* token is blocked while the throttle is active —
    // the attacker can't bypass the limit by interleaving a guess with the
    // real token.
    const stillBlocked = await request(app)
      .post("/api/orders/lookup")
      .send({ orderId, token: lookupToken });
    expect(stillBlocked.status).toBe(429);
  });

  it("cannot be bypassed by spoofing the X-Forwarded-For header", async () => {
    // Without `trust proxy` configured, Express must ignore X-Forwarded-For
    // when computing req.ip. If the limiter trusted the header, an attacker
    // could rotate it per request to dodge the throttle entirely.
    const { orderId } = await createOrder("buyer@example.com");
    for (let i = 0; i < 5; i++) {
      const bad = await request(app)
        .post("/api/orders/lookup")
        .set("X-Forwarded-For", `203.0.113.${i}`)
        .send({ orderId, token: `wrong-token-${i}-xxxxxxxxxxxxxxxxxxxxxxxx` });
      expect(bad.status).toBe(404);
    }
    const blocked = await request(app)
      .post("/api/orders/lookup")
      .set("X-Forwarded-For", "203.0.113.99")
      .send({ orderId, token: "still-wrong-xxxxxxxxxxxxxxxxxxxxxxxxxxxx" });
    expect(blocked.status).toBe(429);
  });

  it("does not throttle a successful lookup, and clears prior failures", async () => {
    const { orderId, lookupToken } = await createOrder("buyer@example.com");
    // A couple of typos shouldn't lock out the legitimate user.
    for (let i = 0; i < 3; i++) {
      const bad = await request(app)
        .post("/api/orders/lookup")
        .send({ orderId, token: `wrong-token-${i}-xxxxxxxxxxxxxxxxxxxxxxxx` });
      expect(bad.status).toBe(404);
    }
    const ok = await request(app)
      .post("/api/orders/lookup")
      .send({ orderId, token: lookupToken });
    expect(ok.status).toBe(200);

    // After a success, the failure counter resets — the user can fat-finger
    // again later without being immediately throttled.
    for (let i = 0; i < 5; i++) {
      const bad = await request(app)
        .post("/api/orders/lookup")
        .send({ orderId, token: `wrong-again-${i}-xxxxxxxxxxxxxxxxxxxxxx` });
      expect(bad.status).toBe(404);
    }
  });

  it("cannot be bypassed by spoofing the X-Forwarded-For header", async () => {
    const { orderId } = await createOrder("buyer@example.com");
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/orders/lookup")
        .set("X-Forwarded-For", `1.2.3.${i}`)
        .send({ orderId, token: "wrong" });
      expect(res.status).toBe(404);
    }
    const blocked = await request(app)
      .post("/api/orders/lookup")
      .set("X-Forwarded-For", "1.2.3.99")
      .send({ orderId, token: "wrong" });
    expect(blocked.status).toBe(429);
  });
});
