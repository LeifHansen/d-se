import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, resetDb } from "./testDb";
import { cartItemsTable, cartsTable } from "@workspace/db";
import { makeApp, seedCart, seedDiscount, seedProduct } from "./helpers";

const cartRouter = (await import("../routes/cart")).default;

const app = makeApp((r) => {
  r.use(cartRouter);
});

describe("cart mutations", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("GET /cart returns an empty cart when none exists", async () => {
    const res = await request(app).get("/api/cart");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      items: [],
      subtotalCents: 0,
      totalCents: 0,
      discountCents: 0,
    });
    expect(typeof res.body.id).toBe("string");
  });

  it("POST /cart/items creates a cart and adds an item", async () => {
    const product = await seedProduct({ priceCents: 2_500, inventory: 10 });
    const res = await request(app)
      .post("/api/cart/items")
      .send({ productId: product.id, quantity: 2 });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].quantity).toBe(2);
    expect(res.body.subtotalCents).toBe(5_000);
    expect(res.body.totalCents).toBe(5_000);

    const dbItems = await db.select().from(cartItemsTable);
    expect(dbItems).toHaveLength(1);
    expect(dbItems[0].quantity).toBe(2);
  });

  it("POST /cart/items merges quantities for an existing line", async () => {
    const product = await seedProduct({ priceCents: 1_000 });
    const cartId = "cart-merge";
    await seedCart({ cartId, productId: product.id, quantity: 1 });

    const res = await request(app)
      .post("/api/cart/items")
      .send({ cartId, productId: product.id, quantity: 3 });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].quantity).toBe(4);
    expect(res.body.subtotalCents).toBe(4_000);
  });

  it("POST /cart/items returns 404 for an unknown product", async () => {
    const res = await request(app)
      .post("/api/cart/items")
      .send({ productId: 9_999, quantity: 1 });
    expect(res.status).toBe(404);
  });

  it("PATCH /cart/items/:itemId updates the quantity", async () => {
    const product = await seedProduct({ priceCents: 1_500 });
    const cartId = "cart-patch";
    await seedCart({ cartId, productId: product.id, quantity: 1 });
    const [item] = await db.select().from(cartItemsTable);

    const res = await request(app)
      .patch(`/api/cart/items/${item.id}`)
      .send({ cartId, quantity: 5 });
    expect(res.status).toBe(200);
    expect(res.body.items[0].quantity).toBe(5);
    expect(res.body.subtotalCents).toBe(7_500);
  });

  it("PATCH with quantity 0 removes the item", async () => {
    const product = await seedProduct({ priceCents: 1_500 });
    const cartId = "cart-patch-zero";
    await seedCart({ cartId, productId: product.id, quantity: 2 });
    const [item] = await db.select().from(cartItemsTable);

    const res = await request(app)
      .patch(`/api/cart/items/${item.id}`)
      .send({ cartId, quantity: 0 });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    const remaining = await db.select().from(cartItemsTable);
    expect(remaining).toHaveLength(0);
  });

  it("DELETE /cart/items/:itemId removes the line", async () => {
    const product = await seedProduct({ priceCents: 800 });
    const cartId = "cart-del";
    await seedCart({ cartId, productId: product.id, quantity: 3 });
    const [item] = await db.select().from(cartItemsTable);

    const res = await request(app)
      .delete(`/api/cart/items/${item.id}`)
      .query({ cartId });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.subtotalCents).toBe(0);
  });

  it("loadCart silently clears a discount that has become invalid", async () => {
    const product = await seedProduct({ priceCents: 5_000 });
    const discount = await seedDiscount({
      code: "EXPIRED",
      type: "percent",
      value: 10,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const cartId = "cart-bad-discount";
    await seedCart({
      cartId,
      productId: product.id,
      quantity: 1,
      discountCode: "EXPIRED",
      discountCodeId: discount.id,
    });

    const res = await request(app).get("/api/cart").query({ cartId });
    expect(res.status).toBe(200);
    expect(res.body.discountCode).toBeNull();
    expect(res.body.discountCents).toBe(0);

    const [cart] = await db
      .select()
      .from(cartsTable)
      .where(eq(cartsTable.id, cartId));
    expect(cart.discountCode).toBeNull();
    expect(cart.discountCodeId).toBeNull();
  });
});
