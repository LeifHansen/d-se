import { eq } from "drizzle-orm";
import { db, discountCodesTable, type DiscountCode } from "@workspace/db";
import { getStripe } from "./stripe";
import type Stripe from "stripe";

export type ValidationResult =
  | {
      valid: true;
      code: DiscountCode;
      discountCents: number;
      subtotalCents: number;
      totalCents: number;
    }
  | { valid: false; reason: string };

export async function findDiscountByCode(
  code: string,
): Promise<DiscountCode | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const [row] = await db
    .select()
    .from(discountCodesTable)
    .where(eq(discountCodesTable.code, normalized));
  return row ?? null;
}

export function computeDiscountCents(
  type: string,
  value: number,
  subtotalCents: number,
): number {
  if (type === "percent") {
    const pct = Math.max(0, Math.min(100, value));
    return Math.floor((subtotalCents * pct) / 100);
  }
  if (type === "fixed") {
    return Math.max(0, Math.min(subtotalCents, value));
  }
  return 0;
}

export async function validateDiscount(
  code: string,
  subtotalCents: number,
): Promise<ValidationResult> {
  const row = await findDiscountByCode(code);
  if (!row) return { valid: false, reason: "Invalid code" };
  if (!row.active) return { valid: false, reason: "Code is inactive" };
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    return { valid: false, reason: "Code has expired" };
  }
  if (
    row.maxRedemptions != null &&
    row.redemptionsCount >= row.maxRedemptions
  ) {
    return { valid: false, reason: "Code has reached its redemption limit" };
  }
  if (
    row.minSubtotalCents != null &&
    subtotalCents < row.minSubtotalCents
  ) {
    return {
      valid: false,
      reason: `Order subtotal must be at least $${(row.minSubtotalCents / 100).toFixed(
        2,
      )}`,
    };
  }
  const discountCents = computeDiscountCents(
    row.type,
    row.value,
    subtotalCents,
  );
  return {
    valid: true,
    code: row,
    discountCents,
    subtotalCents,
    totalCents: subtotalCents - discountCents,
  };
}

export async function ensureStripePromotionCode(
  stripe: Stripe,
  row: DiscountCode,
): Promise<string | null> {
  // Returns the Stripe Promotion Code ID to attach to the Checkout Session.
  if (row.stripePromotionCodeId) return row.stripePromotionCodeId;

  let couponId = row.stripeCouponId;
  if (!couponId) {
    const couponParams: Stripe.CouponCreateParams =
      row.type === "percent"
        ? { percent_off: row.value, duration: "once", name: row.code }
        : {
            amount_off: row.value,
            currency: "usd",
            duration: "once",
            name: row.code,
          };
    const coupon = await stripe.coupons.create(couponParams);
    couponId = coupon.id;
  }

  const promo = await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: couponId },
    code: row.code,
    active: row.active,
    expires_at: row.expiresAt
      ? Math.floor(row.expiresAt.getTime() / 1000)
      : undefined,
    max_redemptions: row.maxRedemptions ?? undefined,
    restrictions:
      row.minSubtotalCents != null
        ? {
            minimum_amount: row.minSubtotalCents,
            minimum_amount_currency: "usd",
          }
        : undefined,
  });

  await db
    .update(discountCodesTable)
    .set({
      stripeCouponId: couponId,
      stripePromotionCodeId: promo.id,
      updatedAt: new Date(),
    })
    .where(eq(discountCodesTable.id, row.id));

  return promo.id;
}
