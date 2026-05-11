import {
  pgTable,
  serial,
  text,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

export type OrderAddress = {
  name: string;
  street1: string;
  street2?: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string | null;
};

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  email: text("email"),
  status: text("status").notNull().default("pending"),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  shippingCents: integer("shipping_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  currency: text("currency").notNull().default("usd"),
  shippingAddress: jsonb("shipping_address").$type<OrderAddress | null>(),
  shippingRateId: text("shipping_rate_id"),
  shipmentId: text("shipment_id"),
  trackingCode: text("tracking_code"),
  labelUrl: text("label_url"),
  stripeSessionId: text("stripe_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  discountCodeId: integer("discount_code_id"),
  discountCode: text("discount_code"),
  discountCents: integer("discount_cents").notNull().default(0),
  cartId: text("cart_id"),
  analyticsEventId: text("analytics_event_id"),
  analyticsClientId: text("analytics_client_id"),
  analyticsFbp: text("analytics_fbp"),
  analyticsFbc: text("analytics_fbc"),
  analyticsClientIp: text("analytics_client_ip"),
  analyticsUserAgent: text("analytics_user_agent"),
  purchaseTrackedAt: timestamp("purchase_tracked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull(),
  productImage: text("product_image"),
  quantity: integer("quantity").notNull(),
  priceCents: integer("price_cents").notNull(),
});

export type Order = typeof ordersTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;
