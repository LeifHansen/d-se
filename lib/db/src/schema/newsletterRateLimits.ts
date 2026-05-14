import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const newsletterRateLimitsTable = pgTable("newsletter_rate_limits", {
  ip: text("ip").primaryKey(),
  hits: integer("hits").notNull().default(0),
  windowStart: timestamp("window_start").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type NewsletterRateLimit = typeof newsletterRateLimitsTable.$inferSelect;
