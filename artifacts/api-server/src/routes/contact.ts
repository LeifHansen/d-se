import { Router, type IRouter } from "express";
import { z } from "zod";
import { Resend } from "resend";

const router: IRouter = Router();

const ContactBody = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
});

// Simple in-memory rate limit: 5 requests / 10 minutes / IP.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const ipHits = new Map<string, number[]>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) {
    ipHits.set(ip, hits);
    return false;
  }
  hits.push(now);
  ipHits.set(ip, hits);
  return true;
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
  if (!rateLimit(ip)) {
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return;
  }

  const parsed = ContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please fill out every field correctly." });
    return;
  }
  const { name, email, subject, message } = parsed.data;

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
