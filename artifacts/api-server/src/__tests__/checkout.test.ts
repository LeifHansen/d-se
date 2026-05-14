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
