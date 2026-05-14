import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const systemMetricsTable = pgTable("system_metrics", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SystemMetric = typeof systemMetricsTable.$inferSelect;

export const stripeProcessedEventsTable = pgTable("stripe_processed_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at").notNull().defaultNow(),
});

export type StripeProcessedEvent =
  typeof stripeProcessedEventsTable.$inferSelect;
