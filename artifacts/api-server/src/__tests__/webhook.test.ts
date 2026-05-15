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
