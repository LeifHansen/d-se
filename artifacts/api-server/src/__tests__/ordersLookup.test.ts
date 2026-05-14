import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { resetDb } from "./testDb";
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

async function createOrder(email: string): Promise<{ orderId: number }> {
  const product = await seedProduct({
    slug: `lookup-${Math.random().toString(36).slice(2, 8)}`,
    priceCents: 2_500,
  });
  const cartId = `cart-lookup-${Math.random().toString(36).slice(2, 8)}`;
  await seedCart({ cartId, productId: product.id, quantity: 1 });
  const res = await request(app)
    .post("/api/checkout")
    .send({ cartId, email });
  expect(res.status).toBe(200);
  return { orderId: res.body.orderId as number };
}

describe("POST /api/orders/lookup — guest order authorization", () => {
  beforeEach(async () => {
    await resetDb();
    __resetLookupRateLimitForTests();
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

  it("returns 404 for a non-existent order id", async () => {
    const res = await request(app)
      .post("/api/orders/lookup")
      .send({ orderId: 99_999, email: "buyer@example.com" });
    expect(res.status).toBe(404);
  });

  it("rejects requests that omit the email", async () => {
    const { orderId } = await createOrder("buyer@example.com");
    const res = await request(app)
      .post("/api/orders/lookup")
      .send({ orderId });
    expect(res.status).toBe(400);
  });

  it("throttles repeated failed lookups with a 429", async () => {
    const { orderId } = await createOrder("buyer@example.com");
    // 5 failed attempts are allowed (each returns 404), the 6th gets blocked.
    for (let i = 0; i < 5; i++) {
      const bad = await request(app)
        .post("/api/orders/lookup")
        .send({ orderId, email: `wrong-${i}@example.com` });
      expect(bad.status).toBe(404);
    }
    const blocked = await request(app)
      .post("/api/orders/lookup")
      .send({ orderId, email: "still-wrong@example.com" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeTruthy();

    // Even the *correct* email is blocked while the throttle is active —
    // the attacker can't bypass the limit by interleaving a guess with the
    // real email.
    const stillBlocked = await request(app)
      .post("/api/orders/lookup")
      .send({ orderId, email: "buyer@example.com" });
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
        .send({ orderId, email: `wrong-${i}@example.com` });
      expect(bad.status).toBe(404);
    }
    const blocked = await request(app)
      .post("/api/orders/lookup")
      .set("X-Forwarded-For", "203.0.113.99")
      .send({ orderId, email: "still-wrong@example.com" });
    expect(blocked.status).toBe(429);
  });

  it("does not throttle a successful lookup, and clears prior failures", async () => {
    const { orderId } = await createOrder("buyer@example.com");
    // A couple of typos shouldn't lock out the legitimate user.
    for (let i = 0; i < 3; i++) {
      const bad = await request(app)
        .post("/api/orders/lookup")
        .send({ orderId, email: `wrong-${i}@example.com` });
      expect(bad.status).toBe(404);
    }
    const ok = await request(app)
      .post("/api/orders/lookup")
      .send({ orderId, email: "buyer@example.com" });
    expect(ok.status).toBe(200);

    // After a success, the failure counter resets — the user can fat-finger
    // again later without being immediately throttled.
    for (let i = 0; i < 5; i++) {
      const bad = await request(app)
        .post("/api/orders/lookup")
        .send({ orderId, email: `wrong-again-${i}@example.com` });
      expect(bad.status).toBe(404);
    }
  });
});
