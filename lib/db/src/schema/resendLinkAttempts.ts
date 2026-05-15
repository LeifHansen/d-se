import {
  pgTable,
  text,
  integer,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";

export const resendLinkAttemptsTable = pgTable(
  "resend_link_attempts",
  {
    ip: text("ip").notNull(),
    orderId: integer("order_id").notNull(),
    count: integer("count").notNull().default(0),
    firstAt: timestamp("first_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.ip, t.orderId] }) }),
);

export type ResendLinkAttempt = typeof resendLinkAttemptsTable.$inferSelect;
