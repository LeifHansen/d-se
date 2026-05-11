import { lte } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { sendLowStockDigest } from "./email";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
let timer: NodeJS.Timeout | null = null;
let lastSent = 0;

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function runLowStockDigestOnce(): Promise<void> {
  const recipients = adminEmails();
  if (recipients.length === 0) return;
  const rows = await db
    .select()
    .from(productsTable)
    .where(lte(productsTable.inventory, sql`${productsTable.lowStockThreshold}`));
  if (rows.length === 0) return;
  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    inventory: r.inventory,
    threshold: r.lowStockThreshold,
  }));
  for (const to of recipients) {
    try {
      await sendLowStockDigest({ to, items });
    } catch (err) {
      logger.warn({ err, to }, "Low-stock digest send failed");
    }
  }
  lastSent = Date.now();
}

export function startLowStockDigestScheduler(): void {
  if (timer) return;
  if (process.env.NODE_ENV === "test") return;
  // Tick every hour; only actually email once per 24h.
  const tick = async () => {
    if (Date.now() - lastSent < ONE_DAY_MS) return;
    try {
      await runLowStockDigestOnce();
    } catch (err) {
      logger.warn({ err }, "Low-stock digest tick failed");
    }
  };
  timer = setInterval(tick, 60 * 60 * 1000);
  // Don't keep the event loop alive solely for the digest.
  if (typeof timer.unref === "function") timer.unref();
  // Fire once shortly after boot.
  setTimeout(() => void tick(), 30_000).unref?.();
}
