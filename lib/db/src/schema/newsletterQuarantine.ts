import {
  pgTable,
  serial,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const newsletterQuarantineTable = pgTable(
  "newsletter_quarantine",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    source: text("source"),
    reasons: text("reasons").array().notNull().default([]),
    ip: text("ip"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    markedLegitAt: timestamp("marked_legit_at"),
  },
  (t) => ({
    expiresIdx: index("newsletter_quarantine_expires_idx").on(t.expiresAt),
    createdIdx: index("newsletter_quarantine_created_idx").on(t.createdAt),
  }),
);

export type NewsletterQuarantineEntry =
  typeof newsletterQuarantineTable.$inferSelect;
