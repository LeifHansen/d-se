import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const newsletterSubscribersTable = pgTable("newsletter_subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  source: text("source"),
  resendContactId: text("resend_contact_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type NewsletterSubscriber =
  typeof newsletterSubscribersTable.$inferSelect;
