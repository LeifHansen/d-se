import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb, pglite } from "./testDb";
import {
  contactRateLimitsTable,
  contactSubmissionFingerprintsTable,
  newsletterRateLimitsTable,
  orderLookupFailuresTable,
  resendLinkAttemptsTable,
} from "@workspace/db";
import { cleanupSpamTracking } from "../lib/spamTrackingCleanup";

describe("cleanupSpamTracking", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("prunes rows older than the longest window plus safety margin", async () => {
    const now = new Date("2026-05-15T12:00:00Z");

    // contact_rate_limits: 10-minute window + 24h safety margin -> ~24h10m cutoff.
    await pglite.exec(`
      INSERT INTO contact_rate_limits (ip, hits, window_start, updated_at) VALUES
        ('1.1.1.1', 3, '2026-05-13T00:00:00Z', '2026-05-13T00:00:00Z'),
        ('2.2.2.2', 1, '2026-05-15T11:00:00Z', '2026-05-15T11:00:00Z');
    `);

    // contact_submission_fingerprints: 60-minute window + 24h safety margin -> 25h cutoff.
    await pglite.exec(`
      INSERT INTO contact_submission_fingerprints (hash, ip, count, first_seen, updated_at) VALUES
        ('hash_old',    '1.1.1.1', 5, '2026-05-13T00:00:00Z', '2026-05-13T00:00:00Z'),
        ('hash_recent', '2.2.2.2', 1, '2026-05-15T10:00:00Z', '2026-05-15T10:00:00Z');
    `);

    // newsletter_rate_limits: 60-minute window + 24h safety margin -> 25h cutoff.
    await pglite.exec(`
      INSERT INTO newsletter_rate_limits (ip, hits, window_start, updated_at) VALUES
        ('1.1.1.1', 4, '2026-05-13T00:00:00Z', '2026-05-13T00:00:00Z'),
        ('2.2.2.2', 1, '2026-05-15T11:00:00Z', '2026-05-15T11:00:00Z');
    `);

    // order_lookup_failures: 10-minute window + 24h safety margin -> ~24h10m cutoff.
    await pglite.exec(`
      INSERT INTO order_lookup_failures (ip, order_id, count, first_at, updated_at) VALUES
        ('1.1.1.1', 100, 5, '2026-05-13T00:00:00Z', '2026-05-13T00:00:00Z'),
        ('2.2.2.2', 200, 1, '2026-05-15T11:00:00Z', '2026-05-15T11:00:00Z');
    `);

    // resend_link_attempts: 60-minute window + 24h safety margin -> 25h cutoff.
    await pglite.exec(`
      INSERT INTO resend_link_attempts (ip, order_id, count, first_at, updated_at) VALUES
        ('1.1.1.1', 100, 3, '2026-05-13T00:00:00Z', '2026-05-13T00:00:00Z'),
        ('2.2.2.2', 200, 1, '2026-05-15T11:00:00Z', '2026-05-15T11:00:00Z');
    `);

    const removed = await cleanupSpamTracking(now);
    expect(removed).toEqual({
      contactRateLimits: 1,
      contactFingerprints: 1,
      newsletterRateLimits: 1,
      orderLookupFailures: 1,
      resendLinkAttempts: 1,
    });

    const rateRows = await db.select().from(contactRateLimitsTable);
    expect(rateRows.map((r) => r.ip)).toEqual(["2.2.2.2"]);

    const fpRows = await db.select().from(contactSubmissionFingerprintsTable);
    expect(fpRows.map((r) => r.hash)).toEqual(["hash_recent"]);

    const newsRows = await db.select().from(newsletterRateLimitsTable);
    expect(newsRows.map((r) => r.ip)).toEqual(["2.2.2.2"]);
  });

  it("returns zeros when nothing is old enough", async () => {
    const now = new Date("2026-05-15T12:00:00Z");
    await db.insert(contactRateLimitsTable).values({ ip: "9.9.9.9", hits: 1 });
    await db
      .insert(newsletterRateLimitsTable)
      .values({ ip: "9.9.9.9", hits: 1 });
    await db
      .insert(contactSubmissionFingerprintsTable)
      .values({ hash: "fresh", ip: "9.9.9.9", count: 1 });
    await db
      .insert(orderLookupFailuresTable)
      .values({ ip: "9.9.9.9", orderId: 42, count: 1 });
    await db
      .insert(resendLinkAttemptsTable)
      .values({ ip: "9.9.9.9", orderId: 42, count: 1 });

    const removed = await cleanupSpamTracking(now);
    expect(removed).toEqual({
      contactRateLimits: 0,
      contactFingerprints: 0,
      newsletterRateLimits: 0,
      orderLookupFailures: 0,
      resendLinkAttempts: 0,
    });
  });
});
