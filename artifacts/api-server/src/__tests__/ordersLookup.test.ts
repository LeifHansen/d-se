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

const ordersRouter = (await import("../routes/orders")).default;

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
});
