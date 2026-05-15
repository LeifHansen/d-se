import { lt } from "drizzle-orm";
import {
  db,
  contactRateLimitsTable,
  contactSubmissionFingerprintsTable,
  newsletterRateLimitsTable,
  orderLookupFailuresTable,
  resendLinkAttemptsTable,
} from "@workspace/db";
import { logger } from "./logger";

// The longest tunable windows for each tracker. These match the route defaults
// and the env overrides the routes consult, so the cleanup cutoff naturally
// stretches with whatever the operator has configured.
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function safetyMarginHours(): number {
  return Number(process.env.SPAM_TRACKING_SAFETY_MARGIN_HOURS ?? 24);
}
function pollIntervalMs(): number {
  return Number(process.env.SPAM_TRACKING_CLEANUP_INTERVAL_MS ?? 60 * 60 * 1000);
}

function contactRateLimitWindowMinutes(): number {
  // Contact form's rate-limit window is hardcoded at 10 minutes today; expose
  // the same env override the route uses if it ever becomes tunable.
  return envInt("CONTACT_SPAM_RATE_WINDOW_MINUTES", 10);
}

function contactFingerprintWindowMinutes(): number {
  return envInt("CONTACT_SPAM_DUP_WINDOW_MINUTES", 60);
}

function newsletterRateLimitWindowMinutes(): number {
  return envInt("NEWSLETTER_SPAM_RATE_WINDOW_MINUTES", 60);
}

function orderLookupWindowMinutes(): number {
  // Mirrors LOOKUP_WINDOW_MINUTES in routes/orders.ts. Kept hardcoded there
  // today; expose an env override here so operators can stretch the cleanup
  // cutoff if the route ever becomes tunable.
  return envInt("ORDER_LOOKUP_WINDOW_MINUTES", 10);
}

function resendLinkWindowMinutes(): number {
  // Mirrors RESEND_WINDOW_MINUTES in routes/orders.ts. Kept hardcoded there
  // today; expose an env override here so operators can stretch the cleanup
  // cutoff if the route ever becomes tunable.
  return envInt("RESEND_LINK_WINDOW_MINUTES", 60);
}

function cutoff(now: Date, windowMinutes: number): Date {
  const totalMs =
    windowMinutes * 60 * 1000 + safetyMarginHours() * 60 * 60 * 1000;
  return new Date(now.getTime() - totalMs);
}

export type SpamTrackingCleanupResult = {
  contactRateLimits: number;
  contactFingerprints: number;
  newsletterRateLimits: number;
  orderLookupFailures: number;
  resendLinkAttempts: number;
};

export type SpamTrackingCleanupStats = {
  lastRunAt: Date | null;
  lastResult: SpamTrackingCleanupResult | null;
};

let lastRunAt: Date | null = null;
let lastResult: SpamTrackingCleanupResult | null = null;

export function getSpamTrackingCleanupStats(): SpamTrackingCleanupStats {
  return { lastRunAt, lastResult };
}

export async function cleanupSpamTracking(
  now: Date = new Date(),
): Promise<SpamTrackingCleanupResult> {
  const contactRateCutoff = cutoff(now, contactRateLimitWindowMinutes());
  const contactFingerprintCutoff = cutoff(
    now,
    contactFingerprintWindowMinutes(),
  );
  const newsletterRateCutoff = cutoff(now, newsletterRateLimitWindowMinutes());
  const orderLookupCutoff = cutoff(now, orderLookupWindowMinutes());
  const resendLinkCutoff = cutoff(now, resendLinkWindowMinutes());

  const [contactRate, contactFp, newsletterRate, orderLookup, resendLink] =
    await Promise.all([
      db
        .delete(contactRateLimitsTable)
        .where(lt(contactRateLimitsTable.windowStart, contactRateCutoff))
        .returning({ ip: contactRateLimitsTable.ip }),
      db
        .delete(contactSubmissionFingerprintsTable)
        .where(
          lt(
            contactSubmissionFingerprintsTable.firstSeen,
            contactFingerprintCutoff,
          ),
        )
        .returning({ hash: contactSubmissionFingerprintsTable.hash }),
      db
        .delete(newsletterRateLimitsTable)
        .where(lt(newsletterRateLimitsTable.windowStart, newsletterRateCutoff))
        .returning({ ip: newsletterRateLimitsTable.ip }),
      db
        .delete(orderLookupFailuresTable)
        .where(lt(orderLookupFailuresTable.firstAt, orderLookupCutoff))
        .returning({ ip: orderLookupFailuresTable.ip }),
      db
        .delete(resendLinkAttemptsTable)
        .where(lt(resendLinkAttemptsTable.firstAt, resendLinkCutoff))
        .returning({ ip: resendLinkAttemptsTable.ip }),
    ]);

  const result: SpamTrackingCleanupResult = {
    contactRateLimits: contactRate.length,
    contactFingerprints: contactFp.length,
    newsletterRateLimits: newsletterRate.length,
    orderLookupFailures: orderLookup.length,
    resendLinkAttempts: resendLink.length,
  };
  lastRunAt = now;
  lastResult = result;
  return result;
}

let timer: NodeJS.Timeout | null = null;
let bootTimer: NodeJS.Timeout | null = null;

export function stopSpamTrackingCleanupScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (bootTimer) {
    clearTimeout(bootTimer);
    bootTimer = null;
  }
}

export function startSpamTrackingCleanupScheduler(): void {
  if (timer) return;
  if (process.env.NODE_ENV === "test") return;
  if (process.env.DISABLE_SPAM_TRACKING_CLEANUP === "1") return;
  const tick = async () => {
    try {
      const removed = await cleanupSpamTracking();
      const total =
        removed.contactRateLimits +
        removed.contactFingerprints +
        removed.newsletterRateLimits +
        removed.orderLookupFailures +
        removed.resendLinkAttempts;
      if (total > 0) {
        logger.info(
          { ...removed, total },
          "Pruned stale spam-protection tracking rows",
        );
      }
    } catch (err) {
      logger.warn({ err }, "Spam tracking cleanup tick failed");
    }
  };
  const intervalMs = pollIntervalMs();
  timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  // Run once shortly after boot so a freshly-deployed instance prunes any
  // backlog without waiting a full interval.
  bootTimer = setTimeout(() => void tick(), 60_000);
  bootTimer.unref?.();
  logger.info(
    {
      intervalMs,
      safetyMarginHours: safetyMarginHours(),
    },
    "Spam tracking cleanup scheduler started",
  );
}
