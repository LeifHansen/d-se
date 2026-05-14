import { Router, type IRouter } from "express";
import { z } from "zod";
import { Resend } from "resend";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { Logger } from "pino";

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
