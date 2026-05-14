import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import discountsRouter from "../routes/discounts";
import { resetDb } from "./testDb";
import { makeApp, seedCart, seedDiscount, seedProduct } from "./helpers";

const app = makeApp((r) => {
  r.use(discountsRouter);
});

describe("POST /api/discounts/validate", () => {
  let cartId: string;

  beforeEach(async () => {
    await resetDb();
    const product = await seedProduct({ priceCents: 5_000 });
    cartId = "cart-test-1";
    await seedCart({ cartId, productId: product.id, quantity: 2 }); // subtotal 10000
  });

  it("returns valid for an active percent code", async () => {
    await seedDiscount({ code: "SAVE10", type: "percent", value: 10 });
    const res = await request(app)
      .post("/api/discounts/validate")
      .send({ cartId, code: "save10" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      valid: true,
      code: "SAVE10",
      type: "percent",
      value: 10,
      discountCents: 1000,
      subtotalCents: 10_000,
      totalCents: 9_000,
    });
  });

  it("rejects an expired code", async () => {
    await seedDiscount({
      code: "OLD",
      type: "percent",
      value: 20,
      expiresAt: new Date(Date.now() - 1000),
    });
    const res = await request(app)
      .post("/api/discounts/validate")
      .send({ cartId, code: "OLD" });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.reason).toMatch(/expired/i);
  });

  it("rejects an exhausted code (redemptions cap reached)", async () => {
    await seedDiscount({
      code: "USEDUP",
      maxRedemptions: 5,
      redemptionsCount: 5,
    });
    const res = await request(app)
      .post("/api/discounts/validate")
      .send({ cartId, code: "USEDUP" });
    expect(res.body.valid).toBe(false);
    expect(res.body.reason).toMatch(/redemption limit/i);
  });

  it("rejects when the cart is below the minimum subtotal", async () => {
    await seedDiscount({
      code: "BIGORDER",
      minSubtotalCents: 50_000,
    });
    const res = await request(app)
      .post("/api/discounts/validate")
      .send({ cartId, code: "BIGORDER" });
    expect(res.body.valid).toBe(false);
    expect(res.body.reason).toMatch(/at least \$500\.00/);
  });

  it("rejects an inactive code", async () => {
    await seedDiscount({ code: "OFF", active: false });
    const res = await request(app)
      .post("/api/discounts/validate")
      .send({ cartId, code: "OFF" });
    expect(res.body.valid).toBe(false);
    expect(res.body.reason).toMatch(/inactive/i);
  });

  it("rejects an unknown code", async () => {
    const res = await request(app)
      .post("/api/discounts/validate")
      .send({ cartId, code: "NOPE" });
    expect(res.body.valid).toBe(false);
    expect(res.body.reason).toMatch(/invalid/i);
  });
});
