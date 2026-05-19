import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const STOCK_EVENT_REASONS = [
  "manual_edit",
  "order_paid",
  "order_refunded",
  "order_payment_failed",
] as const;

export type StockEventReason = (typeof STOCK_EVENT_REASONS)[number];

export const stockEventsTable = pgTable(
  "stock_events",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull(),
    delta: integer("delta").notNull(),
    newInventory: integer("new_inventory").notNull(),
    reason: text("reason").$type<StockEventReason>().notNull(),
    orderId: integer("order_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("stock_events_product_id_created_at_idx").on(
      t.productId,
      t.createdAt,
    ),
  ],
);

export type StockEvent = typeof stockEventsTable.$inferSelect;
export type InsertStockEvent = typeof stockEventsTable.$inferInsert;
