import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, resetDb } from "./testDb";
import {
  abandonedCartsTable,
  discountCodesTable,
  ordersTable,
  orderItemsTable,
  cartsTable,
} from "@workspace/db";
import { makeApp, seedCart, seedDiscount, seedProduct } from "./helpers";

const stripeMock = vi.hoisted(() => {
  const constructEvent = vi.fn();
  return {
    stripe: { webhooks: { constructEvent } },
    constructEvent,
  };
});

vi.mock("../lib/stripe", () => ({
  getStripe: async () => stripeMock.stripe,
  isStripeConfigured: async () => true,
  getStripePublishableKey: async () => "pk_test",
}));

const emailMock = vi.hoisted(() => ({
  sendOrderConfirmation: vi.fn(async () => {}),
  sendAbandonedCartEmail: vi.fn(async () => {}),
}));

vi.mock("../lib/email", () => ({
  sendOrderConfirmation: emailMock.sendOrderConfirmation,
  sendAbandonedCartEmail: emailMock.sendAbandonedCartEmail,
  sendLowStockDigest: vi.fn(async () => {}),
  sendWelcomeEmail: vi.fn(async () => {}),
  STORE_NAME: "Test",
}));

vi.mock("../lib/metrics", () => ({
  recordStripeWebhookReceived: vi.fn(async () => {}),
}));

const webhooksRouter = (await import("../routes/webhooks")).default;

import express from "express";
const app = express();
app.use((req, _res, next) => {
  (req as unknown as { log: { warn: () => void; error: () => void; info: () => void } }).log = {
    warn: () => {},
    error: () => {},
    info: () => {},
  };
  next();
});
app.use("/api", webhooksRouter);

async function seedPendingOrder(opts: {
  cartId: string;
  productId: number;
  discountId: number;
  discountCode: string;
}): Promise<{ orderId: number; sessionId: string }> {
  const sessionId = "cs_test_999";
  const [order] = await db
    .insert(ordersTable)
    .values({
      email: "buyer@example.com",
      status: "pending",
      subtotalCents: 10_000,
      shippingCents: 500,
      taxCents: 0,
      discountCents: 1_000,
      discountCodeId: opts.discountId,
      discountCode: opts.discountCode,
      totalCents: 9_500,
      currency: "usd",
      cartId: opts.cartId,
      stripeSessionId: sessionId,
    })
    .returning();
  await db.insert(orderItemsTable).values({
    orderId: order.id,
    productId: opts.productId,
    productName: "Test Product",
    productImage: null,
    quantity: 2,
    priceCents: 5_000,
  });
  return { orderId: order.id, sessionId };
}

describe("POST /api/webhooks/stripe — checkout.session.completed", () => {
  beforeEach(async () => {
    await resetDb();
    stripeMock.constructEvent.mockReset();
    emailMock.sendOrderConfirmation.mockClear();
  });

  it("records discount/tax cents, increments redemptions, sends email, marks cart recovered", async () => {
    const product = await seedProduct({ priceCents: 5_000, inventory: 10 });
    const discount = await seedDiscount({
      code: "WELCOME10",
      type: "percent",
      value: 10,
    });
    const cartId = "cart-wh-1";
    await seedCart({
      cartId,
      productId: product.id,
      quantity: 2,
      email: "buyer@example.com",
    });
    await db
      .insert(abandonedCartsTable)
      .values({ cartId, email: "buyer@example.com" });
    const { orderId, sessionId } = await seedPendingOrder({
      cartId,
      productId: product.id,
      discountId: discount.id,
      discountCode: "WELCOME10",
    });

    stripeMock.constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          metadata: { orderId: String(orderId), cartId },
          payment_intent: "pi_test_1",
          customer_email: "buyer@example.com",
          amount_total: 10_330, // 9500 + 830 tax
          total_details: {
            amount_tax: 830,
            amount_discount: 1_000,
            amount_shipping: 500,
          },
        },
      },
    });

    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("stripe-signature", "t=1,v1=fake")
      .set("content-type", "application/json")
      .send(Buffer.from(JSON.stringify({ id: "evt_1" })));

    expect(res.status).toBe(200);

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));
    expect(order.status).toBe("paid");
    expect(order.taxCents).toBe(830);
    expect(order.discountCents).toBe(1_000);
    expect(order.totalCents).toBe(10_330);
    expect(order.stripePaymentIntentId).toBe("pi_test_1");

    const [updatedDiscount] = await db
      .select()
      .from(discountCodesTable)
      .where(eq(discountCodesTable.id, discount.id));
    expect(updatedDiscount.redemptionsCount).toBe(1);

    const [abandoned] = await db
      .select()
      .from(abandonedCartsTable)
      .where(eq(abandonedCartsTable.cartId, cartId));
    expect(abandoned.recoveredAt).not.toBeNull();
    expect(abandoned.recoveredOrderId).toBe(String(orderId));

    const [cart] = await db
      .select()
      .from(cartsTable)
      .where(eq(cartsTable.id, cartId));
    expect(cart.checkedOutAt).not.toBeNull();

    expect(emailMock.sendOrderConfirmation).toHaveBeenCalledTimes(1);
    const emailArg = emailMock.sendOrderConfirmation.mock.calls[0][0] as {
      to: string;
      discountCents: number;
      taxCents: number;
      discountCode: string | null;
    };
    expect(emailArg.to).toBe("buyer@example.com");
    expect(emailArg.discountCents).toBe(1_000);
    expect(emailArg.taxCents).toBe(830);
    expect(emailArg.discountCode).toBe("WELCOME10");
  });
});
