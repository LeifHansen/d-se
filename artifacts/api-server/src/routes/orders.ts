import { Router, type IRouter } from "express";
import type Stripe from "stripe";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  ordersTable,
  orderItemsTable,
  cartItemsTable,
  cartsTable,
  productsTable,
  orderLookupFailuresTable,
  type OrderAddress,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  CreateCheckoutBody,
  CreateCheckoutResponse,
  ListMyOrdersResponse,
  GetOrderParams,
  GetOrderQueryParams,
  GetOrderResponse,
  LookupOrderBody,
  LookupOrderByTokenBody,
} from "@workspace/api-zod";

import { loadCart, ensureCart } from "./cart";
import { computeShippingRates } from "./shipping";
import { getStripe, isStripeConfigured } from "../lib/stripe";
import { getUserId, requireAuth } from "../lib/auth";
import {
  sendOrderConfirmation,
  sendOrderLinkEmail,
  buildTrackingUrl,
} from "../lib/email";
import { signOrderToken, verifyOrderToken } from "../lib/orderToken";
import { SITE_URL } from "../lib/site-url";
import {
  validateDiscount,
  ensureStripePromotionCode,
} from "../lib/discounts";
import { recordAbandonedCart } from "../lib/abandonedCart";
import { normaliseEmail } from "../lib/normaliseEmail";

const STRIPE_TAX_ENABLED = process.env.STRIPE_TAX_ENABLED === "1";

const router: IRouter = Router();

// Persistent rate limit for the guest order lookup endpoint. Counts failed
// attempts per (ip, orderId) in Postgres so the throttle survives restarts
// and applies across every API process. Once the threshold is exceeded
// within the window we short-circuit with 429. Successful lookups clear the
// counter so legitimate users aren't penalised by an earlier mistype.
const LOOKUP_MAX_FAILS = 5;
const LOOKUP_WINDOW_MINUTES = 10;

async function checkLookupRateLimit(
  ip: string,
  orderId: number,
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  const result = await db.execute<{ count: number; first_at: Date | string }>(sql`
    SELECT count, first_at FROM order_lookup_failures
    WHERE ip = ${ip} AND order_id = ${orderId}
      AND first_at > NOW() - (${LOOKUP_WINDOW_MINUTES}::int * INTERVAL '1 minute')
  `);
  const row = result.rows[0];
  if (!row) return { allowed: true };
  const count = Number(row.count);
  if (count < LOOKUP_MAX_FAILS) return { allowed: true };
  const firstAtMs = new Date(row.first_at).getTime();
  const retryAfterMs =
    LOOKUP_WINDOW_MINUTES * 60 * 1000 - (Date.now() - firstAtMs);
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  };
}

async function recordLookupFailure(ip: string, orderId: number): Promise<void> {
  // Atomic upsert: reset the counter when the existing window has expired,
  // otherwise increment. Mirrors the contact_rate_limits pattern.
  await db.execute(sql`
    INSERT INTO order_lookup_failures (ip, order_id, count, first_at, updated_at)
    VALUES (${ip}, ${orderId}, 1, NOW(), NOW())
    ON CONFLICT (ip, order_id) DO UPDATE SET
      count = CASE
        WHEN order_lookup_failures.first_at < NOW() - (${LOOKUP_WINDOW_MINUTES}::int * INTERVAL '1 minute')
          THEN 1
        ELSE order_lookup_failures.count + 1
      END,
      first_at = CASE
        WHEN order_lookup_failures.first_at < NOW() - (${LOOKUP_WINDOW_MINUTES}::int * INTERVAL '1 minute')
          THEN NOW()
        ELSE order_lookup_failures.first_at
      END,
      updated_at = NOW()
  `);
}

async function clearLookupFailures(ip: string, orderId: number): Promise<void> {
  await db
    .delete(orderLookupFailuresTable)
    .where(
      and(
        eq(orderLookupFailuresTable.ip, ip),
        eq(orderLookupFailuresTable.orderId, orderId),
      ),
    );
}

export async function __resetLookupRateLimitForTests(): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE order_lookup_failures`);
}

// Independent throttle for the resend-link endpoint. Bucket by (ip, orderId)
// so an attacker can't spam an inbox by hammering arbitrary order ids, and
// keep it separate from the lookup throttle so a successful resend doesn't
// reset the brute-force budget on /lookup (and vice versa). Persisted in
// Postgres (mirroring order_lookup_failures) so the budget survives restarts
// and is shared across every API process.
const RESEND_MAX_ATTEMPTS = 3;
const RESEND_WINDOW_MINUTES = 60;

async function checkResendRateLimit(
  ip: string,
  orderId: number,
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  const result = await db.execute<{ count: number; first_at: Date | string }>(sql`
    SELECT count, first_at FROM resend_link_attempts
    WHERE ip = ${ip} AND order_id = ${orderId}
      AND first_at > NOW() - (${RESEND_WINDOW_MINUTES}::int * INTERVAL '1 minute')
  `);
  const row = result.rows[0];
  if (!row) return { allowed: true };
  const count = Number(row.count);
  if (count < RESEND_MAX_ATTEMPTS) return { allowed: true };
  const firstAtMs = new Date(row.first_at).getTime();
  const retryAfterMs =
    RESEND_WINDOW_MINUTES * 60 * 1000 - (Date.now() - firstAtMs);
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  };
}

async function recordResendAttempt(ip: string, orderId: number): Promise<void> {
  // Atomic upsert: reset the counter when the existing window has expired,
  // otherwise increment. Mirrors checkLookupRateLimit / recordLookupFailure.
  await db.execute(sql`
    INSERT INTO resend_link_attempts (ip, order_id, count, first_at, updated_at)
    VALUES (${ip}, ${orderId}, 1, NOW(), NOW())
    ON CONFLICT (ip, order_id) DO UPDATE SET
      count = CASE
        WHEN resend_link_attempts.first_at < NOW() - (${RESEND_WINDOW_MINUTES}::int * INTERVAL '1 minute')
          THEN 1
        ELSE resend_link_attempts.count + 1
      END,
      first_at = CASE
        WHEN resend_link_attempts.first_at < NOW() - (${RESEND_WINDOW_MINUTES}::int * INTERVAL '1 minute')
          THEN NOW()
        ELSE resend_link_attempts.first_at
      END,
      updated_at = NOW()
  `);
}

export async function __resetResendRateLimitForTests(): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE resend_link_attempts`);
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
  // Annotate each line item with current availability so the storefront can
  // surface "Unavailable" / "Out of stock" inline (and disable Reorder when
  // nothing is purchasable). Mirrors the logic in POST /orders/:id/reorder.
  const enrichedItems = await Promise.all(
    items.map(async (it) => {
      const [product] = await db
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, it.productId));
      let available = true;
      let unavailableReason: "unavailable" | "out_of_stock" | null = null;
      if (!product || !product.published) {
        available = false;
        unavailableReason = "unavailable";
      } else if (product.inventory < it.quantity) {
        available = false;
        unavailableReason = "out_of_stock";
      }
      return { ...it, available, unavailableReason };
    }),
  );
  return {
    id: order.id,
    status: order.status,
    email: order.email,
    items: enrichedItems,
    subtotalCents: order.subtotalCents,
    shippingCents: order.shippingCents,
    taxCents: order.taxCents,
    discountCents: order.discountCents,
    discountCode: order.discountCode,
    totalCents: order.totalCents,
    currency: order.currency,
    shippingAddress: order.shippingAddress ?? undefined,
    trackingCode: order.trackingCode,
    carrier: order.carrier,
    trackingUrl: order.trackingCode
      ? buildTrackingUrl(order.carrier, order.trackingCode)
      : null,
    labelUrl: order.labelUrl,
    customerId: order.customerId,
    deliveredEmailSentAt: order.deliveredEmailSentAt,
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

  // Re-check inventory server-side. The storefront warns and disables Pay
  // when an item is sold out, but a stale tab or hand-crafted request could
  // still POST here. Re-read each line's product.inventory and reject with
  // a structured 409 when anything is short, before we create a Stripe
  // session that would fail or oversell.
  const productIds = Array.from(new Set(cart.items.map((it) => it.productId)));
  const freshProducts = await db
    .select()
    .from(productsTable)
    .where(inArray(productsTable.id, productIds));
  const inventoryById = new Map(
    freshProducts.map((p) => [p.id, p.inventory ?? 0]),
  );
  const stockIssues = cart.items
    .map((it) => {
      const available = inventoryById.get(it.productId) ?? 0;
      if (available <= 0) {
        return {
          productId: it.productId,
          productName: it.product.name,
          requested: it.quantity,
          available,
          kind: "out_of_stock" as const,
        };
      }
      if (it.quantity > available) {
        return {
          productId: it.productId,
          productName: it.product.name,
          requested: it.quantity,
          available,
          kind: "insufficient_stock" as const,
        };
      }
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (stockIssues.length > 0) {
    const first = stockIssues[0];
    const message =
      stockIssues.length === 1
        ? first.kind === "out_of_stock"
          ? `${first.productName} is out of stock. Please update your bag before paying.`
          : `Only ${first.available} of ${first.productName} left. Please update your bag before paying.`
        : "Some items in your bag aren't available in the quantity you selected. Please update your bag before paying.";
    res.status(409).json({
      error: message,
      code: "stock_unavailable",
      issues: stockIssues,
    });
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

  const normalisedEmail = normaliseEmail(parsed.data.email);

  // Track an abandoned-cart record now that we have an email.
  if (normalisedEmail) {
    try {
      await recordAbandonedCart({
        cartId: parsed.data.cartId,
        email: normalisedEmail,
        userId,
      });
      await db
        .update(cartsTable)
        .set({ email: normalisedEmail, updatedAt: new Date() })
        .where(eq(cartsTable.id, parsed.data.cartId));
    } catch (err) {
      req.log.warn({ err }, "Failed to record abandoned cart");
    }
  }

  const [order] = await db
    .insert(ordersTable)
    .values({
      userId,
      email: normalisedEmail,
      status: "pending",
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
    const baseUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:5173";

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
      customer_email: normalisedEmail ?? undefined,
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
  // Order emails are normalised at write time (see normaliseEmail), so a
  // simple equality check on row.email would suffice. We still normalise the
  // submitted value here as defence in depth — clients can still send
  // arbitrary casing/whitespace, and historic rows pre-migration may exist.
  const submittedEmail = parsed.data.email.trim().toLowerCase();
  if (!submittedEmail) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  // Throttle brute-force attempts before doing any DB work. Bucket by client
  // IP + orderId so an attacker can't cheaply script millions of token /
  // email guesses against a known orderId.
  //
  // Use req.ip only — Express resolves it from x-forwarded-for ONLY when
  // `trust proxy` is configured for known upstream proxies. Reading the
  // header directly would let an attacker spoof a fresh IP per request and
  // bypass the limit entirely.
  const clientIp = req.ip || "unknown";
  const limit = await checkLookupRateLimit(clientIp, parsed.data.orderId);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSeconds));
    res.status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }

  const [row] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, parsed.data.orderId));
  // Don't leak whether the order exists when credentials don't match.
  if (!row || !row.email || row.email !== submittedEmail) {
    await recordLookupFailure(clientIp, parsed.data.orderId);
    res.status(404).json({ error: "Order not found" });
    return;
  }
  await clearLookupFailures(clientIp, parsed.data.orderId);
  const order = await buildOrderResponse(row.id);
  res.json(GetOrderResponse.parse(order));
});

router.post("/orders/by-token", async (req, res): Promise<void> => {
  const parsed = LookupOrderByTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const verified = verifyOrderToken(parsed.data.token);
  if (!verified) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const [row] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, verified.orderId));
  if (!row) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  // The token is scoped to {orderId, email}; require the order's email on
  // file to still match the token's email so a token rotated by a re-checkout
  // (or a wiped email) cannot be replayed.
  if (
    !row.email ||
    row.email.trim().toLowerCase() !== verified.email.trim().toLowerCase()
  ) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const order = await buildOrderResponse(row.id);
  res.json(GetOrderResponse.parse(order));
});

router.post("/orders/:id/resend-link", async (req, res): Promise<void> => {
  const idNum = Number(req.params.id);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }
  const submittedEmail =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
  if (!submittedEmail || !/.+@.+\..+/.test(submittedEmail)) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  // See note on /orders/lookup re: req.ip and trust-proxy. Bucket the throttle
  // by (ip, orderId) so an attacker can't cheaply spam arbitrary inboxes by
  // flipping the email field.
  const clientIp = req.ip || "unknown";
  const limit = await checkResendRateLimit(clientIp, idNum);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSeconds));
    res.status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }
  // Count every attempt — including the misses — so the throttle protects
  // arbitrary inboxes from being targeted, not just the address on file.
  await recordResendAttempt(clientIp, idNum);

  const [row] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, idNum));

  // Always respond 200 so callers can't tell whether (orderId, email) matched.
  // The email is only actually sent when the submitted address matches the one
  // on file — this prevents the endpoint from being weaponised to send mail to
  // arbitrary recipients, and also avoids leaking which orders exist.
  if (row?.email && row.email === submittedEmail) {
    try {
      const token = signOrderToken({ orderId: idNum, email: row.email });
      const orderUrl = `${SITE_URL}/orders/${idNum}?token=${encodeURIComponent(
        token,
      )}`;
      await sendOrderLinkEmail({
        to: row.email,
        orderId: idNum,
        orderUrl,
      });
    } catch (err) {
      req.log.warn({ err, orderId: idNum }, "Failed to resend order link");
    }
  }

  res.json({ ok: true });
});

router.post("/orders/:id/reorder", async (req, res): Promise<void> => {
  const idNum = Number(req.params.id);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to reorder" });
    return;
  }
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, idNum));
  if (!order || order.userId !== userId) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const items = await db
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, idNum));

  const requestedCartId =
    typeof req.body?.cartId === "string" && req.body.cartId.length > 0
      ? req.body.cartId
      : null;
  const cartId = await ensureCart(requestedCartId);

  const skipped: Array<{
    productId: number | null;
    productName: string;
    quantity: number;
    reason: "unavailable" | "out_of_stock";
  }> = [];

  for (const item of items) {
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, item.productId));
    if (!product || !product.published) {
      skipped.push({
        productId: product?.id ?? item.productId,
        productName: item.productName,
        quantity: item.quantity,
        reason: "unavailable",
      });
      continue;
    }
    if (product.inventory < item.quantity) {
      skipped.push({
        productId: product.id,
        productName: item.productName,
        quantity: item.quantity,
        reason: "out_of_stock",
      });
      continue;
    }
    const addQty = item.quantity;
    const [existing] = await db
      .select()
      .from(cartItemsTable)
      .where(
        and(
          eq(cartItemsTable.cartId, cartId),
          eq(cartItemsTable.productId, product.id),
        ),
      );
    if (existing) {
      await db
        .update(cartItemsTable)
        .set({ quantity: existing.quantity + addQty })
        .where(eq(cartItemsTable.id, existing.id));
    } else {
      await db.insert(cartItemsTable).values({
        cartId,
        productId: product.id,
        quantity: addQty,
      });
    }
  }

  const cart = await loadCart(cartId);
  res.json({ cart, skipped });
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const query = GetOrderQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const userId = getUserId(req);
  // Require some proof-of-ownership claim before we even look the order up.
  // Without a signed-in user or a guest receipt token (cartId / Stripe session
  // id), there's nothing to authorize against, so this is just unauthenticated.
  if (userId === null && !query.data.cartId && !query.data.sessionId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [row] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  // Authorize: signed-in owner, OR a guest presenting the originating cart id
  // / Stripe Checkout session id (the receipt link they were redirected to).
  // Don't leak existence to anyone else.
  const ownsOrder = userId !== null && row.userId === userId;
  const cartIdMatches =
    !!query.data.cartId && !!row.cartId && row.cartId === query.data.cartId;
  const sessionIdMatches =
    !!query.data.sessionId &&
    !!row.stripeSessionId &&
    row.stripeSessionId === query.data.sessionId;
  if (!ownsOrder && !cartIdMatches && !sessionIdMatches) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const order = await buildOrderResponse(params.data.id);
  res.json(GetOrderResponse.parse(order));
});

export default router;
export { buildOrderResponse };
