import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { resetDb } from "./testDb";
import { makeApp, seedCart, seedProduct } from "./helpers";

vi.mock("../lib/easypost", () => ({
  getEasyPost: () => ({}),
  isEasyPostConfigured: () => false,
  FROM_ADDRESS: {},
}));

const shippingRouter = (await import("../routes/shipping")).default;

const app = makeApp((r) => {
  r.use(shippingRouter);
});

const ADDRESS = {
  name: "Buyer",
  street1: "1 Main",
  city: "Town",
  state: "CA",
  zip: "90210",
  country: "US",
};

describe("POST /api/shipping/rates", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns 400 when the cart is empty", async () => {
    const res = await request(app)
      .post("/api/shipping/rates")
      .send({ cartId: "missing-cart", address: ADDRESS });
    expect(res.status).toBe(400);
  });

  it("returns deterministic flat rates that scale with item count when EasyPost is not configured", async () => {
    const product = await seedProduct({ priceCents: 1_000 });
    const cartId = "cart-ship-1";
    await seedCart({ cartId, productId: product.id, quantity: 3 });

    const res = await request(app)
      .post("/api/shipping/rates")
      .send({ cartId, address: ADDRESS });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);

    const standard = res.body.find(
      (r: { id: string }) => r.id === "flat-standard",
    );
    const express = res.body.find(
      (r: { id: string }) => r.id === "flat-express",
    );
    expect(standard).toBeDefined();
    expect(express).toBeDefined();
    // Standard: 595 + 3 * 100 = 895
    expect(standard.amountCents).toBe(895);
    // Express: 1495 + 3 * 150 = 1945
    expect(express.amountCents).toBe(1945);
    expect(standard.currency).toBe("usd");
  });

  it("returns 400 for a malformed address", async () => {
    const product = await seedProduct({ priceCents: 1_000 });
    const cartId = "cart-ship-bad-addr";
    await seedCart({ cartId, productId: product.id });
    const res = await request(app)
      .post("/api/shipping/rates")
      .send({ cartId, address: { name: "Buyer" } });
    expect(res.status).toBe(400);
  });
});
