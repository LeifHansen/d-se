import { lt } from "drizzle-orm";
import { db, stripeProcessedEventsTable } from "@workspace/db";
import { logger } from "./logger";

const RETENTION_DAYS = Number(
  process.env.STRIPE_EVENT_RETENTION_DAYS ?? 30,
);
const POLL_INTERVAL_MS = Number(
  process.env.STRIPE_EVENT_CLEANUP_INTERVAL_MS ?? 24 * 60 * 60 * 1000,
);

export async function cleanupStripeProcessedEvents(
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(stripeProcessedEventsTable)
    .where(lt(stripeProcessedEventsTable.processedAt, cutoff))
    .returning({ eventId: stripeProcessedEventsTable.eventId });
  return deleted.length;
}

let timer: NodeJS.Timeout | null = null;

export function startStripeEventCleanupScheduler(): void {
  if (timer) return;
  if (process.env.NODE_ENV === "test") return;
  if (process.env.DISABLE_STRIPE_EVENT_CLEANUP === "1") return;
  const tick = async () => {
    try {
      const removed = await cleanupStripeProcessedEvents();
      if (removed > 0) {
        logger.info(
          { removed, retentionDays: RETENTION_DAYS },
          "Pruned old stripe_processed_events rows",
        );
      }
    } catch (err) {
      logger.warn({ err }, "Stripe event cleanup tick failed");
    }
  };
  timer = setInterval(tick, POLL_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
  // Run once shortly after boot so a freshly-deployed instance prunes any
  // backlog without waiting a full day.
  setTimeout(() => void tick(), 60_000).unref?.();
  logger.info(
    { intervalMs: POLL_INTERVAL_MS, retentionDays: RETENTION_DAYS },
    "Stripe event cleanup scheduler started",
  );
}
