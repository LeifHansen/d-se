import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const customersTable = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("customers_email_unique").on(t.email)],
);

export type Customer = typeof customersTable.$inferSelect;
