import { lt } from "drizzle-orm";
import {
  db,
  contactQuarantineTable,
  newsletterQuarantineTable,
} from "@workspace/db";
import { logger } from "./logger";

const POLL_INTERVAL_MS = Number(
  process.env.CONTACT_QUARANTINE_CLEANUP_INTERVAL_MS ?? 60 * 60 * 1000,
);

export async function cleanupContactQuarantine(
  now: Date = new Date(),
): Promise<number> {
  const deleted = await db
    .delete(contactQuarantineTable)
    .where(lt(contactQuarantineTable.expiresAt, now))
    .returning({ id: contactQuarantineTable.id });
  return deleted.length;
}

export async function cleanupNewsletterQuarantine(
  now: Date = new Date(),
): Promise<number> {
  const deleted = await db
    .delete(newsletterQuarantineTable)
    .where(lt(newsletterQuarantineTable.expiresAt, now))
    .returning({ id: newsletterQuarantineTable.id });
  return deleted.length;
}

let timer: NodeJS.Timeout | null = null;

export function startContactQuarantineCleanupScheduler(): void {
  if (timer) return;
  if (process.env.NODE_ENV === "test") return;
  if (process.env.DISABLE_CONTACT_QUARANTINE_CLEANUP === "1") return;
  const tick = async () => {
    try {
      const [contact, newsletter] = await Promise.all([
        cleanupContactQuarantine(),
        cleanupNewsletterQuarantine(),
      ]);
      const removed = contact + newsletter;
      if (removed > 0) {
        logger.info(
          { contact, newsletter },
          "Pruned expired spam quarantine rows",
        );
      }
    } catch (err) {
      logger.warn({ err }, "Contact quarantine cleanup tick failed");
    }
  };
  timer = setInterval(tick, POLL_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
  setTimeout(() => void tick(), 60_000).unref?.();
  logger.info(
    { intervalMs: POLL_INTERVAL_MS },
    "Contact quarantine cleanup scheduler started",
  );
}
