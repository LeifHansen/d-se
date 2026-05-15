import { and, gte, isNull, desc } from "drizzle-orm";
import { db, contactQuarantineTable } from "@workspace/db";
import { logger } from "./logger";
import { sendQuarantineDigest } from "./email";
import { getMetric, setMetric } from "./metrics";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;
const IMMEDIATE_WINDOW_MS = 60 * 60 * 1000;
// Debounce for "immediate" cadence so a burst of submissions in the same few
// minutes results in a single digest rather than one email per row.
const IMMEDIATE_COOLDOWN_MS = 5 * 60 * 1000;
const SETTING_KEY = "quarantine_digest.frequency";
const DEFAULT_FREQUENCY: DigestFrequency = "daily";
const FREQUENCIES = ["off", "immediate", "daily", "weekly"] as const;

export type DigestFrequency = (typeof FREQUENCIES)[number];

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

export function isDigestFrequency(value: unknown): value is DigestFrequency {
  return (
    typeof value === "string" &&
    (FREQUENCIES as readonly string[]).includes(value)
  );
}

export async function getQuarantineDigestFrequency(): Promise<DigestFrequency> {
  try {
    const m = await getMetric(SETTING_KEY);
    if (m?.value && isDigestFrequency(m.value)) return m.value;
  } catch (err) {
    logger.warn({ err }, "Failed to read quarantine digest frequency setting");
  }
  return DEFAULT_FREQUENCY;
}

export async function setQuarantineDigestFrequency(
  frequency: DigestFrequency,
): Promise<void> {
  await setMetric(SETTING_KEY, frequency);
}

export async function runQuarantineDigestOnce(
  now: Date = new Date(),
  opts: { windowMs?: number } = {},
): Promise<number> {
  const recipients = adminEmails();
  if (recipients.length === 0) return 0;
  const windowMs = opts.windowMs ?? ONE_DAY_MS;
  const since = new Date(now.getTime() - windowMs);
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

/**
 * Fire a digest right away if the admin opted into "immediate" cadence.
 * Called from the contact route after a new quarantine row is persisted.
 * Uses a small look-back window so a burst of submissions in the same minute
 * still results in a single email rather than one per row.
 */
export async function triggerImmediateQuarantineDigestIfEnabled(
  now: Date = new Date(),
): Promise<number> {
  if (process.env.NODE_ENV === "test") return 0;
  if (process.env.DISABLE_CONTACT_QUARANTINE_DIGEST === "1") return 0;
  let freq: DigestFrequency;
  try {
    freq = await getQuarantineDigestFrequency();
  } catch {
    return 0;
  }
  if (freq !== "immediate") return 0;
  // Debounce rapid bursts: if we just sent a digest, skip this trigger so
  // operators don't get one email per spam submission.
  if (now.getTime() - lastSent < IMMEDIATE_COOLDOWN_MS) return 0;
  return runQuarantineDigestOnce(now, { windowMs: IMMEDIATE_WINDOW_MS });
}

export function startQuarantineDigestScheduler(): void {
  if (timer) return;
  if (process.env.NODE_ENV === "test") return;
  if (process.env.DISABLE_CONTACT_QUARANTINE_DIGEST === "1") return;
  const tick = async () => {
    let freq: DigestFrequency;
    try {
      freq = await getQuarantineDigestFrequency();
    } catch (err) {
      logger.warn({ err }, "Quarantine digest tick: failed to read frequency");
      return;
    }
    if (freq === "off" || freq === "immediate") return;
    const intervalMs = freq === "weekly" ? ONE_WEEK_MS : ONE_DAY_MS;
    if (Date.now() - lastSent < intervalMs) return;
    try {
      await runQuarantineDigestOnce(new Date(), { windowMs: intervalMs });
    } catch (err) {
      logger.warn({ err }, "Quarantine digest tick failed");
    }
  };
  timer = setInterval(tick, 60 * 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
  setTimeout(() => void tick(), 45_000).unref?.();
  logger.info("Quarantine digest scheduler started");
}
