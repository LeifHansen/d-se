import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const discountCodesTable = pgTable(
  "discount_codes",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(),
    type: text("type").notNull(),
    value: integer("value").notNull(),
    minSubtotalCents: integer("min_subtotal_cents"),
    maxRedemptions: integer("max_redemptions"),
    redemptionsCount: integer("redemptions_count").notNull().default(0),
    expiresAt: timestamp("expires_at"),
    active: boolean("active").notNull().default(true),
    stripeCouponId: text("stripe_coupon_id"),
    stripePromotionCodeId: text("stripe_promotion_code_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("discount_codes_code_idx").on(t.code)],
);

export type DiscountCode = typeof discountCodesTable.$inferSelect;
export type DiscountType = "percent" | "fixed";
