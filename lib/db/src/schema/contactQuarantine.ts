import {
  pgTable,
  serial,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const contactQuarantineTable = pgTable(
  "contact_quarantine",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    reasons: text("reasons").array().notNull().default([]),
    ip: text("ip"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    forwardedAt: timestamp("forwarded_at"),
    markedLegitAt: timestamp("marked_legit_at"),
  },
  (t) => ({
    expiresIdx: index("contact_quarantine_expires_idx").on(t.expiresAt),
    createdIdx: index("contact_quarantine_created_idx").on(t.createdAt),
  }),
);

export type ContactQuarantineEntry =
  typeof contactQuarantineTable.$inferSelect;
