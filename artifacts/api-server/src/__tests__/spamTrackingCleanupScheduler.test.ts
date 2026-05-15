import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDb, pglite } from "./testDb";
import {
  contactRateLimitsTable,
  contactSubmissionFingerprintsTable,
  newsletterRateLimitsTable,
} from "@workspace/db";
import {
  startSpamTrackingCleanupScheduler,
  stopSpamTrackingCleanupScheduler,
} from "../lib/spamTrackingCleanup";

describe("spam tracking cleanup scheduler is wired into API boot", () => {
  const previousPort = process.env.PORT;

  afterEach(() => {
    vi.doUnmock("../app");
    vi.doUnmock("../lib/spamTrackingCleanup");
    vi.doUnmock("../lib/abandonedCart");
    vi.doUnmock("../lib/digest");
    vi.doUnmock("../lib/stripeEventCleanup");
    vi.doUnmock("../lib/contactQuarantineCleanup");
    vi.doUnmock("../lib/quarantineDigest");
    vi.resetModules();
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
  });

  it("calls startSpamTrackingCleanupScheduler after app.listen succeeds", async () => {
    const startSpam = vi.fn();
    const listen = vi.fn(
      (
        _port: number,
        cb: (err?: Error) => void,
      ): { close: () => void } => {
        // index.ts only starts the schedulers from inside the listen callback,
        // so this is what proves the wiring at runtime.
        cb();
        return { close: () => {} };
      },
    );

    vi.resetModules();
    vi.doMock("../app", () => ({ default: { listen } }));
    vi.doMock("../lib/spamTrackingCleanup", () => ({
      startSpamTrackingCleanupScheduler: startSpam,
      stopSpamTrackingCleanupScheduler: vi.fn(),
      cleanupSpamTracking: vi.fn(),
    }));
    vi.doMock("../lib/abandonedCart", () => ({
      startAbandonedCartScheduler: vi.fn(),
    }));
    vi.doMock("../lib/digest", () => ({
      startLowStockDigestScheduler: vi.fn(),
    }));
    vi.doMock("../lib/stripeEventCleanup", () => ({
      startStripeEventCleanupScheduler: vi.fn(),
    }));
    vi.doMock("../lib/contactQuarantineCleanup", () => ({
      startContactQuarantineCleanupScheduler: vi.fn(),
    }));
    vi.doMock("../lib/quarantineDigest", () => ({
      startQuarantineDigestScheduler: vi.fn(),
    }));

    process.env.PORT = "5099";
    await import("../index");

    expect(listen).toHaveBeenCalledTimes(1);
    expect(startSpam).toHaveBeenCalledTimes(1);
    // The scheduler must run only after listen succeeds, never before.
    expect(listen.mock.invocationCallOrder[0]).toBeLessThan(
      startSpam.mock.invocationCallOrder[0],
    );
  });
});

describe("spam tracking cleanup scheduler prunes stale rows on its tick", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousInterval = process.env.SPAM_TRACKING_CLEANUP_INTERVAL_MS;
  const previousDisabled = process.env.DISABLE_SPAM_TRACKING_CLEANUP;

  beforeEach(async () => {
    stopSpamTrackingCleanupScheduler();
    await resetDb();
    process.env.NODE_ENV = "development";
    delete process.env.DISABLE_SPAM_TRACKING_CLEANUP;
    process.env.SPAM_TRACKING_CLEANUP_INTERVAL_MS = "25";
  });

  afterEach(() => {
    stopSpamTrackingCleanupScheduler();
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousInterval === undefined) {
      delete process.env.SPAM_TRACKING_CLEANUP_INTERVAL_MS;
    } else {
      process.env.SPAM_TRACKING_CLEANUP_INTERVAL_MS = previousInterval;
    }
    if (previousDisabled === undefined) {
      delete process.env.DISABLE_SPAM_TRACKING_CLEANUP;
    } else {
      process.env.DISABLE_SPAM_TRACKING_CLEANUP = previousDisabled;
    }
  });

  it("removes rows older than the longest window + safety margin", async () => {
    await pglite.exec(`
      INSERT INTO contact_rate_limits (ip, hits, window_start, updated_at) VALUES
        ('10.0.0.1', 3, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days'),
        ('10.0.0.2', 1, NOW(),                       NOW());
      INSERT INTO contact_submission_fingerprints (hash, ip, count, first_seen, updated_at) VALUES
        ('fp_old',    '10.0.0.1', 5, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days'),
        ('fp_recent', '10.0.0.2', 1, NOW(),                       NOW());
      INSERT INTO newsletter_rate_limits (ip, hits, window_start, updated_at) VALUES
        ('10.0.0.1', 4, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days'),
        ('10.0.0.2', 1, NOW(),                       NOW());
    `);

    startSpamTrackingCleanupScheduler();

    await expect
      .poll(
        async () => {
          const [rate, fps, news] = await Promise.all([
            db.select().from(contactRateLimitsTable),
            db.select().from(contactSubmissionFingerprintsTable),
            db.select().from(newsletterRateLimitsTable),
          ]);
          return {
            rate: rate.map((r) => r.ip).sort(),
            fps: fps.map((r) => r.hash).sort(),
            news: news.map((r) => r.ip).sort(),
          };
        },
        { timeout: 5_000, interval: 50 },
      )
      .toEqual({
        rate: ["10.0.0.2"],
        fps: ["fp_recent"],
        news: ["10.0.0.2"],
      });
  });

  it("respects DISABLE_SPAM_TRACKING_CLEANUP=1", async () => {
    process.env.DISABLE_SPAM_TRACKING_CLEANUP = "1";

    await pglite.exec(`
      INSERT INTO contact_rate_limits (ip, hits, window_start, updated_at) VALUES
        ('10.0.0.9', 1, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days');
    `);

    startSpamTrackingCleanupScheduler();
    await new Promise((resolve) => setTimeout(resolve, 150));

    const rows = await db.select().from(contactRateLimitsTable);
    expect(rows.map((r) => r.ip)).toEqual(["10.0.0.9"]);
  });
});
