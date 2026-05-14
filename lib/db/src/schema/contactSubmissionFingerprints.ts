import {
  pgTable,
  text,
  integer,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";

export const contactSubmissionFingerprintsTable = pgTable(
  "contact_submission_fingerprints",
  {
    hash: text("hash").notNull(),
    ip: text("ip").notNull(),
    count: integer("count").notNull().default(0),
    firstSeen: timestamp("first_seen").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.hash, t.ip] }) }),
);

export type ContactSubmissionFingerprint =
  typeof contactSubmissionFingerprintsTable.$inferSelect;
