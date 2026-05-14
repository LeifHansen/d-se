import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { db, resetDb } from "./testDb";
import { ordersTable, orderItemsTable } from "@workspace/db";
import { makeApp, seedProduct } from "./helpers";

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

import * as clerk from "@clerk/express";
const { __setAuth } = clerk as unknown as {
  __setAuth: (userId: string | null, user?: unknown) => void;
};

const ordersRouter = (await import("../routes/orders")).default;

const app = makeApp((r) => {
  r.use(ordersRouter);
});

async function seedOrder(opts: {
  userId: string | null;
  productId: number;
}): Promise<number> {
  const [order] = await db
    .insert(ordersTable)
    .values({
      userId: opts.userId,
      email: "buyer@example.com",
      status: "paid",
      subtotalCents: 5_000,
      totalCents: 5_000,
      currency: "usd",
    })
    .returning();
  await db.insert(orderItemsTable).values({
    orderId: order.id,
    productId: opts.productId,
    productName: "Test Product",
    quantity: 1,
    priceCents: 5_000,
  });
  return order.id;
}

describe("GET /api/orders/:id", () => {
  beforeEach(async () => {
    await resetDb();
    __setAuth(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/orders/1");
    expect(res.status).toBe(401);
  });

  it("returns 404 for an order owned by another user (no leak)", async () => {
    const product = await seedProduct({ slug: "p-orders-1" });
    const orderId = await seedOrder({
      userId: "user_owner",
      productId: product.id,
    });
    __setAuth("user_intruder");

    const res = await request(app).get(`/api/orders/${orderId}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for an order that does not exist", async () => {
    __setAuth("user_anyone");
    const res = await request(app).get("/api/orders/9999");
    expect(res.status).toBe(404);
  });

  it("returns the order to its owner", async () => {
    const product = await seedProduct({ slug: "p-orders-2" });
    const orderId = await seedOrder({
      userId: "user_owner_2",
      productId: product.id,
    });
    __setAuth("user_owner_2");

    const res = await request(app).get(`/api/orders/${orderId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(orderId);
    expect(res.body.status).toBe("paid");
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].productId).toBe(product.id);
  });
});

describe("GET /api/orders/me", () => {
  beforeEach(async () => {
    await resetDb();
    __setAuth(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/orders/me");
    expect(res.status).toBe(401);
  });

  it("only returns the signed-in user's orders", async () => {
    const product = await seedProduct({ slug: "p-orders-me" });
    await seedOrder({ userId: "user_a", productId: product.id });
    await seedOrder({ userId: "user_b", productId: product.id });
    __setAuth("user_a");

    const res = await request(app).get("/api/orders/me");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
  });
});
