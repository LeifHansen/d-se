import { lt } from "drizzle-orm";
import {
  db,
  contactRateLimitsTable,
  contactSubmissionFingerprintsTable,
  newsletterRateLimitsTable,
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

const SAFETY_MARGIN_HOURS = Number(
  process.env.SPAM_TRACKING_SAFETY_MARGIN_HOURS ?? 24,
);
const POLL_INTERVAL_MS = Number(
  process.env.SPAM_TRACKING_CLEANUP_INTERVAL_MS ?? 60 * 60 * 1000,
);

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

function cutoff(now: Date, windowMinutes: number): Date {
  const totalMs =
    windowMinutes * 60 * 1000 + SAFETY_MARGIN_HOURS * 60 * 60 * 1000;
  return new Date(now.getTime() - totalMs);
}

export type SpamTrackingCleanupResult = {
  contactRateLimits: number;
  contactFingerprints: number;
  newsletterRateLimits: number;
};

export async function cleanupSpamTracking(
  now: Date = new Date(),
): Promise<SpamTrackingCleanupResult> {
  const contactRateCutoff = cutoff(now, contactRateLimitWindowMinutes());
  const contactFingerprintCutoff = cutoff(
    now,
    contactFingerprintWindowMinutes(),
  );
  const newsletterRateCutoff = cutoff(now, newsletterRateLimitWindowMinutes());

  const [contactRate, contactFp, newsletterRate] = await Promise.all([
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
  ]);

  return {
    contactRateLimits: contactRate.length,
    contactFingerprints: contactFp.length,
    newsletterRateLimits: newsletterRate.length,
  };
}

let timer: NodeJS.Timeout | null = null;

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
        removed.newsletterRateLimits;
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
  timer = setInterval(tick, POLL_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
  // Run once shortly after boot so a freshly-deployed instance prunes any
  // backlog without waiting a full interval.
  setTimeout(() => void tick(), 60_000).unref?.();
  logger.info(
    {
      intervalMs: POLL_INTERVAL_MS,
      safetyMarginHours: SAFETY_MARGIN_HOURS,
    },
    "Spam tracking cleanup scheduler started",
  );
}
