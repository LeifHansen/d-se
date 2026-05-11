import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const systemMetricsTable = pgTable("system_metrics", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SystemMetric = typeof systemMetricsTable.$inferSelect;
