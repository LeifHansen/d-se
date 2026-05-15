import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, contactQuarantineTable } from "@workspace/db";
import { verifyDigestActionToken } from "../lib/quarantineDigestToken";
import { forwardQuarantinedContactEmail } from "../lib/email";

const router: IRouter = Router();

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPage(opts: {
  res: Response;
  status: number;
  title: string;
  heading: string;
  message: string;
}): void {
  const { res, status, title, heading, message } = opts;
  res
    .status(status)
    .type("html")
    .send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         max-width: 540px; margin: 64px auto; padding: 0 24px; color: #222; }
  h1 { font-size: 22px; margin-bottom: 12px; }
  p { line-height: 1.5; }
</style>
</head><body>
<h1>${escapeHtml(heading)}</h1>
<p>${escapeHtml(message)}</p>
</body></html>`);
}

function ownerEmail(): string | null {
  return (
    process.env.CONTACT_OWNER_EMAIL ?? process.env.RESEND_FROM_EMAIL ?? null
  );
}

router.get(
  "/quarantine-digest/forward",
  async (req, res): Promise<void> => {
    const token = typeof req.query.t === "string" ? req.query.t : "";
    const decoded = token ? verifyDigestActionToken(token) : null;
    if (!decoded || decoded.action !== "forward") {
      renderPage({
        res,
        status: 400,
        title: "Link expired",
        heading: "This link is no longer valid",
        message:
          "This forward link has expired or is not recognized. Open the admin quarantine inbox to act on the message.",
      });
      return;
    }
    const [row] = await db
      .select()
      .from(contactQuarantineTable)
      .where(eq(contactQuarantineTable.id, decoded.id));
    if (!row) {
      renderPage({
        res,
        status: 404,
        title: "Message not found",
        heading: "That message is gone",
        message:
          "The quarantined message no longer exists. It may have been discarded or expired.",
      });
      return;
    }
    if (row.forwardedAt) {
      renderPage({
        res,
        status: 200,
        title: "Already forwarded",
        heading: "Already forwarded",
        message: `This message was already forwarded on ${row.forwardedAt.toISOString()}.`,
      });
      return;
    }
    const to = ownerEmail();
    if (!to) {
      renderPage({
        res,
        status: 503,
        title: "Owner email not configured",
        heading: "Forwarding is not configured",
        message:
          "Set CONTACT_OWNER_EMAIL on the server to enable forwarding from the digest email.",
      });
      return;
    }
    try {
      await forwardQuarantinedContactEmail({
        to,
        name: row.name,
        email: row.email,
        subject: row.subject,
        message: row.message,
        reasons: row.reasons ?? [],
      });
    } catch (err) {
      req.log.error(
        { err },
        "Failed to forward quarantined contact message via digest link",
      );
      renderPage({
        res,
        status: 502,
        title: "Forward failed",
        heading: "We couldn't forward that message",
        message:
          "Email delivery failed. Try again from the admin quarantine page, or check the email integration.",
      });
      return;
    }
    await db
      .update(contactQuarantineTable)
      .set({ forwardedAt: new Date() })
      .where(eq(contactQuarantineTable.id, row.id));
    renderPage({
      res,
      status: 200,
      title: "Message forwarded",
      heading: "Forwarded to your inbox",
      message: `The quarantined message from ${row.email} has been sent to ${to}. You can close this tab.`,
    });
  },
);

router.get(
  "/quarantine-digest/discard",
  async (req, res): Promise<void> => {
    const token = typeof req.query.t === "string" ? req.query.t : "";
    const decoded = token ? verifyDigestActionToken(token) : null;
    if (!decoded || decoded.action !== "discard") {
      renderPage({
        res,
        status: 400,
        title: "Link expired",
        heading: "This link is no longer valid",
        message:
          "This discard link has expired or is not recognized. Open the admin quarantine inbox to act on the message.",
      });
      return;
    }
    const deleted = await db
      .delete(contactQuarantineTable)
      .where(eq(contactQuarantineTable.id, decoded.id))
      .returning({ id: contactQuarantineTable.id });
    if (deleted.length === 0) {
      renderPage({
        res,
        status: 200,
        title: "Already discarded",
        heading: "Already discarded",
        message: "That quarantined message was already removed.",
      });
      return;
    }
    renderPage({
      res,
      status: 200,
      title: "Message discarded",
      heading: "Message discarded",
      message: "The quarantined message has been deleted. You can close this tab.",
    });
  },
);

export default router;
