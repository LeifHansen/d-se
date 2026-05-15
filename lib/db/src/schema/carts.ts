import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const cartsTable = pgTable(
  "carts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    email: text("email"),
    discountCodeId: integer("discount_code_id"),
    discountCode: text("discount_code"),
    checkedOutAt: timestamp("checked_out_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "carts_email_canonical_check",
      sql`${t.email} IS NULL OR (length(${t.email}) > 0 AND ${t.email} = lower(btrim(${t.email})) AND ${t.email} ~ '^[^@\s]+@[^@\s]+$')`,
    ),
  ],
);

export const cartItemsTable = pgTable("cart_items", {
  id: serial("id").primaryKey(),
  cartId: text("cart_id")
    .notNull()
    .references(() => cartsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Cart = typeof cartsTable.$inferSelect;
export type CartItem = typeof cartItemsTable.$inferSelect;
