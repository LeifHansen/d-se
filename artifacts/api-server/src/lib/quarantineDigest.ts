import { and, gte, isNull, desc } from "drizzle-orm";
import { db, contactQuarantineTable } from "@workspace/db";
import { logger } from "./logger";
import { sendQuarantineDigest } from "./email";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
let timer: NodeJS.Timeout | null = null;
let lastSent = 0;

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function reviewUrl(): string | null {
  const base = process.env.STOREFRONT_BASE_URL ?? process.env.PUBLIC_BASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/admin/contact-quarantine`;
}

export async function runQuarantineDigestOnce(
  now: Date = new Date(),
): Promise<number> {
  const recipients = adminEmails();
  if (recipients.length === 0) return 0;
  const since = new Date(now.getTime() - ONE_DAY_MS);
  const rows = await db
    .select()
    .from(contactQuarantineTable)
    .where(
      and(
        gte(contactQuarantineTable.createdAt, since),
        isNull(contactQuarantineTable.forwardedAt),
      ),
    )
    .orderBy(desc(contactQuarantineTable.createdAt));
  if (rows.length === 0) return 0;
  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    subject: r.subject,
    reasons: r.reasons,
    createdAt: r.createdAt,
  }));
  const link = reviewUrl();
  for (const to of recipients) {
    try {
      await sendQuarantineDigest({ to, items, reviewUrl: link });
    } catch (err) {
      logger.warn({ err, to }, "Quarantine digest send failed");
    }
  }
  lastSent = now.getTime();
  return rows.length;
}

export function startQuarantineDigestScheduler(): void {
  if (timer) return;
  if (process.env.NODE_ENV === "test") return;
  if (process.env.DISABLE_CONTACT_QUARANTINE_DIGEST === "1") return;
  const tick = async () => {
    if (Date.now() - lastSent < ONE_DAY_MS) return;
    try {
      await runQuarantineDigestOnce();
    } catch (err) {
      logger.warn({ err }, "Quarantine digest tick failed");
    }
  };
  timer = setInterval(tick, 60 * 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
  setTimeout(() => void tick(), 45_000).unref?.();
  logger.info("Quarantine digest scheduler started");
}
