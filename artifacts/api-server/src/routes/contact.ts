import { Router, type IRouter } from "express";
import { z } from "zod";
import { Resend } from "resend";
import { db, contactQuarantineTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { Logger } from "pino";
import { createHash } from "node:crypto";

const router: IRouter = Router();

const ContactBody = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
  captchaToken: z.string().min(1).max(4096),
});

// Persistent rate limit: 5 requests / 10 minutes / IP, stored in Postgres.
const WINDOW_MINUTES = 10;
const MAX_PER_WINDOW = 5;

async function rateLimit(ip: string): Promise<boolean> {
  // Atomic upsert: reset the counter when the existing window has expired,
  // otherwise increment. RETURNING gives us the post-update hit count.
  const result = await db.execute<{ hits: number }>(sql`
    INSERT INTO contact_rate_limits (ip, hits, window_start, updated_at)
    VALUES (${ip}, 1, NOW(), NOW())
    ON CONFLICT (ip) DO UPDATE SET
      hits = CASE
        WHEN contact_rate_limits.window_start < NOW() - (${WINDOW_MINUTES}::int * INTERVAL '1 minute')
          THEN 1
        ELSE contact_rate_limits.hits + 1
      END,
      window_start = CASE
        WHEN contact_rate_limits.window_start < NOW() - (${WINDOW_MINUTES}::int * INTERVAL '1 minute')
          THEN NOW()
        ELSE contact_rate_limits.window_start
      END,
      updated_at = NOW()
    RETURNING hits
  `);
  const hits = Number(result.rows[0]?.hits ?? 0);
  return hits <= MAX_PER_WINDOW;
}

// Cloudflare Turnstile test secret that always passes — used as a safe
// development fallback when TURNSTILE_SECRET_KEY is not configured.
const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

async function verifyCaptcha(
  token: string,
  ip: string,
  log: Logger,
): Promise<boolean> {
  const configured = process.env.TURNSTILE_SECRET_KEY;
  const isDev = process.env.NODE_ENV !== "production";
  if (!configured && !isDev) {
    log.error(
      "TURNSTILE_SECRET_KEY is not set in a non-development environment — rejecting contact submission to fail closed.",
    );
    return false;
  }
  const secret = configured ?? TURNSTILE_TEST_SECRET;
  if (!configured) {
    log.warn(
      "TURNSTILE_SECRET_KEY is not set — using Cloudflare test secret (development only). Set TURNSTILE_SECRET_KEY (and VITE_TURNSTILE_SITE_KEY on the storefront) for real spam protection.",
    );
  }
  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    body.set("remoteip", ip);
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!data.success) {
      log.warn({ codes: data["error-codes"] }, "Turnstile verification failed");
      return false;
    }
    return true;
  } catch (err) {
    log.error({ err }, "Turnstile verification request failed");
    return false;
  }
}

type ResendCreds = { apiKey: string; fromEmail: string };

async function fetchResendCreds(): Promise<ResendCreds | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;
  if (!hostname || !xReplitToken) return null;
  try {
    const url = `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
    });
    const data = (await res.json()) as {
      items?: Array<{ settings?: { api_key?: string; from_email?: string } }>;
    };
    const settings = data.items?.[0]?.settings;
    if (!settings?.api_key) return null;
    return {
      apiKey: settings.api_key,
      fromEmail:
        settings.from_email ??
        process.env.RESEND_FROM_EMAIL ??
        "noreply@example.com",
    };
  } catch {
    return null;
  }
}

// --- Spam heuristics ---------------------------------------------------------
//
// Even after Turnstile, determined spammers can solve challenges in bulk. These
// heuristics look at the actual content for signals (link count, suspicious
// TLDs, bursts of identical bodies, BBCode tags, non-Latin majority text) and
// silently "shadow accept" suspicious submissions: the API responds 200 OK so
// the spammer thinks they got through, but no email is delivered. Real
// customers are unaffected because the thresholds are well above what a normal
// person types into a contact form.
//
// All thresholds are tunable via env vars so this can be tightened or relaxed
// without a redeploy of the heuristics themselves.

type SpamSignal = { reasons: string[] };

const DEFAULT_BLOCKED_TLDS =
  ".ru,.cn,.top,.xyz,.click,.loan,.work,.tk,.ml,.ga,.cf,.zip,.mov,.country,.gdn,.review";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function detectContentSpam(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): SpamSignal {
  const reasons: string[] = [];
  const text = `${input.subject}\n${input.message}`;

  const maxLinks = envInt("CONTACT_SPAM_MAX_LINKS", 3);
  const explicitUrls = text.match(/\bhttps?:\/\/[^\s<>"')]+/gi) ?? [];
  const bareDomains =
    text.match(/\b[a-z0-9][a-z0-9-]{0,62}\.[a-z]{2,24}\b/gi) ?? [];
  const linkLike = Math.max(explicitUrls.length, bareDomains.length);
  if (linkLike > maxLinks) {
    reasons.push(`too_many_links:${linkLike}`);
  }

  const blockedTlds = (
    process.env.CONTACT_SPAM_BLOCKED_TLDS ?? DEFAULT_BLOCKED_TLDS
  )
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.startsWith("."));
  const candidates = [...explicitUrls, ...bareDomains, input.email].map((s) =>
    s.toLowerCase(),
  );
  for (const candidate of candidates) {
    for (const tld of blockedTlds) {
      // Match the TLD only at the end of a host (before path/query/space).
      const re = new RegExp(
        `${tld.replace(/\./g, "\\.")}(?=$|[\\s/?#:'"<>)])`,
        "i",
      );
      if (re.test(candidate)) {
        reasons.push(`blocked_tld:${tld}`);
        break;
      }
    }
  }

  if (/\[url[=\]]|\[\/url\]|\[link[=\]]/i.test(text)) {
    reasons.push("bbcode_links");
  }

  // Non-Latin majority detection is OFF by default — legitimate non-English
  // customers (Russian, Chinese, etc.) would otherwise be silently dropped.
  // Operators can opt in by setting CONTACT_SPAM_NON_LATIN_BLOCK=1 only if
  // their customer base is exclusively Latin-script speakers.
  if (process.env.CONTACT_SPAM_NON_LATIN_BLOCK === "1") {
    const letters = text.replace(/[^\p{L}]/gu, "");
    if (letters.length >= 30) {
      const cyrillic = (letters.match(/[\u0400-\u04FF]/g) ?? []).length;
      const cjk = (letters.match(/[\u3400-\u9FFF]/g) ?? []).length;
      const nonLatin = cyrillic + cjk;
      if (nonLatin / letters.length > 0.6) {
        reasons.push("non_latin_majority");
      }
    }
  }

  return { reasons };
}

function fingerprint(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): string {
  // Normalize to catch slightly mutated repeats (case, whitespace, punctuation).
  const norm = `${input.subject}\n${input.message}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim();
  return createHash("sha256").update(norm).digest("hex");
}

async function recordFingerprint(
  hash: string,
  ip: string,
): Promise<{ count: number; duplicate: boolean }> {
  const windowMin = envInt("CONTACT_SPAM_DUP_WINDOW_MINUTES", 60);
  // Default 5 identical retries from the same IP within the window before we
  // call it a burst. This is well above the "user retried after a transient
  // send failure" case (1-2 retries) so legitimate retries always go through.
  const threshold = envInt("CONTACT_SPAM_DUP_THRESHOLD", 5);
  const result = await db.execute<{ count: number }>(sql`
    INSERT INTO contact_submission_fingerprints (hash, ip, count, first_seen, updated_at)
    VALUES (${hash}, ${ip}, 1, NOW(), NOW())
    ON CONFLICT (hash, ip) DO UPDATE SET
      count = CASE
        WHEN contact_submission_fingerprints.first_seen < NOW() - (${windowMin}::int * INTERVAL '1 minute')
          THEN 1
        ELSE contact_submission_fingerprints.count + 1
      END,
      first_seen = CASE
        WHEN contact_submission_fingerprints.first_seen < NOW() - (${windowMin}::int * INTERVAL '1 minute')
          THEN NOW()
        ELSE contact_submission_fingerprints.first_seen
      END,
      updated_at = NOW()
    RETURNING count
  `);
  const count = Number(result.rows[0]?.count ?? 0);
  return { count, duplicate: count >= threshold };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

router.post("/contact", async (req, res): Promise<void> => {
  const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown").toString();

  let allowed: boolean;
  try {
    allowed = await rateLimit(ip);
  } catch (err) {
    req.log.error({ err }, "Contact rate-limit check failed");
    res.status(500).json({ error: "Something went wrong. Please try again." });
    return;
  }
  if (!allowed) {
    res.status(429).json({
      error:
        "Too many requests from this network. Please wait a few minutes and try again.",
    });
    return;
  }

  const parsed = ContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please fill out every field correctly." });
    return;
  }
  const { name, email, subject, message, captchaToken } = parsed.data;

  const captchaOk = await verifyCaptcha(captchaToken, ip, req.log);
  if (!captchaOk) {
    res.status(400).json({
      error: "We couldn't verify that you're human. Please try again.",
    });
    return;
  }

  // Content heuristics + duplicate-burst detection. Both are tunable via env
  // vars; suspicious submissions are shadow-accepted (200 OK, no email sent).
  const contentSignal = detectContentSpam({ name, email, subject, message });
  let dupReason: string | null = null;
  try {
    const fp = fingerprint({ name, email, subject, message });
    const { count, duplicate } = await recordFingerprint(fp, ip);
    if (duplicate) dupReason = `duplicate_burst:${count}`;
  } catch (err) {
    // Fingerprint tracking failures should never block real customers; just log.
    req.log.warn({ err }, "Contact spam fingerprint check failed (continuing)");
  }
  const allReasons = [
    ...contentSignal.reasons,
    ...(dupReason ? [dupReason] : []),
  ];
  if (allReasons.length > 0) {
    req.log.warn(
      { ip, email, subject, reasons: allReasons },
      "Contact submission shadow-accepted (spam heuristics matched)",
    );
    const retentionDays = envInt("CONTACT_QUARANTINE_RETENTION_DAYS", 14);
    const expiresAt = new Date(
      Date.now() + retentionDays * 24 * 60 * 60 * 1000,
    );
    try {
      await db.insert(contactQuarantineTable).values({
        name,
        email,
        subject,
        message,
        reasons: allReasons,
        ip,
        expiresAt,
      });
    } catch (err) {
      // Quarantine persistence failures should never alter the response shape;
      // the operator just loses one row of recoverability for this submission.
      req.log.warn({ err }, "Failed to persist contact quarantine row");
    }
    res.json({ ok: true });
    return;
  }

  const ownerEmail =
    process.env.CONTACT_OWNER_EMAIL ?? process.env.RESEND_FROM_EMAIL ?? null;
  const creds = await fetchResendCreds();

  if (!creds || !ownerEmail) {
    // Fail loudly: a "successful" response without delivery would silently
    // drop customer messages and miss the store owner's inbox.
    req.log.error(
      { name, email, subject, hasCreds: !!creds, hasOwnerEmail: !!ownerEmail },
      "Contact form rejected: email is not configured (set CONTACT_OWNER_EMAIL and connect Resend)",
    );
    res.status(503).json({
      error:
        "Our contact form is temporarily unavailable. Please email hello@dose.com directly.",
    });
    return;
  }

  try {
    const client = new Resend(creds.apiKey);
    const html = `
<h2>New message from the DŌSE contact form</h2>
<p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
<p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
<hr />
<p style="white-space:pre-wrap;">${escapeHtml(message)}</p>`;
    await client.emails.send({
      from: `DŌSE Contact Form <${creds.fromEmail}>`,
      to: ownerEmail,
      replyTo: email,
      subject: `[Contact] ${subject}`,
      html,
    });
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to send contact email");
    res.status(500).json({ error: "Failed to send your message. Please try again." });
  }
});

export default router;
