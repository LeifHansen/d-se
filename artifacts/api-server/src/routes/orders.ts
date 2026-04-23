import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  ordersTable,
  orderItemsTable,
  cartItemsTable,
  productsTable,
  type OrderAddress,
} from "@workspace/db";
import {
  CreateCheckoutBody,
  CreateCheckoutResponse,
  ListMyOrdersResponse,
  GetOrderParams,
  GetOrderResponse,
} from "@workspace/api-zod";
import { loadCart } from "./cart";
import { getStripe, isStripeConfigured } from "../lib/stripe";
import { getUserId, requireAuth } from "../lib/auth";
import { sendOrderConfirmation } from "../lib/email";

const router: IRouter = Router();

async function buildOrderResponse(orderId: number) {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));
  if (!order) return null;
  const items = await db
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, orderId));
  return {
    id: order.id,
    status: order.status,
    email: order.email,
    items,
    subtotalCents: order.subtotalCents,
    shippingCents: order.shippingCents,
    taxCents: order.taxCents,
    totalCents: order.totalCents,
    currency: order.currency,
    shippingAddress: order.shippingAddress ?? undefined,
    trackingCode: order.trackingCode,
    labelUrl: order.labelUrl,
    createdAt: order.createdAt,
  };
}

router.post("/checkout", async (req, res): Promise<void> => {
  const parsed = CreateCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const cart = await loadCart(parsed.data.cartId);
  if (cart.items.length === 0) {
    res.status(400).json({ error: "Cart is empty" });
    return;
  }
  const userId = getUserId(req);
  const shippingCents = req.body?.shippingCents ?? 0;
  const subtotalCents = cart.subtotalCents;
  const totalCents = subtotalCents + shippingCents;
  const address = parsed.data.address as OrderAddress;

  const [order] = await db
    .insert(ordersTable)
    .values({
      userId,
      email: parsed.data.email ?? null,
      status: "pending",
      subtotalCents,
      shippingCents,
      taxCents: 0,
      totalCents,
      currency: cart.currency,
      shippingAddress: address,
      shippingRateId: parsed.data.shippingRateId,
    })
    .returning();

  await db.insert(orderItemsTable).values(
    cart.items.map((it) => ({
      orderId: order.id,
      productId: it.productId,
      productName: it.product.name,
      productImage: it.product.images[0] ?? null,
      quantity: it.quantity,
      priceCents: it.product.priceCents,
    })),
  );

  if (!isStripeConfigured()) {
    // Dev fallback: skip Stripe; mark order as paid immediately.
    await db
      .update(ordersTable)
      .set({ status: "paid" })
      .where(eq(ordersTable.id, order.id));
    await db
      .delete(cartItemsTable)
      .where(eq(cartItemsTable.cartId, parsed.data.cartId));
    res.json(
      CreateCheckoutResponse.parse({
        url: `/checkout/success?orderId=${order.id}`,
        orderId: order.id,
      }),
    );
    return;
  }

  try {
    const stripe = getStripe();
    const baseUrl =
      process.env.PUBLIC_APP_URL ??
      `https://${process.env.REPLIT_DEV_DOMAIN ?? "localhost"}`;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: parsed.data.email ?? undefined,
      line_items: [
        ...cart.items.map((it) => ({
          quantity: it.quantity,
          price_data: {
            currency: cart.currency,
            unit_amount: it.product.priceCents,
            product_data: {
              name: it.product.name,
              images: it.product.images.slice(0, 1),
            },
          },
        })),
        ...(shippingCents > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: cart.currency,
                  unit_amount: shippingCents,
                  product_data: { name: "Shipping" },
                },
              },
            ]
          : []),
      ],
      success_url: `${baseUrl}/checkout/success?orderId=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cart`,
      metadata: { orderId: String(order.id) },
    });
    await db
      .update(ordersTable)
      .set({ stripeSessionId: session.id })
      .where(eq(ordersTable.id, order.id));
    res.json(
      CreateCheckoutResponse.parse({
        url: session.url ?? "",
        orderId: order.id,
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Stripe session creation failed");
    res.status(500).json({ error: "Failed to start checkout" });
  }
});

router.get("/orders/me", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req)!;
  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.userId, userId))
    .orderBy(desc(ordersTable.createdAt));
  const enriched = await Promise.all(
    orders.map(async (o) => (await buildOrderResponse(o.id))!),
  );
  res.json(ListMyOrdersResponse.parse(enriched));
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const order = await buildOrderResponse(params.data.id);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  res.json(GetOrderResponse.parse(order));
});

export default router;
export { buildOrderResponse };
