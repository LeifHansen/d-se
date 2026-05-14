import { Router, type IRouter } from "express";
import { randomBytes, timingSafeEqual } from "crypto";
import type Stripe from "stripe";
import { desc, eq } from "drizzle-orm";
import {
  db,
  ordersTable,
  orderItemsTable,
  cartItemsTable,
  cartsTable,
  productsTable,
  type OrderAddress,
} from "@workspace/db";
import {
  CreateCheckoutBody,
  CreateCheckoutResponse,
  ListMyOrdersResponse,
  GetOrderParams,
  GetOrderResponse,
  LookupOrderBody,
} from "@workspace/api-zod";
import { loadCart } from "./cart";
import { computeShippingRates } from "./shipping";
import { getStripe, isStripeConfigured } from "../lib/stripe";
import { getUserId, requireAuth } from "../lib/auth";
import { sendOrderConfirmation } from "../lib/email";
import {
  validateDiscount,
  ensureStripePromotionCode,
} from "../lib/discounts";
import { recordAbandonedCart } from "../lib/abandonedCart";

const STRIPE_TAX_ENABLED = process.env.STRIPE_TAX_ENABLED === "1";

const router: IRouter = Router();

function generateLookupToken(): string {
  return randomBytes(32).toString("base64url");
}

function tokensMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

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
    discountCents: order.discountCents,
    discountCode: order.discountCode,
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
  const address = (parsed.data.address ?? null) as OrderAddress | null;

  // Server-side shipping price lookup — never trust client-supplied amounts.
  // When the cart hands off without an address (Stripe Checkout collects it),
  // we leave shipping at $0 here and rely on Stripe's shipping_address_collection.
  let shippingCents = 0;
  if (parsed.data.shippingRateId) {
    if (!address) {
      res
        .status(400)
        .json({ error: "Shipping address is required to select a shipping rate" });
      return;
    }
    try {
      const rates = await computeShippingRates(cart, address);
      const chosen = rates.find((r) => r.id === parsed.data.shippingRateId);
      if (!chosen) {
        res.status(400).json({ error: "Selected shipping rate is no longer available" });
        return;
      }
      shippingCents = chosen.amountCents;
    } catch (err) {
      req.log.error({ err }, "Failed to verify shipping rate");
      res.status(500).json({ error: "Failed to verify shipping rate" });
      return;
    }
  }
  const subtotalCents = cart.subtotalCents;

  // Discount validation (server-side authoritative). Fall back to the code
  // persisted on the cart (via POST /cart/discount) when the request body
  // omits one, so cart and checkout stay consistent.
  let discountCents = 0;
  let discountCodeId: number | null = null;
  let discountCode: string | null = null;
  const requestedDiscountCode =
    parsed.data.discountCode ?? cart.discountCode ?? null;
  if (requestedDiscountCode) {
    const v = await validateDiscount(requestedDiscountCode, subtotalCents);
    if (!v.valid) {
      res.status(400).json({ error: `Discount: ${v.reason}` });
      return;
    }
    discountCents = v.discountCents;
    discountCodeId = v.code.id;
    discountCode = v.code.code;
  }

  const totalCents = Math.max(0, subtotalCents - discountCents) + shippingCents;

  // Track an abandoned-cart record now that we have an email.
  if (parsed.data.email) {
    try {
      await recordAbandonedCart({
        cartId: parsed.data.cartId,
        email: parsed.data.email,
        userId,
      });
      await db
        .update(cartsTable)
        .set({ email: parsed.data.email, updatedAt: new Date() })
        .where(eq(cartsTable.id, parsed.data.cartId));
    } catch (err) {
      req.log.warn({ err }, "Failed to record abandoned cart");
    }
  }

  const [order] = await db
    .insert(ordersTable)
    .values({
      userId,
      email: parsed.data.email ?? null,
      status: "pending",
      lookupToken: generateLookupToken(),
      subtotalCents,
      shippingCents,
      taxCents: 0,
      discountCents,
      discountCodeId,
      discountCode,
      totalCents,
      currency: cart.currency,
      shippingAddress: address ?? undefined,
      shippingRateId: parsed.data.shippingRateId,
      cartId: parsed.data.cartId,
      analyticsEventId: parsed.data.analyticsEventId ?? null,
      analyticsClientId: parsed.data.analyticsClientId ?? null,
      analyticsFbp: parsed.data.analyticsFbp ?? null,
      analyticsFbc: parsed.data.analyticsFbc ?? null,
      analyticsClientIp:
        (req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ??
          req.ip ??
          null),
      analyticsUserAgent: req.headers["user-agent"]?.toString() ?? null,
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

  if (!(await isStripeConfigured())) {
    // Dev fallback: skip Stripe; mark order as paid immediately.
    await db
      .update(ordersTable)
      .set({ status: "paid" })
      .where(eq(ordersTable.id, order.id));
    await db
      .delete(cartItemsTable)
      .where(eq(cartItemsTable.cartId, parsed.data.cartId));
    await db
      .update(cartsTable)
      .set({ checkedOutAt: new Date() })
      .where(eq(cartsTable.id, parsed.data.cartId));
    res.json(
      CreateCheckoutResponse.parse({
        url: `/checkout/success?orderId=${order.id}`,
        orderId: order.id,
      }),
    );
    return;
  }

  try {
    const stripe = await getStripe();
    const baseUrl =
      process.env.PUBLIC_APP_URL ??
      `https://${process.env.REPLIT_DEV_DOMAIN ?? "localhost"}`;

    // Attach a Stripe Promotion Code if a discount was validated. This is
    // authoritative: the discount has already been applied to the order total,
    // so the Stripe Checkout charge MUST also reflect it. If we cannot attach
    // the promotion code, abort the checkout instead of charging the full
    // (undiscounted) total.
    let promotionCodeId: string | null = null;
    if (discountCodeId) {
      try {
        const v = await validateDiscount(discountCode!, subtotalCents);
        if (!v.valid) {
          throw new Error(v.reason);
        }
        promotionCodeId = await ensureStripePromotionCode(stripe, v.code);
      } catch (err) {
        req.log.error(
          { err, discountCode },
          "Failed to attach Stripe promotion code; aborting checkout",
        );
        res.status(502).json({
          error:
            "Could not apply discount with payment provider. Please remove the code and try again.",
        });
        return;
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: parsed.data.email ?? undefined,
      // Required for Stripe Tax to determine the correct ship-to jurisdiction
      // for physical goods, and also when the cart hands off without an
      // address (Stripe Checkout collects it for us). The destination drives
      // tax calculation when Stripe Tax is enabled.
      shipping_address_collection:
        STRIPE_TAX_ENABLED || !address
          ? {
              allowed_countries: (
                process.env.STRIPE_SHIPPING_COUNTRIES ?? "US,CA"
              )
                .split(",")
                .map((c) => c.trim().toUpperCase())
                .filter(Boolean) as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection["allowed_countries"],
            }
          : undefined,
      line_items: [
        ...cart.items.map((it) => ({
          quantity: it.quantity,
          price_data: {
            currency: cart.currency,
            unit_amount: it.product.priceCents,
            product_data: {
              name: it.product.name,
              images: it.product.images.slice(0, 1),
              tax_code: process.env.STRIPE_TAX_CODE_PRODUCT ?? "txcd_99999999",
            },
            tax_behavior: "exclusive" as const,
          },
        })),
        ...(shippingCents > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: cart.currency,
                  unit_amount: shippingCents,
                  product_data: {
                    name: "Shipping",
                    tax_code:
                      process.env.STRIPE_TAX_CODE_SHIPPING ?? "txcd_92010001",
                  },
                  tax_behavior: "exclusive" as const,
                },
              },
            ]
          : []),
      ],
      automatic_tax: STRIPE_TAX_ENABLED ? { enabled: true } : undefined,
      discounts: promotionCodeId
        ? [{ promotion_code: promotionCodeId }]
        : undefined,
      success_url: `${baseUrl}/checkout/success?orderId=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cart`,
      metadata: {
        orderId: String(order.id),
        cartId: parsed.data.cartId,
        ...(discountCode ? { discountCode } : {}),
        ...(parsed.data.analyticsEventId
          ? { analyticsEventId: parsed.data.analyticsEventId }
          : {}),
      },
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

router.post("/orders/lookup", async (req, res): Promise<void> => {
  const parsed = LookupOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const submittedEmail = parsed.data.email?.trim().toLowerCase() ?? null;
  const submittedToken = parsed.data.token?.trim() ?? null;
  if (!submittedEmail && !submittedToken) {
    res.status(400).json({ error: "Email or token is required" });
    return;
  }
  const [row] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, parsed.data.orderId));
  // Don't leak whether the order exists when credentials don't match.
  if (!row) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  let authorized = false;
  if (submittedToken && row.lookupToken) {
    authorized = tokensMatch(row.lookupToken, submittedToken);
  }
  if (
    !authorized &&
    submittedEmail &&
    row.email &&
    row.email.trim().toLowerCase() === submittedEmail
  ) {
    authorized = true;
  }
  if (!authorized) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const order = await buildOrderResponse(row.id);
  res.json(GetOrderResponse.parse(order));
});

router.get("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = getUserId(req)!;
  const [row] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (row.userId !== userId) {
    // Don't leak existence to non-owners.
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const order = await buildOrderResponse(params.data.id);
  res.json(GetOrderResponse.parse(order));
});

export default router;
export { buildOrderResponse };
