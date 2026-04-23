import { Router, type IRouter, raw } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  ordersTable,
  orderItemsTable,
  productsTable,
  cartItemsTable,
} from "@workspace/db";
import { getStripe, isStripeConfigured } from "../lib/stripe";
import { sendOrderConfirmation } from "../lib/email";

const router: IRouter = Router();

router.post(
  "/webhooks/stripe",
  raw({ type: "application/json" }),
  async (req, res): Promise<void> => {
    if (!isStripeConfigured()) {
      res.status(503).json({ error: "Stripe not configured" });
      return;
    }
    const sig = req.headers["stripe-signature"];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!sig || !secret) {
      res.status(400).json({ error: "Missing signature" });
      return;
    }
    const stripe = getStripe();
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      req.log.warn({ err }, "Stripe webhook signature failed");
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as {
        id: string;
        metadata?: Record<string, string>;
        payment_intent?: string;
        customer_email?: string | null;
        customer_details?: { email?: string | null } | null;
      };
      const orderId = Number(session.metadata?.orderId);
      if (orderId) {
        const [order] = await db
          .select()
          .from(ordersTable)
          .where(eq(ordersTable.id, orderId));
        if (order && order.status === "pending") {
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
              updatedAt: new Date(),
            })
            .where(eq(ordersTable.id, orderId));

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
            session.customer_details?.email;
          if (email) {
            try {
              await sendOrderConfirmation({
                to: email,
                orderId: order.id,
                totalCents: order.totalCents,
                items: items.map((i) => ({
                  name: i.productName,
                  quantity: i.quantity,
                  priceCents: i.priceCents,
                })),
              });
            } catch (err) {
              req.log.warn({ err }, "Order email send failed");
            }
          }
        }
      }
    }

    res.json({ received: true });
  },
);

export default router;
