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
  productsTable,
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
  sendOrderConfirmation: vi.fn(async (_arg: unknown) => {}),
  sendAbandonedCartEmail: vi.fn(async (_arg: unknown) => {}),
  sendDeliveryEmail: vi.fn(async (_arg: unknown) => {}),
}));

vi.mock("../lib/email", () => ({
  sendOrderConfirmation: emailMock.sendOrderConfirmation,
  sendAbandonedCartEmail: emailMock.sendAbandonedCartEmail,
  sendDeliveryEmail: emailMock.sendDeliveryEmail,
  sendLowStockDigest: vi.fn(async () => {}),
  sendWelcomeEmail: vi.fn(async () => {}),
  buildTrackingUrl: (carrier: string | null, code: string | null) =>
    code ? `https://track.example/${carrier ?? ""}/${code}` : null,
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
  sessionId?: string;
  shippingAddress?: {
    name: string;
    street1: string;
    street2?: string | null;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone?: string | null;
  } | null;
}): Promise<{ orderId: number; sessionId: string }> {
  const sessionId = opts.sessionId ?? "cs_test_999";
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
      shippingAddress: opts.shippingAddress ?? null,
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
    emailMock.sendDeliveryEmail.mockClear();
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
      id: "evt_1",
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
    const emailArg = emailMock.sendOrderConfirmation.mock.calls[0]![0] as {
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

  it("decrements product inventory atomically by each line's quantity when the order is paid", async () => {
    const product = await seedProduct({ priceCents: 5_000, inventory: 10 });
    const discount = await seedDiscount({
      code: "WELCOME10",
      type: "percent",
      value: 10,
    });
    const cartId = "cart-wh-inv";
    await seedCart({
      cartId,
      productId: product.id,
      quantity: 2,
      email: "buyer@example.com",
    });
    const { orderId, sessionId } = await seedPendingOrder({
      cartId,
      productId: product.id,
      discountId: discount.id,
      discountCode: "WELCOME10",
      sessionId: "cs_test_inv_1",
    });

    stripeMock.constructEvent.mockReturnValue({
      id: "evt_inv_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          metadata: { orderId: String(orderId), cartId },
          payment_intent: "pi_test_inv_1",
          customer_email: "buyer@example.com",
          amount_total: 9_500,
          total_details: {
            amount_tax: 0,
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
      .send(Buffer.from(JSON.stringify({ id: "evt_inv_1" })));
    expect(res.status).toBe(200);

    const [p] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, product.id));
    expect(p.inventory).toBe(8);
  });

  it("clamps inventory at zero when concurrent paid orders exceed available stock", async () => {
    const product = await seedProduct({ priceCents: 5_000, inventory: 1 });
    const discount = await seedDiscount({
      code: "WELCOME10",
      type: "percent",
      value: 10,
    });
    // Two concurrent orders each claiming 2 units of a product with stock 1.
    const cartA = "cart-wh-clamp-a";
    const cartB = "cart-wh-clamp-b";
    await seedCart({ cartId: cartA, productId: product.id, quantity: 2 });
    await seedCart({ cartId: cartB, productId: product.id, quantity: 2 });
    const a = await seedPendingOrder({
      cartId: cartA,
      productId: product.id,
      discountId: discount.id,
      discountCode: "WELCOME10",
      sessionId: "cs_test_clamp_a",
    });
    const b = await seedPendingOrder({
      cartId: cartB,
      productId: product.id,
      discountId: discount.id,
      discountCode: "WELCOME10",
      sessionId: "cs_test_clamp_b",
    });

    for (const [evtId, ord] of [
      ["evt_clamp_a", a],
      ["evt_clamp_b", b],
    ] as const) {
      stripeMock.constructEvent.mockReturnValueOnce({
        id: evtId,
        type: "checkout.session.completed",
        data: {
          object: {
            id: ord.sessionId,
            metadata: { orderId: String(ord.orderId) },
            payment_intent: `pi_${evtId}`,
            customer_email: "buyer@example.com",
            amount_total: 9_500,
            total_details: {
              amount_tax: 0,
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
        .send(Buffer.from(JSON.stringify({ id: evtId })));
      expect(res.status).toBe(200);
    }

    const [p] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, product.id));
    expect(p.inventory).toBe(0);
  });

  it("restores inventory and flips order to refunded on charge.refunded (full refund)", async () => {
    const product = await seedProduct({ priceCents: 5_000, inventory: 10 });
    const discount = await seedDiscount({
      code: "WELCOME10",
      type: "percent",
      value: 10,
    });
    const cartId = "cart-wh-refund";
    await seedCart({ cartId, productId: product.id, quantity: 2 });
    const { orderId, sessionId } = await seedPendingOrder({
      cartId,
      productId: product.id,
      discountId: discount.id,
      discountCode: "WELCOME10",
      sessionId: "cs_test_refund_1",
    });

    // First, drive the order to paid (decrements inventory to 8).
    stripeMock.constructEvent.mockReturnValueOnce({
      id: "evt_refund_pay",
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          metadata: { orderId: String(orderId), cartId },
          payment_intent: "pi_refund_1",
          customer_email: "buyer@example.com",
          amount_total: 9_500,
          total_details: {
            amount_tax: 0,
            amount_discount: 1_000,
            amount_shipping: 500,
          },
        },
      },
    });
    await request(app)
      .post("/api/webhooks/stripe")
      .set("stripe-signature", "t=1,v1=fake")
      .set("content-type", "application/json")
      .send(Buffer.from(JSON.stringify({ id: "evt_refund_pay" })));

    const [afterPay] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, product.id));
    expect(afterPay.inventory).toBe(8);

    // Now deliver a charge.refunded full refund event.
    stripeMock.constructEvent.mockReturnValueOnce({
      id: "evt_refund_full",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_refund_1",
          payment_intent: "pi_refund_1",
          refunded: true,
          amount: 9_500,
          amount_refunded: 9_500,
        },
      },
    });
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("stripe-signature", "t=1,v1=fake")
      .set("content-type", "application/json")
      .send(Buffer.from(JSON.stringify({ id: "evt_refund_full" })));
    expect(res.status).toBe(200);

    const [p] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, product.id));
    expect(p.inventory).toBe(10);
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));
    expect(order.status).toBe("refunded");

    // Idempotent: a redelivery of the same event must not double-restore.
    stripeMock.constructEvent.mockReturnValueOnce({
      id: "evt_refund_full",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_refund_1",
          payment_intent: "pi_refund_1",
          refunded: true,
          amount: 9_500,
          amount_refunded: 9_500,
        },
      },
    });
    await request(app)
      .post("/api/webhooks/stripe")
      .set("stripe-signature", "t=1,v1=fake")
      .set("content-type", "application/json")
      .send(Buffer.from(JSON.stringify({ id: "evt_refund_full" })));
    const [pAgain] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, product.id));
    expect(pAgain.inventory).toBe(10);
  });

  it("restores inventory and marks order payment_failed when async payment later fails", async () => {
    const product = await seedProduct({ priceCents: 5_000, inventory: 10 });
    const discount = await seedDiscount({
      code: "WELCOME10",
      type: "percent",
      value: 10,
    });
    const cartId = "cart-wh-async-fail";
    await seedCart({ cartId, productId: product.id, quantity: 2 });
    const { orderId, sessionId } = await seedPendingOrder({
      cartId,
      productId: product.id,
      discountId: discount.id,
      discountCode: "WELCOME10",
      sessionId: "cs_test_async_fail",
    });

    // checkout.session.completed flips to paid + decrements stock to 8.
    stripeMock.constructEvent.mockReturnValueOnce({
      id: "evt_async_pay",
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          metadata: { orderId: String(orderId), cartId },
          payment_intent: "pi_async_fail",
          customer_email: "buyer@example.com",
          amount_total: 9_500,
          total_details: {
            amount_tax: 0,
            amount_discount: 1_000,
            amount_shipping: 500,
          },
        },
      },
    });
    await request(app)
      .post("/api/webhooks/stripe")
      .set("stripe-signature", "t=1,v1=fake")
      .set("content-type", "application/json")
      .send(Buffer.from(JSON.stringify({ id: "evt_async_pay" })));

    const [afterPay] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, product.id));
    expect(afterPay.inventory).toBe(8);

    // Bank later declines — async_payment_failed should restore inventory.
    stripeMock.constructEvent.mockReturnValueOnce({
      id: "evt_async_fail",
      type: "checkout.session.async_payment_failed",
      data: {
        object: {
          id: sessionId,
          metadata: { orderId: String(orderId), cartId },
        },
      },
    });
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("stripe-signature", "t=1,v1=fake")
      .set("content-type", "application/json")
      .send(Buffer.from(JSON.stringify({ id: "evt_async_fail" })));
    expect(res.status).toBe(200);

    const [p] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, product.id));
    expect(p.inventory).toBe(10);
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));
    expect(order.status).toBe("payment_failed");

    // Idempotent: same event redelivered must not double-restore.
    stripeMock.constructEvent.mockReturnValueOnce({
      id: "evt_async_fail",
      type: "checkout.session.async_payment_failed",
      data: {
        object: {
          id: sessionId,
          metadata: { orderId: String(orderId), cartId },
        },
      },
    });
    await request(app)
      .post("/api/webhooks/stripe")
      .set("stripe-signature", "t=1,v1=fake")
      .set("content-type", "application/json")
      .send(Buffer.from(JSON.stringify({ id: "evt_async_fail" })));
    const [pAgain] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, product.id));
    expect(pAgain.inventory).toBe(10);
  });

  it("restores inventory when a shipped order is later fully refunded", async () => {
    const product = await seedProduct({ priceCents: 5_000, inventory: 8 });
    // Seed a shipped order whose stock has already been decremented by an
    // earlier paid transition (inventory: 8 = 10 - 2).
    const [order] = await db
      .insert(ordersTable)
      .values({
        email: "buyer@example.com",
        status: "shipped",
        subtotalCents: 10_000,
        shippingCents: 0,
        taxCents: 0,
        discountCents: 0,
        totalCents: 10_000,
        currency: "usd",
        stripePaymentIntentId: "pi_shipped_refund",
        trackingCode: "TRK-RF-1",
        carrier: "USPS",
      })
      .returning();
    await db.insert(orderItemsTable).values({
      orderId: order.id,
      productId: product.id,
      productName: "Test Product",
      productImage: null,
      quantity: 2,
      priceCents: 5_000,
    });

    stripeMock.constructEvent.mockReturnValueOnce({
      id: "evt_refund_shipped",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_refund_shipped",
          payment_intent: "pi_shipped_refund",
          refunded: true,
          amount: 10_000,
          amount_refunded: 10_000,
        },
      },
    });
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("stripe-signature", "t=1,v1=fake")
      .set("content-type", "application/json")
      .send(Buffer.from(JSON.stringify({ id: "evt_refund_shipped" })));
    expect(res.status).toBe(200);

    const [p] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, product.id));
    expect(p.inventory).toBe(10);
    const [updated] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, order.id));
    expect(updated.status).toBe("refunded");
  });

  it("ignores partial charge.refunded events (does not restore inventory)", async () => {
    const product = await seedProduct({ priceCents: 5_000, inventory: 10 });
    const discount = await seedDiscount({
      code: "WELCOME10",
      type: "percent",
      value: 10,
    });
    const cartId = "cart-wh-refund-partial";
    await seedCart({ cartId, productId: product.id, quantity: 2 });
    const { orderId, sessionId } = await seedPendingOrder({
      cartId,
      productId: product.id,
      discountId: discount.id,
      discountCode: "WELCOME10",
      sessionId: "cs_test_refund_p",
    });

    stripeMock.constructEvent.mockReturnValueOnce({
      id: "evt_refund_p_pay",
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          metadata: { orderId: String(orderId), cartId },
          payment_intent: "pi_refund_p",
          customer_email: "buyer@example.com",
          amount_total: 9_500,
          total_details: {
            amount_tax: 0,
            amount_discount: 1_000,
            amount_shipping: 500,
          },
        },
      },
    });
    await request(app)
      .post("/api/webhooks/stripe")
      .set("stripe-signature", "t=1,v1=fake")
      .set("content-type", "application/json")
      .send(Buffer.from(JSON.stringify({ id: "evt_refund_p_pay" })));

    stripeMock.constructEvent.mockReturnValueOnce({
      id: "evt_refund_partial",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_refund_p",
          payment_intent: "pi_refund_p",
          refunded: false,
          amount: 9_500,
          amount_refunded: 1_000,
        },
      },
    });
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("stripe-signature", "t=1,v1=fake")
      .set("content-type", "application/json")
      .send(Buffer.from(JSON.stringify({ id: "evt_refund_partial" })));
    expect(res.status).toBe(200);

    const [p] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, product.id));
    expect(p.inventory).toBe(8);
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));
    expect(order.status).toBe("paid");
  });

  it("EasyPost tracker.updated → delivered flips a shipped order to delivered", async () => {
    const product = await seedProduct({ priceCents: 5_000, inventory: 10 });
    const [order] = await db
      .insert(ordersTable)
      .values({
        email: "buyer@example.com",
        status: "shipped",
        subtotalCents: 10_000,
        shippingCents: 500,
        taxCents: 0,
        discountCents: 0,
        totalCents: 10_500,
        currency: "usd",
        trackingCode: "TRK-EP-1",
        shipmentId: "shp_ep_1",
        carrier: "USPS",
      })
      .returning();
    await db.insert(orderItemsTable).values({
      orderId: order.id,
      productId: product.id,
      productName: "Test Product",
      productImage: null,
      quantity: 2,
      priceCents: 5_000,
    });

    const res = await request(app)
      .post("/api/webhooks/easypost")
      .set("content-type", "application/json")
      .send({
        description: "tracker.updated",
        result: {
          object: "Tracker",
          id: "trk_1",
          tracking_code: "TRK-EP-1",
          shipment_id: "shp_ep_1",
          status: "delivered",
          carrier: "USPS",
        },
      });

    expect(res.status).toBe(200);
    const [updated] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, order.id));
    expect(updated.status).toBe("delivered");
    expect(updated.deliveredEmailSentAt).not.toBeNull();
    expect(emailMock.sendDeliveryEmail).toHaveBeenCalledTimes(1);
    const arg = emailMock.sendDeliveryEmail.mock.calls[0]![0] as {
      to: string;
      orderId: number;
      trackingCode?: string | null;
      carrier?: string | null;
      orderUrl?: string | null;
    };
    expect(arg.to).toBe("buyer@example.com");
    expect(arg.orderId).toBe(order.id);
    expect(arg.trackingCode).toBe("TRK-EP-1");
    expect(arg.carrier).toBe("USPS");
    expect(arg.orderUrl).toContain(`/orders/${order.id}?token=`);
  });

  it("EasyPost tracker.updated → delivered is idempotent across redeliveries", async () => {
    const product = await seedProduct({ priceCents: 5_000, inventory: 10 });
    const [order] = await db
      .insert(ordersTable)
      .values({
        email: "buyer@example.com",
        status: "shipped",
        subtotalCents: 5_000,
        shippingCents: 0,
        taxCents: 0,
        discountCents: 0,
        totalCents: 5_000,
        currency: "usd",
        trackingCode: "TRK-EP-IDEMP",
        carrier: "USPS",
      })
      .returning();
    await db.insert(orderItemsTable).values({
      orderId: order.id,
      productId: product.id,
      productName: "Test Product",
      productImage: null,
      quantity: 1,
      priceCents: 5_000,
    });

    const body = {
      description: "tracker.updated",
      result: {
        object: "Tracker",
        tracking_code: "TRK-EP-IDEMP",
        status: "delivered",
        carrier: "USPS",
      },
    };

    const r1 = await request(app)
      .post("/api/webhooks/easypost")
      .set("content-type", "application/json")
      .send(body);
    expect(r1.status).toBe(200);

    const r2 = await request(app)
      .post("/api/webhooks/easypost")
      .set("content-type", "application/json")
      .send(body);
    expect(r2.status).toBe(200);

    expect(emailMock.sendDeliveryEmail).toHaveBeenCalledTimes(1);
  });

  it("EasyPost tracker.updated → delivered retries the email send after a transient failure", async () => {
    const product = await seedProduct({ priceCents: 5_000, inventory: 10 });
    const [order] = await db
      .insert(ordersTable)
      .values({
        email: "buyer@example.com",
        status: "shipped",
        subtotalCents: 5_000,
        shippingCents: 0,
        taxCents: 0,
        discountCents: 0,
        totalCents: 5_000,
        currency: "usd",
        trackingCode: "TRK-EP-RETRY",
        carrier: "USPS",
      })
      .returning();
    await db.insert(orderItemsTable).values({
      orderId: order.id,
      productId: product.id,
      productName: "Test Product",
      productImage: null,
      quantity: 1,
      priceCents: 5_000,
    });

    const body = {
      description: "tracker.updated",
      result: {
        object: "Tracker",
        tracking_code: "TRK-EP-RETRY",
        status: "delivered",
        carrier: "USPS",
      },
    };

    emailMock.sendDeliveryEmail.mockImplementationOnce(async () => {
      throw new Error("transient mail outage");
    });

    const r1 = await request(app)
      .post("/api/webhooks/easypost")
      .set("content-type", "application/json")
      .send(body);
    expect(r1.status).toBe(200);

    const [afterFail] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, order.id));
    expect(afterFail.status).toBe("delivered");
    // Claim was rolled back so a redelivery can retry.
    expect(afterFail.deliveredEmailSentAt).toBeNull();

    const r2 = await request(app)
      .post("/api/webhooks/easypost")
      .set("content-type", "application/json")
      .send(body);
    expect(r2.status).toBe(200);

    expect(emailMock.sendDeliveryEmail).toHaveBeenCalledTimes(2);
    const [afterRetry] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, order.id));
    expect(afterRetry.deliveredEmailSentAt).not.toBeNull();
  });

  it("EasyPost tracker.updated → in_transit does not move a delivered order backward", async () => {
    const product = await seedProduct({ priceCents: 5_000, inventory: 10 });
    const [order] = await db
      .insert(ordersTable)
      .values({
        email: "buyer@example.com",
        status: "delivered",
        subtotalCents: 5_000,
        shippingCents: 0,
        taxCents: 0,
        discountCents: 0,
        totalCents: 5_000,
        currency: "usd",
        trackingCode: "TRK-EP-2",
        carrier: "USPS",
      })
      .returning();
    await db.insert(orderItemsTable).values({
      orderId: order.id,
      productId: product.id,
      productName: "Test Product",
      productImage: null,
      quantity: 1,
      priceCents: 5_000,
    });

    const res = await request(app)
      .post("/api/webhooks/easypost")
      .set("content-type", "application/json")
      .send({
        description: "tracker.updated",
        result: {
          object: "Tracker",
          tracking_code: "TRK-EP-2",
          status: "in_transit",
        },
      });

    expect(res.status).toBe(200);
    const [updated] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, order.id));
    expect(updated.status).toBe("delivered");
  });

  it("EasyPost tracker for a paid (un-shipped) order is ignored", async () => {
    const product = await seedProduct({ priceCents: 5_000, inventory: 10 });
    const [order] = await db
      .insert(ordersTable)
      .values({
        email: "buyer@example.com",
        status: "paid",
        subtotalCents: 5_000,
        shippingCents: 0,
        taxCents: 0,
        discountCents: 0,
        totalCents: 5_000,
        currency: "usd",
        trackingCode: "TRK-EP-3",
      })
      .returning();
    await db.insert(orderItemsTable).values({
      orderId: order.id,
      productId: product.id,
      productName: "Test Product",
      productImage: null,
      quantity: 1,
      priceCents: 5_000,
    });

    const res = await request(app)
      .post("/api/webhooks/easypost")
      .set("content-type", "application/json")
      .send({
        description: "tracker.updated",
        result: {
          object: "Tracker",
          tracking_code: "TRK-EP-3",
          status: "delivered",
        },
      });

    expect(res.status).toBe(200);
    const [updated] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, order.id));
    expect(updated.status).toBe("paid");
  });

  it("EasyPost webhook rejects bad HMAC signatures when EASYPOST_WEBHOOK_SECRET is set", async () => {
    const prev = process.env.EASYPOST_WEBHOOK_SECRET;
    process.env.EASYPOST_WEBHOOK_SECRET = "shh";
    try {
      const res = await request(app)
        .post("/api/webhooks/easypost")
        .set("content-type", "application/json")
        .set("x-hmac-signature", "deadbeef")
        .send({ description: "tracker.updated", result: {} });
      expect(res.status).toBe(400);
    } finally {
      if (prev === undefined) delete process.env.EASYPOST_WEBHOOK_SECRET;
      else process.env.EASYPOST_WEBHOOK_SECRET = prev;
    }
  });

  it("backfills shipping address from Stripe shipping_details when order has none", async () => {
    const product = await seedProduct({ priceCents: 5_000, inventory: 10 });
    const discount = await seedDiscount({
      code: "WELCOME10",
      type: "percent",
      value: 10,
    });
    const cartId = "cart-wh-ship-1";
    await seedCart({
      cartId,
      productId: product.id,
      quantity: 2,
      email: "buyer@example.com",
    });
    const { orderId, sessionId } = await seedPendingOrder({
      cartId,
      productId: product.id,
      discountId: discount.id,
      discountCode: "WELCOME10",
      sessionId: "cs_test_ship_1",
    });

    stripeMock.constructEvent.mockReturnValue({
      id: "evt_ship_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          metadata: { orderId: String(orderId), cartId },
          payment_intent: "pi_test_ship_1",
          customer_email: "buyer@example.com",
          shipping_details: {
            name: "Jane Buyer",
            phone: "+15551112222",
            address: {
              line1: "123 Main St",
              line2: "Apt 4",
              city: "Springfield",
              state: "IL",
              postal_code: "62704",
              country: "US",
            },
          },
          amount_total: 10_330,
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
      .send(Buffer.from(JSON.stringify({ id: "evt_ship_1" })));

    expect(res.status).toBe(200);

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));
    expect(order.status).toBe("paid");
    expect(order.shippingAddress).toEqual({
      name: "Jane Buyer",
      street1: "123 Main St",
      street2: "Apt 4",
      city: "Springfield",
      state: "IL",
      zip: "62704",
      country: "US",
      phone: "+15551112222",
    });
  });

  it("falls back to customer_details.address when shipping_details is absent", async () => {
    const product = await seedProduct({ priceCents: 5_000, inventory: 10 });
    const discount = await seedDiscount({
      code: "WELCOME10",
      type: "percent",
      value: 10,
    });
    const cartId = "cart-wh-ship-2";
    await seedCart({
      cartId,
      productId: product.id,
      quantity: 2,
      email: "buyer@example.com",
    });
    const { orderId, sessionId } = await seedPendingOrder({
      cartId,
      productId: product.id,
      discountId: discount.id,
      discountCode: "WELCOME10",
      sessionId: "cs_test_ship_2",
    });

    stripeMock.constructEvent.mockReturnValue({
      id: "evt_ship_2",
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          metadata: { orderId: String(orderId), cartId },
          payment_intent: "pi_test_ship_2",
          customer_details: {
            email: "buyer@example.com",
            name: "Cust Name",
            phone: "+15553334444",
            address: {
              line1: "9 Billing Way",
              city: "Boston",
              state: "MA",
              postal_code: "02118",
              country: "US",
            },
          },
          amount_total: 10_330,
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
      .send(Buffer.from(JSON.stringify({ id: "evt_ship_2" })));

    expect(res.status).toBe(200);

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));
    expect(order.shippingAddress).toEqual({
      name: "Cust Name",
      street1: "9 Billing Way",
      street2: null,
      city: "Boston",
      state: "MA",
      zip: "02118",
      country: "US",
      phone: "+15553334444",
    });
  });

  it("preserves an existing order shippingAddress instead of overwriting with Stripe's", async () => {
    const product = await seedProduct({ priceCents: 5_000, inventory: 10 });
    const discount = await seedDiscount({
      code: "WELCOME10",
      type: "percent",
      value: 10,
    });
    const cartId = "cart-wh-ship-3";
    await seedCart({
      cartId,
      productId: product.id,
      quantity: 2,
      email: "buyer@example.com",
    });
    const existingAddress = {
      name: "Original Buyer",
      street1: "1 Origin Ln",
      street2: null,
      city: "Portland",
      state: "OR",
      zip: "97201",
      country: "US",
      phone: null,
    };
    const { orderId, sessionId } = await seedPendingOrder({
      cartId,
      productId: product.id,
      discountId: discount.id,
      discountCode: "WELCOME10",
      sessionId: "cs_test_ship_3",
      shippingAddress: existingAddress,
    });

    stripeMock.constructEvent.mockReturnValue({
      id: "evt_ship_3",
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          metadata: { orderId: String(orderId), cartId },
          payment_intent: "pi_test_ship_3",
          customer_email: "buyer@example.com",
          shipping_details: {
            name: "Stripe Override",
            address: {
              line1: "999 Wrong St",
              city: "Wrongtown",
              state: "WA",
              postal_code: "00000",
              country: "US",
            },
          },
          amount_total: 10_330,
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
      .send(Buffer.from(JSON.stringify({ id: "evt_ship_3" })));

    expect(res.status).toBe(200);

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));
    expect(order.shippingAddress).toEqual(existingAddress);
  });
});
