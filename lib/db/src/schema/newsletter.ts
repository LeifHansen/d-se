import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

export const newsletterSubscribersTable = pgTable(
  "newsletter_subscribers",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    source: text("source"),
    resendContactId: text("resend_contact_id"),
    status: text("status").notNull().default("active"),
    unsubscribeToken: text("unsubscribe_token").unique(),
    unsubscribedAt: timestamp("unsubscribed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("newsletter_subscribers_status_idx").on(t.status),
  }),
);

export type NewsletterSubscriber =
  typeof newsletterSubscribersTable.$inferSelect;
