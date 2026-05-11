import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const productReviewsTable = pgTable(
  "product_reviews",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    orderId: integer("order_id"),
    rating: integer("rating").notNull(),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    status: text("status").notNull().default("pending"),
    verifiedPurchase: boolean("verified_purchase").notNull().default(false),
    authorName: text("author_name"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("product_reviews_product_idx").on(t.productId),
    index("product_reviews_status_idx").on(t.status),
  ],
);

export type ProductReview = typeof productReviewsTable.$inferSelect;
export type ReviewStatus = "pending" | "approved" | "rejected";
