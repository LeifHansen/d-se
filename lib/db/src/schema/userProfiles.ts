import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import type { OrderAddress } from "./orders";

export const userProfilesTable = pgTable("user_profiles", {
  userId: text("user_id").primaryKey(),
  savedAddress: jsonb("saved_address").$type<OrderAddress | null>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type UserProfile = typeof userProfilesTable.$inferSelect;
