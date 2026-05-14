import { Router, type IRouter, raw } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  ordersTable,
  orderItemsTable,
  productsTable,
  cartItemsTable,
  cartsTable,
  discountCodesTable,
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
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
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

      // Stripe Checkout collects the shipping address when the cart hands off
      // without one. Backfill the order so admin fulfillment + label printing
      // have a real ship-to address.
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
      if (orderId) {
        const [order] = await db
          .select()
          .from(ordersTable)
          .where(eq(ordersTable.id, orderId));
        // Defense-in-depth: confirm the metadata orderId actually belongs to
        // the session that triggered this event before mutating the order.
        if (
          order &&
          order.status === "pending" &&
          (!order.stripeSessionId || order.stripeSessionId === session.id)
        ) {
          const finalDiscountCents = Math.max(
            order.discountCents,
            reportedDiscountCents,
          );
          // Stripe is authoritative for shipping when the cart handed off
          // without an address (we recorded $0 then). Otherwise keep the
          // server-validated rate we already charged.
          const finalShippingCents =
            order.shippingCents > 0
              ? order.shippingCents
              : reportedShippingCents;
          const finalTotalCents =
            session.amount_total ??
            Math.max(
              0,
              order.subtotalCents - finalDiscountCents,
            ) +
              finalShippingCents +
              taxCents;
          await db
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
              // Backfill the shipping address Stripe collected during checkout
              // so admin fulfillment + label printing have a real ship-to.
              shippingAddress:
                order.shippingAddress ?? stripeShippingAddress ?? null,
              updatedAt: new Date(),
            })
            .where(eq(ordersTable.id, orderId));

          // Increment discount redemption count.
          if (order.discountCodeId) {
            await db
              .update(discountCodesTable)
              .set({
                redemptionsCount: sql`${discountCodesTable.redemptionsCount} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(discountCodesTable.id, order.discountCodeId));
          }

          // Clear cart and mark abandoned cart recovered.
          const cartId = order.cartId ?? session.metadata?.cartId ?? null;
          if (cartId) {
            try {
              await db
                .delete(cartItemsTable)
                .where(eq(cartItemsTable.cartId, cartId));
              await db
                .update(cartsTable)
                .set({ checkedOutAt: new Date(), updatedAt: new Date() })
                .where(eq(cartsTable.id, cartId));
              await markCartRecovered(cartId, order.id);
            } catch (err) {
              req.log.warn({ err }, "Cart cleanup failed");
            }
          }

          // Decrement inventory
          const items = await db
            .select()
            .from(orderItemsTable)
            .where(eq(orderItemsTable.orderId, orderId));
          for (const it of items) {
            const [p] = await db
              .select()
              .from(productsTable)
              .where(eq(productsTable.id, it.productId));
            if (p) {
              await db
                .update(productsTable)
                .set({ inventory: Math.max(0, p.inventory - it.quantity) })
                .where(eq(productsTable.id, p.id));
            }
          }

          // Clear cart
          // We don't track cartId on order directly here; webhook is best-effort.

          // Send confirmation email
          const email =
            order.email ??
            session.customer_email ??
            session.customer_details?.email ??
            null;
          if (email) {
            try {
              await sendOrderConfirmation({
                to: email,
                orderId: order.id,
                totalCents: finalTotalCents,
                subtotalCents: order.subtotalCents,
                shippingCents: order.shippingCents,
                taxCents,
                discountCents: finalDiscountCents,
                discountCode: order.discountCode,
                items: items.map((i) => ({
                  name: i.productName,
                  quantity: i.quantity,
                  priceCents: i.priceCents,
                })),
                orderUrl: `${SITE_URL}/orders/${order.id}?email=${encodeURIComponent(email)}`,
              });
            } catch (err) {
              req.log.warn({ err }, "Order email send failed");
            }
          }

          // Server-side purchase tracking (GA4 MP + Meta CAPI). Best-effort,
          // deduped on the client by analyticsEventId via the dataLayer.
          if (!order.purchaseTrackedAt) {
            const eventId =
              order.analyticsEventId ??
              session.metadata?.analyticsEventId ??
              `order-${order.id}`;
            try {
              await trackPurchaseServerSide({
                orderId: order.id,
                email,
                totalCents: order.totalCents,
                currency: order.currency,
                items: items.map((i) => ({
                  productId: i.productId,
                  productName: i.productName,
                  quantity: i.quantity,
                  priceCents: i.priceCents,
                })),
                eventId,
                clientId: order.analyticsClientId,
                fbp: order.analyticsFbp,
                fbc: order.analyticsFbc,
                clientIp: order.analyticsClientIp,
                userAgent: order.analyticsUserAgent,
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
      }
    }

    res.json({ received: true });
  },
);

export default router;
