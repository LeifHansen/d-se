import { Router, type IRouter, raw } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
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
import {
  sendOrderConfirmation,
  sendDeliveryEmail,
  buildTrackingUrl,
} from "../lib/email";
import { signOrderToken } from "../lib/orderToken";
import { SITE_URL } from "../lib/site-url";
import { markCartRecovered } from "../lib/abandonedCart";
import { recordStripeWebhookReceived } from "../lib/metrics";
import { trackPurchaseServerSide } from "../lib/serverAnalytics";
import { normaliseEmail } from "../lib/normaliseEmail";

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

    // ----------------------------------------------------------------------
    // charge.refunded — restore inventory we previously decremented and flip
    // the order to `refunded`. Only acted on when the charge is fully
    // refunded; partial refunds leave the order/inventory untouched because
    // we don't track per-line refund quantities.
    //
    // The status flip and the inventory restore happen inside a single
    // transaction that also claims the Stripe event id, so an erroring
    // restore rolls the claim back and Stripe will retry.
    // ----------------------------------------------------------------------
    if (event.type === "charge.refunded") {
      const charge = event.data.object as {
        id?: string;
        payment_intent?: string | null;
        refunded?: boolean;
        amount?: number | null;
        amount_refunded?: number | null;
      };
      const paymentIntentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : null;
      const isFullRefund =
        charge.refunded === true ||
        (typeof charge.amount === "number" &&
          typeof charge.amount_refunded === "number" &&
          charge.amount_refunded >= charge.amount &&
          charge.amount > 0);

      try {
        await db.transaction(async (tx) => {
          const claimed = await tx
            .insert(stripeProcessedEventsTable)
            .values({ eventId: event.id, eventType: event.type })
            .onConflictDoNothing({
              target: stripeProcessedEventsTable.eventId,
            })
            .returning({ eventId: stripeProcessedEventsTable.eventId });
          if (claimed.length === 0) return;
          if (!paymentIntentId || !isFullRefund) return;

          // Atomic transition to `refunded` for any post-paid state that
          // had its inventory decremented at payment time. We include
          // shipped/delivered because a customer can be refunded after
          // fulfillment too — we still owe them the stock back. Already-
          // refunded orders won't match and won't double-restore.
          const flipped = await tx
            .update(ordersTable)
            .set({ status: "refunded", updatedAt: new Date() })
            .where(
              and(
                eq(ordersTable.stripePaymentIntentId, paymentIntentId),
                inArray(ordersTable.status, ["paid", "shipped", "delivered"]),
              ),
            )
            .returning({ id: ordersTable.id });
          if (flipped.length === 0) return;

          const refundedOrderId = flipped[0].id;
          const items = await tx
            .select()
            .from(orderItemsTable)
            .where(eq(orderItemsTable.orderId, refundedOrderId));
          for (const it of items) {
            await tx
              .update(productsTable)
              .set({
                inventory: sql`${productsTable.inventory} + ${it.quantity}`,
              })
              .where(eq(productsTable.id, it.productId));
          }
        });
      } catch (err) {
        req.log.error({ err }, "Stripe refund webhook failed; will retry");
        res.status(500).json({ error: "Webhook processing failed" });
        return;
      }
      res.json({ received: true });
      return;
    }

    // ----------------------------------------------------------------------
    // checkout.session.async_payment_failed — for delayed payment methods
    // (ACH, etc.) Stripe fires `checkout.session.completed` immediately and
    // we treat that as paid (decrementing inventory). If the bank later
    // declines, this event arrives. Restore inventory and flip the order to
    // `payment_failed` so it doesn't keep showing as a sale.
    // ----------------------------------------------------------------------
    if (event.type === "checkout.session.async_payment_failed") {
      const failedSession = event.data.object as {
        id?: string;
        metadata?: Record<string, string> | null;
      };
      const failedOrderId = Number(failedSession.metadata?.orderId);

      try {
        await db.transaction(async (tx) => {
          const claimed = await tx
            .insert(stripeProcessedEventsTable)
            .values({ eventId: event.id, eventType: event.type })
            .onConflictDoNothing({
              target: stripeProcessedEventsTable.eventId,
            })
            .returning({ eventId: stripeProcessedEventsTable.eventId });
          if (claimed.length === 0) return;
          if (!failedOrderId) return;

          // If the order had already been flipped to paid (which is what
          // would have decremented stock), atomically move it to
          // `payment_failed` and add the line quantities back. If it never
          // reached paid the update matches nothing and we restore nothing.
          const flipped = await tx
            .update(ordersTable)
            .set({ status: "payment_failed", updatedAt: new Date() })
            .where(
              and(
                eq(ordersTable.id, failedOrderId),
                eq(ordersTable.status, "paid"),
              ),
            )
            .returning({ id: ordersTable.id });
          if (flipped.length === 0) {
            // Also ensure a still-pending order is reflected as failed,
            // even though no inventory needs restoring.
            await tx
              .update(ordersTable)
              .set({ status: "payment_failed", updatedAt: new Date() })
              .where(
                and(
                  eq(ordersTable.id, failedOrderId),
                  eq(ordersTable.status, "pending"),
                ),
              );
            return;
          }
          const items = await tx
            .select()
            .from(orderItemsTable)
            .where(eq(orderItemsTable.orderId, failedOrderId));
          for (const it of items) {
            await tx
              .update(productsTable)
              .set({
                inventory: sql`${productsTable.inventory} + ${it.quantity}`,
              })
              .where(eq(productsTable.id, it.productId));
          }
        });
      } catch (err) {
        req.log.error(
          { err },
          "Stripe async_payment_failed webhook failed; will retry",
        );
        res.status(500).json({ error: "Webhook processing failed" });
        return;
      }
      res.json({ received: true });
      return;
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
              normaliseEmail(
                session.customer_email ??
                  session.customer_details?.email ??
                  null,
              ),
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
          normaliseEmail(
            session.customer_email ??
              session.customer_details?.email ??
              null,
          );

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
          const lookupToken = signOrderToken({ orderId, email: ctx.email });
          // Persist the issued token so admins can see when it was issued
          // and revoke it (rotate) without our customer needing to email
          // support. Stored alongside the order; the `/orders/by-token`
          // route checks against this column so a cleared value invalidates
          // the previously emailed link.
          await db
            .update(ordersTable)
            .set({
              lookupToken,
              lookupTokenIssuedAt: new Date(),
              lookupTokenLastUsedAt: null,
            })
            .where(eq(ordersTable.id, orderId));
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
            orderUrl: `${SITE_URL}/orders/${orderId}?token=${encodeURIComponent(
              lookupToken,
            )}`,
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

// ---------------------------------------------------------------------------
// EasyPost tracker webhook
//
// EasyPost POSTs `tracker.updated` (and other tracker.*) events to this
// endpoint as carrier scans come in. We use them to flip the order from
// `shipped` → `delivered` (and friends) automatically so the shopper's
// account/order page reflects live carrier progress without admin action.
// ---------------------------------------------------------------------------

// Map an EasyPost tracker.status → the order.status we should reflect.
// Returning null means "no transition" (event is informational only).
function mapTrackerStatusToOrderStatus(trackerStatus: string): string | null {
  switch (trackerStatus) {
    case "delivered":
      return "delivered";
    case "pre_transit":
    case "in_transit":
    case "out_for_delivery":
    case "available_for_pickup":
      return "shipped";
    default:
      // unknown / error / failure / return_to_sender / cancelled — leave the
      // existing status alone so an operator can investigate.
      return null;
  }
}

// Order statuses where we still want carrier events to drive transitions.
// Anything before fulfillment (`pending`, `paid`) shouldn't be auto-bumped to
// shipped/delivered because the admin hasn't actually attached tracking yet —
// a stray webhook for a recycled tracking number would otherwise mutate the
// order erroneously.
const TRACKABLE_ORDER_STATUSES = new Set(["shipped", "delivered"]);

// Status precedence for "don't go backwards" guarding (delivered is terminal).
const STATUS_RANK: Record<string, number> = {
  shipped: 1,
  delivered: 2,
};

function verifyEasyPostSignature(
  rawBody: Buffer,
  headerSig: string | undefined,
  secret: string,
): boolean {
  if (!headerSig) return false;
  // EasyPost signs as hex HMAC-SHA256, sent in `X-Hmac-Signature`. Some
  // accounts include a `hmac-sha256-hex=` prefix, others don't — accept both.
  const provided = headerSig.replace(/^hmac-sha256-hex=/i, "").trim();
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

router.post(
  "/webhooks/easypost",
  raw({ type: "application/json" }),
  async (req, res): Promise<void> => {
    const rawBody: Buffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === "string" ? req.body : "");

    const secret = process.env.EASYPOST_WEBHOOK_SECRET;
    if (secret) {
      const sig = req.headers["x-hmac-signature"];
      const sigStr = Array.isArray(sig) ? sig[0] : sig;
      if (!verifyEasyPostSignature(rawBody, sigStr, secret)) {
        req.log.warn("EasyPost webhook signature verification failed");
        res.status(400).json({ error: "Invalid signature" });
        return;
      }
    }

    let payload: {
      description?: string;
      result?: {
        object?: string;
        id?: string;
        tracking_code?: string;
        shipment_id?: string | null;
        status?: string;
        carrier?: string | null;
      };
    };
    try {
      payload = JSON.parse(rawBody.toString("utf8")) as typeof payload;
    } catch (err) {
      req.log.warn({ err }, "EasyPost webhook: invalid JSON body");
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    const description = payload.description ?? "";
    const tracker = payload.result;
    // We only care about tracker events; acknowledge other event types so
    // EasyPost doesn't keep retrying.
    if (!description.startsWith("tracker.") || !tracker || tracker.object !== "Tracker") {
      res.json({ received: true, ignored: true });
      return;
    }

    const trackingCode = tracker.tracking_code?.trim() ?? "";
    const trackerStatus = tracker.status ?? "";
    if (!trackingCode || !trackerStatus) {
      res.json({ received: true, ignored: true });
      return;
    }

    const nextStatus = mapTrackerStatusToOrderStatus(trackerStatus);
    if (!nextStatus) {
      res.json({ received: true, ignored: true });
      return;
    }

    // Find the order this tracker belongs to. tracking_code is the most
    // reliable join key (we stored it at fulfillment time); shipment_id is a
    // useful tiebreaker if multiple historical orders ever shared a code.
    const candidates = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.trackingCode, trackingCode));
    const order =
      candidates.find(
        (o) =>
          tracker.shipment_id != null &&
          o.shipmentId != null &&
          o.shipmentId === tracker.shipment_id,
      ) ?? candidates[0];

    if (!order) {
      // Unknown tracking code — could be from another store sharing the same
      // EasyPost account, or a test event. Acknowledge without erroring.
      req.log.info(
        { trackingCode, trackerStatus, description },
        "EasyPost tracker event for unknown order; ignoring",
      );
      res.json({ received: true, ignored: true });
      return;
    }

    if (!TRACKABLE_ORDER_STATUSES.has(order.status)) {
      // Order isn't in a state where carrier events should drive it (e.g.
      // still `pending`/`paid`, or refunded). Don't mutate.
      res.json({ received: true, ignored: true });
      return;
    }

    const currentRank = STATUS_RANK[order.status] ?? 0;
    const nextRank = STATUS_RANK[nextStatus] ?? 0;

    // The "effective" terminal status the order should be in after this
    // event. We never go backwards (carrier rewinds), so when the new event
    // is at or below the current rank we keep the existing status. We still
    // fall through below so a delivered order with a previously-failed email
    // send can be retried from a later tracker.updated event.
    const effectiveStatus = nextRank > currentRank ? nextStatus : order.status;

    let statusChanged = false;
    if (nextRank > currentRank) {
      const transitioned = await db
        .update(ordersTable)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(
          and(
            eq(ordersTable.id, order.id),
            eq(ordersTable.status, order.status),
          ),
        )
        .returning({ id: ordersTable.id });
      statusChanged = transitioned.length > 0;
      if (statusChanged) {
        req.log.info(
          {
            orderId: order.id,
            from: order.status,
            to: nextStatus,
            trackerStatus,
            trackingCode,
          },
          "Order status updated from EasyPost tracker event",
        );
      }
    }

    // Delivery notification email — sent once per order. We only attempt a
    // send when the *incoming* event itself reports `delivered` (so an
    // earlier-status event like `in_transit` arriving late for an already-
    // delivered order doesn't trigger a notification). The send is claimed
    // atomically by setting `delivered_email_sent_at` only when it's still
    // NULL, so a transient send failure that resets the column can be
    // recovered by a subsequent EasyPost retry, while concurrent retries
    // lose the race and don't double-send.
    if (
      nextStatus === "delivered" &&
      effectiveStatus === "delivered" &&
      order.email
    ) {
      try {
        const claimed = await db
          .update(ordersTable)
          .set({ deliveredEmailSentAt: new Date() })
          .where(
            and(
              eq(ordersTable.id, order.id),
              eq(ordersTable.status, "delivered"),
              sql`${ordersTable.deliveredEmailSentAt} IS NULL`,
            ),
          )
          .returning({ id: ordersTable.id });
        if (claimed.length > 0) {
          const email = order.email;
          const lookupToken =
            order.lookupToken ?? signOrderToken({ orderId: order.id, email });
          if (!order.lookupToken) {
            await db
              .update(ordersTable)
              .set({
                lookupToken,
                lookupTokenIssuedAt: new Date(),
                lookupTokenLastUsedAt: null,
              })
              .where(eq(ordersTable.id, order.id));
          }
          try {
            await sendDeliveryEmail({
              to: email,
              orderId: order.id,
              trackingCode: order.trackingCode,
              carrier: order.carrier,
              trackingUrl: order.trackingCode
                ? buildTrackingUrl(order.carrier, order.trackingCode)
                : null,
              orderUrl: `${SITE_URL}/orders/${order.id}?token=${encodeURIComponent(
                lookupToken,
              )}`,
            });
          } catch (err) {
            // Roll back the claim so a future tracker.updated retry can
            // re-attempt the send.
            await db
              .update(ordersTable)
              .set({ deliveredEmailSentAt: null })
              .where(eq(ordersTable.id, order.id));
            req.log.warn({ err, orderId: order.id }, "Delivery email failed");
          }
        }
      } catch (err) {
        req.log.warn(
          { err, orderId: order.id },
          "Delivery email claim failed",
        );
      }
    }

    res.json({ received: true, orderId: order.id, status: nextStatus });
  },
);

export default router;
