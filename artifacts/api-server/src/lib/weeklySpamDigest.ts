import { and, gte, isNotNull, isNull } from "drizzle-orm";
import {
  db,
  contactQuarantineTable,
  newsletterQuarantineTable,
} from "@workspace/db";
import { logger } from "./logger";
import { sendWeeklySpamDigest } from "./email";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
const POLL_INTERVAL_MS = 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;
let lastSent = 0;

function ownerEmail(): string | null {
  const raw =
    process.env.CONTACT_OWNER_EMAIL ?? process.env.RESEND_FROM_EMAIL ?? null;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function reviewUrl(): string | null {
  const base = process.env.STOREFRONT_BASE_URL ?? process.env.PUBLIC_BASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/admin/contact-quarantine`;
}

function reasonKey(raw: string): string {
  const colon = raw.indexOf(":");
  return colon < 0 ? raw : raw.slice(0, colon);
}

export type WeeklySpamDigestSummary = {
  contactTotal: number;
  newsletterTotal: number;
  unreviewed: number;
  markedLegit: number;
  topReasons: Array<{ reason: string; count: number }>;
};

export async function runWeeklySpamDigestOnce(
  now: Date = new Date(),
): Promise<WeeklySpamDigestSummary | null> {
  const to = ownerEmail();
  if (!to) return null;
  const since = new Date(now.getTime() - SEVEN_DAYS_MS);

  const [contactRows, newsletterRows, contactUnreviewed, newsletterUnreviewed,
    contactLegit, newsletterLegit] = await Promise.all([
    db
      .select({
        reasons: contactQuarantineTable.reasons,
      })
      .from(contactQuarantineTable)
      .where(gte(contactQuarantineTable.createdAt, since)),
    db
      .select({
        reasons: newsletterQuarantineTable.reasons,
      })
      .from(newsletterQuarantineTable)
      .where(gte(newsletterQuarantineTable.createdAt, since)),
    db
      .select({ id: contactQuarantineTable.id })
      .from(contactQuarantineTable)
      .where(
        and(
          gte(contactQuarantineTable.createdAt, since),
          isNull(contactQuarantineTable.forwardedAt),
          isNull(contactQuarantineTable.markedLegitAt),
        ),
      ),
    db
      .select({ id: newsletterQuarantineTable.id })
      .from(newsletterQuarantineTable)
      .where(
        and(
          gte(newsletterQuarantineTable.createdAt, since),
          isNull(newsletterQuarantineTable.markedLegitAt),
        ),
      ),
    db
      .select({ id: contactQuarantineTable.id })
      .from(contactQuarantineTable)
      .where(
        and(
          gte(contactQuarantineTable.createdAt, since),
          isNotNull(contactQuarantineTable.markedLegitAt),
        ),
      ),
    db
      .select({ id: newsletterQuarantineTable.id })
      .from(newsletterQuarantineTable)
      .where(
        and(
          gte(newsletterQuarantineTable.createdAt, since),
          isNotNull(newsletterQuarantineTable.markedLegitAt),
        ),
      ),
  ]);

  const contactTotal = contactRows.length;
  const newsletterTotal = newsletterRows.length;

  if (contactTotal === 0 && newsletterTotal === 0) {
    return null;
  }

  const counts = new Map<string, number>();
  const tally = (reasons: unknown) => {
    const list = Array.isArray(reasons) ? (reasons as string[]) : [];
    const seen = new Set<string>();
    for (const raw of list) {
      const key = reasonKey(raw);
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  };
  for (const r of contactRows) tally(r.reasons);
  for (const r of newsletterRows) tally(r.reasons);

  const topReasons = Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 10);

  const summary: WeeklySpamDigestSummary = {
    contactTotal,
    newsletterTotal,
    unreviewed: contactUnreviewed.length + newsletterUnreviewed.length,
    markedLegit: contactLegit.length + newsletterLegit.length,
    topReasons,
  };

  try {
    await sendWeeklySpamDigest({
      to,
      summary,
      reviewUrl: reviewUrl(),
      periodStart: since,
      periodEnd: now,
    });
  } catch (err) {
    logger.warn({ err, to }, "Weekly spam digest send failed");
    return summary;
  }

  lastSent = now.getTime();
  return summary;
}

export function startWeeklySpamDigestScheduler(): void {
  if (timer) return;
  if (process.env.NODE_ENV === "test") return;
  if (process.env.DISABLE_WEEKLY_SPAM_DIGEST === "1") return;
  const tick = async () => {
    if (lastSent !== 0 && Date.now() - lastSent < SEVEN_DAYS_MS) return;
    try {
      await runWeeklySpamDigestOnce();
    } catch (err) {
      logger.warn({ err }, "Weekly spam digest tick failed");
    }
  };
  timer = setInterval(tick, POLL_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
  setTimeout(() => void tick(), 90_000).unref?.();
  logger.info("Weekly spam digest scheduler started");
}
