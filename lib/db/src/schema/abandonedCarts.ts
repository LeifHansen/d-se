import {
  pgTable,
  serial,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { cartsTable } from "./carts";

export const abandonedCartsTable = pgTable(
  "abandoned_carts",
  {
    id: serial("id").primaryKey(),
    cartId: text("cart_id")
      .notNull()
      .references(() => cartsTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    userId: text("user_id"),
    firstReminderSentAt: timestamp("first_reminder_sent_at"),
    secondReminderSentAt: timestamp("second_reminder_sent_at"),
    recoveredAt: timestamp("recovered_at"),
    recoveredOrderId: text("recovered_order_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("abandoned_carts_cart_idx").on(t.cartId),
    index("abandoned_carts_email_idx").on(t.email),
  ],
);

export type AbandonedCart = typeof abandonedCartsTable.$inferSelect;
