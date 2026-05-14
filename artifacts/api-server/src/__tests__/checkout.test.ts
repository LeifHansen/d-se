import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, resetDb } from "./testDb";
import { discountCodesTable, ordersTable } from "@workspace/db";
import { makeApp, seedCart, seedDiscount, seedProduct } from "./helpers";

const stripeMock = vi.hoisted(() => {
  const sessionsCreate = vi.fn(async (params: unknown) => ({
    id: "cs_test_123",
    url: "https://stripe.test/checkout/cs_test_123",
    _params: params,
  }));
  const couponsCreate = vi.fn(async (_p: unknown) => ({ id: "coup_test_1" }));
  const promotionCodesCreate = vi.fn(async (_p: unknown) => ({
    id: "promo_test_1",
  }));
  const stripe = {
    checkout: { sessions: { create: sessionsCreate } },
    coupons: { create: couponsCreate },
    promotionCodes: { create: promotionCodesCreate },
  };
  return { stripe, sessionsCreate, couponsCreate, promotionCodesCreate };
});

vi.mock("../lib/stripe", () => ({
  getStripe: async () => stripeMock.stripe,
  isStripeConfigured: async () => true,
  getStripePublishableKey: async () => "pk_test",
}));

vi.mock("../lib/email", () => ({
  sendOrderConfirmation: vi.fn(async () => {}),
  sendAbandonedCartEmail: vi.fn(async () => {}),
  sendLowStockDigest: vi.fn(async () => {}),
  sendWelcomeEmail: vi.fn(async () => {}),
  STORE_NAME: "Test",
}));

vi.mock("./shipping", () => ({
  computeShippingRates: async () => [],
}));

const ordersRouter = (await import("../routes/orders")).default;

const app = makeApp((r) => {
  r.use(ordersRouter);
});

describe("POST /api/checkout — Stripe promotion code attachment", () => {
  beforeEach(async () => {
    await resetDb();
    stripeMock.sessionsCreate.mockClear();
    stripeMock.couponsCreate.mockClear();
    stripeMock.promotionCodesCreate.mockClear();
  });

  it("attaches a Stripe promotion code when a valid discount is on the cart", async () => {
    const product = await seedProduct({ priceCents: 5_000 });
    const discount = await seedDiscount({
      code: "WELCOME10",
      type: "percent",
      value: 10,
    });
    const cartId = "cart-checkout-1";
    await seedCart({
      cartId,
      productId: product.id,
      quantity: 2,
      discountCode: "WELCOME10",
      discountCodeId: discount.id,
    });

    const res = await request(app)
      .post("/api/checkout")
      .send({
        cartId,
        email: "buyer@example.com",
        shippingRateId: "",
        address: {
          name: "Buyer",
          street1: "1 Main",
          city: "Town",
          state: "CA",
          zip: "90210",
          country: "US",
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.url).toContain("stripe.test");
    expect(stripeMock.couponsCreate).toHaveBeenCalledTimes(1);
    expect(stripeMock.promotionCodesCreate).toHaveBeenCalledTimes(1);
    expect(stripeMock.sessionsCreate).toHaveBeenCalledTimes(1);
    const params = stripeMock.sessionsCreate.mock.calls[0][0] as {
      discounts?: Array<{ promotion_code: string }>;
      metadata?: Record<string, string>;
    };
    expect(params.discounts).toEqual([{ promotion_code: "promo_test_1" }]);
    expect(params.metadata?.discountCode).toBe("WELCOME10");

    // Order is created with the discount applied to total.
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, res.body.orderId));
    expect(order.discountCents).toBe(1_000);
    expect(order.totalCents).toBe(9_000);
    expect(order.discountCode).toBe("WELCOME10");

    // The Stripe IDs are persisted on the discount row for reuse.
    const [savedDiscount] = await db
      .select()
      .from(discountCodesTable)
      .where(eq(discountCodesTable.id, discount.id));
    expect(savedDiscount.stripeCouponId).toBe("coup_test_1");
    expect(savedDiscount.stripePromotionCodeId).toBe("promo_test_1");
  });
});

describe("POST /api/checkout — no-address handoff", () => {
  beforeEach(async () => {
    await resetDb();
    stripeMock.sessionsCreate.mockClear();
    stripeMock.couponsCreate.mockClear();
    stripeMock.promotionCodesCreate.mockClear();
  });

  it("returns a Stripe session URL when the cart hands off without an address", async () => {
    const product = await seedProduct({ priceCents: 4_200 });
    const cartId = "cart-no-address";
    await seedCart({ cartId, productId: product.id, quantity: 1 });

    const res = await request(app).post("/api/checkout").send({ cartId });

    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://stripe.test/checkout/cs_test_123");
    expect(typeof res.body.orderId).toBe("number");
    expect(stripeMock.sessionsCreate).toHaveBeenCalledTimes(1);

    const params = stripeMock.sessionsCreate.mock.calls[0][0] as {
      shipping_address_collection?: { allowed_countries: string[] };
      success_url: string;
      cancel_url: string;
      line_items: unknown[];
    };
    // Without a client-supplied address, Stripe Checkout must collect one.
    expect(params.shipping_address_collection?.allowed_countries).toEqual(
      expect.arrayContaining(["US"]),
    );
    expect(params.success_url).toContain(`orderId=${res.body.orderId}`);
    expect(params.line_items).toHaveLength(1);

    // Order is persisted with shippingCents=0 (Stripe collects address).
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, res.body.orderId));
    expect(order.shippingCents).toBe(0);
    expect(order.shippingAddress).toBeNull();
    expect(order.stripeSessionId).toBe("cs_test_123");
  });

  it("preserves a discount persisted on the cart even when the request omits one", async () => {
    const product = await seedProduct({ priceCents: 5_000 });
    const discount = await seedDiscount({
      code: "STAY10",
      type: "percent",
      value: 10,
    });
    const cartId = "cart-no-address-discount";
    await seedCart({
      cartId,
      productId: product.id,
      quantity: 2,
      discountCode: "STAY10",
      discountCodeId: discount.id,
    });

    // Body intentionally omits discountCode — should fall back to the cart's.
    const res = await request(app).post("/api/checkout").send({ cartId });

    expect(res.status).toBe(200);
    expect(res.body.url).toContain("stripe.test");

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, res.body.orderId));
    expect(order.discountCode).toBe("STAY10");
    expect(order.discountCents).toBe(1_000);
    expect(order.totalCents).toBe(9_000);

    const params = stripeMock.sessionsCreate.mock.calls[0][0] as {
      discounts?: Array<{ promotion_code: string }>;
      metadata?: Record<string, string>;
    };
    expect(params.discounts).toEqual([{ promotion_code: "promo_test_1" }]);
    expect(params.metadata?.discountCode).toBe("STAY10");
  });

  it("rejects a shippingRateId when no address is supplied", async () => {
    const product = await seedProduct({ priceCents: 1_500 });
    const cartId = "cart-rate-no-address";
    await seedCart({ cartId, productId: product.id, quantity: 1 });

    const res = await request(app)
      .post("/api/checkout")
      .send({ cartId, shippingRateId: "usps_priority" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/address/i);
    // Must not have created a Stripe session for an invalid request.
    expect(stripeMock.sessionsCreate).not.toHaveBeenCalled();
    // Must not have persisted an order either.
    const orders = await db.select().from(ordersTable);
    expect(orders).toHaveLength(0);
  });
});
