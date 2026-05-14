import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, resetDb } from "./testDb";
import {
  ordersTable,
  orderItemsTable,
  productReviewsTable,
} from "@workspace/db";
import { makeApp, seedProduct } from "./helpers";

import * as clerk from "@clerk/express";
const { __setAuth } = clerk as unknown as {
  __setAuth: (userId: string | null, user?: unknown) => void;
};

const reviewsRouter = (await import("../routes/reviews")).default;

const app = makeApp((r) => {
  r.use(reviewsRouter);
});

async function seedPaidOrder(opts: {
  userId: string;
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

describe("POST /api/products/:slug/reviews", () => {
  beforeEach(async () => {
    await resetDb();
    __setAuth(null);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const product = await seedProduct({ slug: "p1" });
    void product;
    const res = await request(app)
      .post("/api/products/p1/reviews")
      .send({ rating: 5, title: "Great", body: "Loved it" });
    expect(res.status).toBe(401);
  });

  it("rejects users who have not purchased the product with 403", async () => {
    await seedProduct({ slug: "p2" });
    __setAuth("user_no_purchase");
    const res = await request(app)
      .post("/api/products/p2/reviews")
      .send({ rating: 5, title: "Nice", body: "Looks good" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/verified/i);
  });

  it("creates a pending review for a verified buyer", async () => {
    const product = await seedProduct({ slug: "p3" });
    const userId = "user_buyer_1";
    await seedPaidOrder({ userId, productId: product.id });
    __setAuth(userId);

    const res = await request(app)
      .post("/api/products/p3/reviews")
      .send({ rating: 4, title: "Solid", body: "Good product" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    expect(res.body.verifiedPurchase).toBe(true);
    expect(res.body.rating).toBe(4);

    const rows = await db
      .select()
      .from(productReviewsTable)
      .where(eq(productReviewsTable.productId, product.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].verifiedPurchase).toBe(true);
    expect(rows[0].userId).toBe(userId);
  });

  it("does not count an unpaid order as a verified purchase", async () => {
    const product = await seedProduct({ slug: "p4" });
    const userId = "user_pending_1";
    await db.insert(ordersTable).values({
      userId,
      status: "pending",
      subtotalCents: 5_000,
      totalCents: 5_000,
    });
    const [pendingOrder] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.userId, userId));
    await db.insert(orderItemsTable).values({
      orderId: pendingOrder.id,
      productId: product.id,
      productName: "Test Product",
      quantity: 1,
      priceCents: 5_000,
    });
    __setAuth(userId);

    const res = await request(app)
      .post("/api/products/p4/reviews")
      .send({ rating: 5, title: "x", body: "y" });
    expect(res.status).toBe(403);
  });
});
