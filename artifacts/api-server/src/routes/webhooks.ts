import { Router, type IRouter, raw } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  ordersTable,
  orderItemsTable,
  productsTable,
  cartItemsTable,
  cartsTable,
  discountCodesTable,
  stripeProcessedEventsTable,
} from "@workspace/db";
import { getStripe, isStripeConfigured } from "../lib/stripe";
import { sendOrderConfirmation } from "../lib/email";
import { SITE_URL } from "../lib/site-url";
import { markCartRecovered } from "../lib/abandonedCart";
import { recordStripeWebhookReceived } from "../lib/metrics";
import { trackPurchaseServerSide } from "../lib/serverAnalytics";

const router: IRouter = Router();

router.post(
  "/webhooks/stripe",
  raw({ type: "application/json" }),
  async (req, res): Promise<void> => {
    if (!(await isStripeConfigured())) {
      res.status(503).json({ error: "Stripe not configured" });
      return;
    }
    const sig = req.headers["stripe-signature"];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!sig || !secret) {
      res.status(400).json({ error: "Missing signature" });
      return;
    }
    const stripe = await getStripe();
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      req.log.warn({ err }, "Stripe webhook signature failed");
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    // Record receipt of any verified Stripe event for freshness monitoring.
    try {
      await recordStripeWebhookReceived();
    } catch (err) {
      req.log.warn({ err }, "Failed to record webhook timestamp");
    }

    if (
      event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded"
    ) {
      // Still record the event id so unrelated event types are also
      // de-duplicated; failures here are non-fatal.
      try {
        await db
          .insert(stripeProcessedEventsTable)
          .values({ eventId: event.id, eventType: event.type })
          .onConflictDoNothing({ target: stripeProcessedEventsTable.eventId });
      } catch (err) {
        req.log.warn({ err }, "Failed to record Stripe event id (no-op type)");
      }
      res.json({ received: true });
      return;
    }

    type StripeAddress = {
      line1?: string | null;
      line2?: string | null;
      city?: string | null;
      state?: string | null;
      postal_code?: string | null;
      country?: string | null;
    };
    const session = event.data.object as {
      id: string;
      metadata?: Record<string, string>;
      payment_intent?: string;
      customer_email?: string | null;
      customer_details?: {
        email?: string | null;
        name?: string | null;
        phone?: string | null;
        address?: StripeAddress | null;
      } | null;
      shipping_details?: {
        name?: string | null;
        phone?: string | null;
        address?: StripeAddress | null;
      } | null;
      amount_total?: number | null;
      total_details?: {
        amount_tax?: number | null;
        amount_discount?: number | null;
        amount_shipping?: number | null;
      } | null;
    };
    const taxCents = session.total_details?.amount_tax ?? 0;
    const reportedDiscountCents = session.total_details?.amount_discount ?? 0;
    const reportedShippingCents = session.total_details?.amount_shipping ?? 0;

    function buildShippingAddress(): {
      name: string;
      street1: string;
      street2?: string | null;
      city: string;
      state: string;
      zip: string;
      country: string;
      phone?: string | null;
    } | null {
      const ship = session.shipping_details;
      const cust = session.customer_details;
      const name = ship?.name ?? cust?.name ?? null;
      const addr = ship?.address ?? cust?.address ?? null;
      if (!name || !addr || !addr.line1 || !addr.city || !addr.country) {
        return null;
      }
      return {
        name,
        street1: addr.line1,
        street2: addr.line2 ?? null,
        city: addr.city,
        state: addr.state ?? "",
        zip: addr.postal_code ?? "",
        country: addr.country,
        phone: ship?.phone ?? cust?.phone ?? null,
      };
    }
    const stripeShippingAddress = buildShippingAddress();
    const orderId = Number(session.metadata?.orderId);

    // ----------------------------------------------------------------------
    // Critical section: claim the Stripe event id + flip order pending->paid
    // + apply the discount/inventory mutations atomically. Anything that
    // fails here rolls back the event-id claim too, so Stripe will retry the
    // delivery and we still complete fulfillment exactly once.
    //
    // Best-effort side effects (email, analytics, cart cleanup) run AFTER the
    // transaction commits and are guarded by their own per-order flags so a
    // crash between commit and side-effect doesn't double-run them on retry.
    // ----------------------------------------------------------------------
    type CommittedOrderItem = {
      productId: number;
      productName: string;
      quantity: number;
      priceCents: number;
    };
    type CommittedContext = {
      finalTotalCents: number;
      finalDiscountCents: number;
      email: string | null;
      cartId: string | null;
      items: CommittedOrderItem[];
      orderSubtotalCents: number;
      orderShippingCents: number;
      orderTotalCents: number;
      orderCurrency: string;
      orderDiscountCode: string | null;
      orderDiscountCodeId: number | null;
      orderLookupToken: string | null;
      analyticsEventId: string;
      analyticsClientId: string | null;
      analyticsFbp: string | null;
      analyticsFbc: string | null;
      analyticsClientIp: string | null;
      analyticsUserAgent: string | null;
      purchaseAlreadyTracked: boolean;
    };
    let committed: CommittedContext | null = null;
    let duplicate = false;

    try {
      await db.transaction(async (tx) => {
        const claimed = await tx
          .insert(stripeProcessedEventsTable)
          .values({ eventId: event.id, eventType: event.type })
          .onConflictDoNothing({ target: stripeProcessedEventsTable.eventId })
          .returning({ eventId: stripeProcessedEventsTable.eventId });
        if (claimed.length === 0) {
          duplicate = true;
          return;
        }
        if (!orderId) return;

        const [order] = await tx
          .select()
          .from(ordersTable)
          .where(eq(ordersTable.id, orderId));
        if (
          !order ||
          order.status !== "pending" ||
          (order.stripeSessionId && order.stripeSessionId !== session.id)
        ) {
          return;
        }

        const finalDiscountCents = Math.max(
          order.discountCents,
          reportedDiscountCents,
        );
        const finalShippingCents =
          order.shippingCents > 0 ? order.shippingCents : reportedShippingCents;
        const finalTotalCents =
          session.amount_total ??
          Math.max(0, order.subtotalCents - finalDiscountCents) +
            finalShippingCents +
            taxCents;

        // Atomic order claim: only flip if still pending. If a concurrent
        // delivery already flipped it, this returns no rows and we bail.
        const updated = await tx
          .update(ordersTable)
          .set({
            status: "paid",
            stripePaymentIntentId:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : null,
            email:
              order.email ??
              session.customer_email ??
              session.customer_details?.email ??
              null,
            taxCents,
            shippingCents: finalShippingCents,
            discountCents: finalDiscountCents,
            totalCents: finalTotalCents,
            shippingAddress:
              order.shippingAddress ?? stripeShippingAddress ?? null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(ordersTable.id, orderId),
              eq(ordersTable.status, "pending"),
            ),
          )
          .returning({ id: ordersTable.id });
        if (updated.length === 0) return;

        if (order.discountCodeId) {
          await tx
            .update(discountCodesTable)
            .set({
              redemptionsCount: sql`${discountCodesTable.redemptionsCount} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(discountCodesTable.id, order.discountCodeId));
        }

        const items = await tx
          .select()
          .from(orderItemsTable)
          .where(eq(orderItemsTable.orderId, orderId));
        for (const it of items) {
          // Atomic inventory decrement clamped at zero — no read-then-write
          // race even if the same product appears in concurrent orders.
          await tx
            .update(productsTable)
            .set({
              inventory: sql`GREATEST(0, ${productsTable.inventory} - ${it.quantity})`,
            })
            .where(eq(productsTable.id, it.productId));
        }

        const email =
          order.email ??
          session.customer_email ??
          session.customer_details?.email ??
          null;

        committed = {
          finalTotalCents,
          finalDiscountCents,
          email,
          cartId: order.cartId ?? session.metadata?.cartId ?? null,
          items: items.map((i) => ({
            productId: i.productId,
            productName: i.productName,
            quantity: i.quantity,
            priceCents: i.priceCents,
          })),
          orderSubtotalCents: order.subtotalCents,
          orderShippingCents: order.shippingCents,
          orderTotalCents: order.totalCents,
          orderCurrency: order.currency,
          orderDiscountCode: order.discountCode,
          orderDiscountCodeId: order.discountCodeId,
          orderLookupToken: order.lookupToken,
          analyticsEventId:
            order.analyticsEventId ??
            session.metadata?.analyticsEventId ??
            `order-${order.id}`,
          analyticsClientId: order.analyticsClientId,
          analyticsFbp: order.analyticsFbp,
          analyticsFbc: order.analyticsFbc,
          analyticsClientIp: order.analyticsClientIp,
          analyticsUserAgent: order.analyticsUserAgent,
          purchaseAlreadyTracked: order.purchaseTrackedAt != null,
        };
      });
    } catch (err) {
      // Transaction rolled back — including the stripe_processed_events row,
      // so Stripe's retry will get another chance to complete the order.
      req.log.error({ err }, "Stripe webhook transaction failed; will retry");
      res.status(500).json({ error: "Webhook processing failed" });
      return;
    }

    if (duplicate) {
      req.log.info(
        { stripeEventId: event.id, type: event.type },
        "Stripe webhook redelivery ignored",
      );
      res.json({ received: true, duplicate: true });
      return;
    }

    if (committed) {
      const ctx: CommittedContext = committed;
      // Cart cleanup (best-effort).
      if (ctx.cartId) {
        try {
          await db
            .delete(cartItemsTable)
            .where(eq(cartItemsTable.cartId, ctx.cartId));
          await db
            .update(cartsTable)
            .set({ checkedOutAt: new Date(), updatedAt: new Date() })
            .where(eq(cartsTable.id, ctx.cartId));
          await markCartRecovered(ctx.cartId, orderId);
        } catch (err) {
          req.log.warn({ err }, "Cart cleanup failed");
        }
      }

      // Confirmation email (best-effort, once per order).
      if (ctx.email) {
        try {
          await sendOrderConfirmation({
            to: ctx.email,
            orderId,
            totalCents: ctx.finalTotalCents,
            subtotalCents: ctx.orderSubtotalCents,
            shippingCents: ctx.orderShippingCents,
            taxCents,
            discountCents: ctx.finalDiscountCents,
            discountCode: ctx.orderDiscountCode,
            items: ctx.items.map((i) => ({
              name: i.productName,
              quantity: i.quantity,
              priceCents: i.priceCents,
            })),
            orderUrl: ctx.orderLookupToken
              ? `${SITE_URL}/orders/${orderId}?token=${encodeURIComponent(ctx.orderLookupToken)}`
              : `${SITE_URL}/orders/${orderId}?email=${encodeURIComponent(ctx.email)}`,
          });
        } catch (err) {
          req.log.warn({ err }, "Order email send failed");
        }
      }

      // Server-side purchase tracking (best-effort, deduped by purchaseTrackedAt).
      if (!ctx.purchaseAlreadyTracked) {
        try {
          await trackPurchaseServerSide({
            orderId,
            email: ctx.email,
            totalCents: ctx.orderTotalCents,
            currency: ctx.orderCurrency,
            items: ctx.items.map((i) => ({
              productId: i.productId,
              productName: i.productName,
              quantity: i.quantity,
              priceCents: i.priceCents,
            })),
            eventId: ctx.analyticsEventId,
            clientId: ctx.analyticsClientId,
            fbp: ctx.analyticsFbp,
            fbc: ctx.analyticsFbc,
            clientIp: ctx.analyticsClientIp,
            userAgent: ctx.analyticsUserAgent,
          });
          await db
            .update(ordersTable)
            .set({ purchaseTrackedAt: new Date() })
            .where(eq(ordersTable.id, orderId));
        } catch (err) {
          req.log.warn({ err }, "Server-side purchase tracking failed");
        }
      }
    }

    res.json({ received: true });
  },
);

export default router;
