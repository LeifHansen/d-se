import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb, pglite } from "./testDb";
import { stripeProcessedEventsTable } from "@workspace/db";
import { cleanupStripeProcessedEvents } from "../lib/stripeEventCleanup";

describe("cleanupStripeProcessedEvents", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("deletes rows older than 30 days and keeps fresh ones", async () => {
    const now = new Date("2026-05-14T12:00:00Z");

    // Insert with explicit processed_at via raw SQL so we can backdate.
    await pglite.exec(`
      INSERT INTO stripe_processed_events (event_id, event_type, processed_at) VALUES
        ('evt_old',     'checkout.session.completed', '2026-04-01T00:00:00Z'),
        ('evt_edge',    'checkout.session.completed', '2026-04-13T00:00:00Z'),
        ('evt_recent',  'checkout.session.completed', '2026-05-10T00:00:00Z'),
        ('evt_today',   'checkout.session.completed', '2026-05-14T11:00:00Z');
    `);

    const removed = await cleanupStripeProcessedEvents(now);
    // 'evt_old' (43 days) and 'evt_edge' (31 days) are past the 30-day cutoff.
    expect(removed).toBe(2);

    const remaining = await db.select().from(stripeProcessedEventsTable);
    const ids = remaining.map((r) => r.eventId).sort();
    expect(ids).toEqual(["evt_recent", "evt_today"]);
  });

  it("returns 0 when nothing is old enough to prune", async () => {
    const now = new Date("2026-05-14T12:00:00Z");
    await db.insert(stripeProcessedEventsTable).values({
      eventId: "evt_fresh",
      eventType: "checkout.session.completed",
    });
    const removed = await cleanupStripeProcessedEvents(now);
    expect(removed).toBe(0);
    const rows = await db.select().from(stripeProcessedEventsTable);
    expect(rows).toHaveLength(1);
  });
});
