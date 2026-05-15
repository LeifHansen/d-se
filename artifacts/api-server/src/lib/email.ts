import { Resend } from "resend";

// Replit Resend connector — fetches API key + verified from-email from the
// connector hostname. See snippets/resend.
type ResendCreds = { apiKey: string; fromEmail: string };

let cachedCreds: ResendCreds | null = null;
let cachedAt = 0;
const CRED_TTL_MS = 60_000;

async function fetchCreds(): Promise<ResendCreds | null> {
  const now = Date.now();
  if (cachedCreds && now - cachedAt < CRED_TTL_MS) return cachedCreds;
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
    cachedCreds = {
      apiKey: settings.api_key,
      fromEmail:
        settings.from_email ??
        process.env.RESEND_FROM_EMAIL ??
        "noreply@example.com",
    };
    cachedAt = now;
    return cachedCreds;
  } catch {
    return null;
  }
}

export const STORE_NAME = process.env.STORE_NAME ?? "Store";

async function getResend(): Promise<{
  client: Resend;
  fromEmail: string;
} | null> {
  const creds = await fetchCreds();
  if (!creds) return null;
  return { client: new Resend(creds.apiKey), fromEmail: creds.fromEmail };
}

export async function sendOrderConfirmation(opts: {
  to: string;
  orderId: number;
  totalCents: number;
  items: Array<{ name: string; quantity: number; priceCents: number }>;
  subtotalCents?: number;
  shippingCents?: number;
  taxCents?: number;
  discountCents?: number;
  discountCode?: string | null;
  orderUrl?: string | null;
}): Promise<void> {
  const r = await getResend();
  if (!r) return;
  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  const lines = opts.items
    .map(
      (i) =>
        `<tr><td>${i.name}</td><td>${i.quantity}</td><td>${fmt(
          i.priceCents,
        )}</td></tr>`,
    )
    .join("");
  const summaryRows: string[] = [];
  if (opts.subtotalCents != null) {
    summaryRows.push(
      `<tr><td>Subtotal</td><td style="text-align:right">${fmt(
        opts.subtotalCents,
      )}</td></tr>`,
    );
  }
  if (opts.discountCents != null && opts.discountCents > 0) {
    const label = opts.discountCode
      ? `Discount (${opts.discountCode})`
      : "Discount";
    summaryRows.push(
      `<tr><td>${label}</td><td style="text-align:right">-${fmt(
        opts.discountCents,
      )}</td></tr>`,
    );
  }
  if (opts.shippingCents != null) {
    summaryRows.push(
      `<tr><td>Shipping</td><td style="text-align:right">${fmt(
        opts.shippingCents,
      )}</td></tr>`,
    );
  }
  if (opts.taxCents != null && opts.taxCents > 0) {
    summaryRows.push(
      `<tr><td>Tax</td><td style="text-align:right">${fmt(
        opts.taxCents,
      )}</td></tr>`,
    );
  }
  const summary = summaryRows.length
    ? `<table style="margin-top:16px">${summaryRows.join("")}</table>`
    : "";
  const orderLink = opts.orderUrl
    ? `<p style="margin-top:24px"><a href="${opts.orderUrl}">View your order details →</a></p>`
    : "";
  await r.client.emails.send({
    from: `${STORE_NAME} <${r.fromEmail}>`,
    to: opts.to,
    subject: `Order #${opts.orderId} confirmed`,
    html: `<h1>Thanks for your order!</h1>
<p>Your order #${opts.orderId} has been received.</p>
<table>${lines}</table>
${summary}
<p><strong>Total: ${fmt(opts.totalCents)}</strong></p>
${orderLink}`,
  });
}

export async function sendOrderLinkEmail(opts: {
  to: string;
  orderId: number;
  orderUrl: string;
}): Promise<void> {
  const r = await getResend();
  if (!r) return;
  await r.client.emails.send({
    from: `${STORE_NAME} <${r.fromEmail}>`,
    to: opts.to,
    subject: `Your fresh link for order #${opts.orderId}`,
    html: `<h1>Here's a fresh link to your order</h1>
<p>You requested a new link for order #${opts.orderId}. Use the button below to view your order details.</p>
<p style="margin-top:24px"><a href="${opts.orderUrl}">View your order →</a></p>
<p style="margin-top:24px;font-size:12px;color:#666">If you didn't request this email, you can safely ignore it.</p>`,
  });
}

export async function sendAbandonedCartEmail(opts: {
  to: string;
  cartId: string;
  resumeUrl: string;
  items: Array<{ name: string; quantity: number; priceCents: number }>;
  subtotalCents: number;
  reminderNumber: 1 | 2;
}): Promise<void> {
  const r = await getResend();
  if (!r) return;
  const lines = opts.items
    .map(
      (i) =>
        `<tr><td>${i.name}</td><td>${i.quantity}</td><td>$${(
          i.priceCents / 100
        ).toFixed(2)}</td></tr>`,
    )
    .join("");
  const subject =
    opts.reminderNumber === 1
      ? `You left something behind at ${STORE_NAME}`
      : `Last chance — your ${STORE_NAME} cart is waiting`;
  const headline =
    opts.reminderNumber === 1
      ? "Still thinking it over?"
      : "Your cart is about to expire";
  await r.client.emails.send({
    from: `${STORE_NAME} <${r.fromEmail}>`,
    to: opts.to,
    subject,
    html: `<h1>${headline}</h1>
<p>We saved your cart so you can pick up right where you left off.</p>
<table>${lines}</table>
<p><strong>Subtotal: $${(opts.subtotalCents / 100).toFixed(2)}</strong></p>
<p><a href="${opts.resumeUrl}">Resume your order →</a></p>`,
  });
}

export async function sendLowStockDigest(opts: {
  to: string;
  items: Array<{ id: number; name: string; inventory: number; threshold: number }>;
}): Promise<void> {
  const r = await getResend();
  if (!r) return;
  const rows = opts.items
    .map(
      (i) =>
        `<tr><td>#${i.id}</td><td>${i.name}</td><td>${i.inventory}</td><td>${i.threshold}</td></tr>`,
    )
    .join("");
  await r.client.emails.send({
    from: `${STORE_NAME} <${r.fromEmail}>`,
    to: opts.to,
    subject: `[${STORE_NAME}] Daily low-stock digest (${opts.items.length})`,
    html: `<h1>Low stock report</h1>
<p>${opts.items.length} product(s) are at or below their low-stock threshold.</p>
<table border="1" cellpadding="6" cellspacing="0">
<thead><tr><th>ID</th><th>Name</th><th>Inventory</th><th>Threshold</th></tr></thead>
<tbody>${rows}</tbody>
</table>`,
  });
}

export async function sendQuarantineDigest(opts: {
  to: string;
  items: Array<{
    id: number;
    name: string;
    email: string;
    subject: string;
    reasons: string[];
    createdAt: Date;
  }>;
  reviewUrl?: string | null;
}): Promise<void> {
  const r = await getResend();
  if (!r) return;
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const rows = opts.items
    .map(
      (i) =>
        `<tr><td>#${i.id}</td><td>${escapeHtml(i.name)}</td><td>${escapeHtml(
          i.email,
        )}</td><td>${escapeHtml(i.subject)}</td><td>${i.reasons
          .map(escapeHtml)
          .join(", ")}</td><td>${i.createdAt.toISOString()}</td></tr>`,
    )
    .join("");
  const reviewLink = opts.reviewUrl
    ? `<p><a href="${opts.reviewUrl}">Review the quarantine inbox →</a></p>`
    : "";
  await r.client.emails.send({
    from: `${STORE_NAME} <${r.fromEmail}>`,
    to: opts.to,
    subject: `[${STORE_NAME}] Spam quarantine digest (${opts.items.length} new)`,
    html: `<h1>New quarantined messages</h1>
<p>${opts.items.length} contact message(s) were quarantined in the last 24 hours and are waiting for review.</p>
<table border="1" cellpadding="6" cellspacing="0">
<thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Subject</th><th>Reasons</th><th>Received</th></tr></thead>
<tbody>${rows}</tbody>
</table>
${reviewLink}`,
  });
}

export async function sendWeeklySpamDigest(opts: {
  to: string;
  summary: {
    contactTotal: number;
    newsletterTotal: number;
    unreviewed: number;
    markedLegit: number;
    topReasons: Array<{ reason: string; count: number }>;
  };
  reviewUrl?: string | null;
  periodStart: Date;
  periodEnd: Date;
}): Promise<void> {
  const r = await getResend();
  if (!r) return;
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const total = opts.summary.contactTotal + opts.summary.newsletterTotal;
  const reasonRows = opts.summary.topReasons.length
    ? opts.summary.topReasons
        .map(
          (r) =>
            `<tr><td>${esc(r.reason)}</td><td style="text-align:right">${r.count}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="2"><em>No reasons recorded.</em></td></tr>`;
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
  const reviewLink = opts.reviewUrl
    ? `<p style="margin-top:24px"><a href="${opts.reviewUrl}">Review the spam quarantine →</a></p>`
    : "";
  await r.client.emails.send({
    from: `${STORE_NAME} <${r.fromEmail}>`,
    to: opts.to,
    subject: `[${STORE_NAME}] Weekly spam digest (${total} filtered)`,
    html: `<h1>Weekly spam digest</h1>
<p>${fmtDate(opts.periodStart)} – ${fmtDate(opts.periodEnd)}</p>
<table border="1" cellpadding="6" cellspacing="0">
<tbody>
<tr><td>Contact submissions filtered</td><td style="text-align:right">${opts.summary.contactTotal}</td></tr>
<tr><td>Newsletter signups filtered</td><td style="text-align:right">${opts.summary.newsletterTotal}</td></tr>
<tr><td>Not yet reviewed</td><td style="text-align:right">${opts.summary.unreviewed}</td></tr>
<tr><td>Marked as legitimate</td><td style="text-align:right">${opts.summary.markedLegit}</td></tr>
</tbody>
</table>
<h2 style="margin-top:24px">Top reasons (last 7 days)</h2>
<table border="1" cellpadding="6" cellspacing="0">
<thead><tr><th>Reason</th><th>Count</th></tr></thead>
<tbody>${reasonRows}</tbody>
</table>
${reviewLink}`,
  });
}

export async function sendWelcomeEmail(opts: {
  to: string;
  unsubscribeUrl?: string | null;
}): Promise<void> {
  const r = await getResend();
  if (!r) return;
  const unsubFooter = opts.unsubscribeUrl
    ? `<hr style="margin-top:32px;border:none;border-top:1px solid #eee" />
<p style="font-size:12px;color:#666">
You received this email because you signed up for ${STORE_NAME} updates.
<a href="${opts.unsubscribeUrl}">Unsubscribe</a>.
</p>`
    : "";
  const headers: Record<string, string> = {};
  if (opts.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${opts.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  await r.client.emails.send({
    from: `${STORE_NAME} <${r.fromEmail}>`,
    to: opts.to,
    subject: `Welcome to ${STORE_NAME}`,
    headers,
    html: `<h1>Welcome to ${STORE_NAME}.</h1>
<p>Thanks for subscribing — you're on the list for new drops, ritual recipes, and the occasional poem about going slow.</p>
<p>Use code <strong>WELCOME10</strong> for $10 off your first order.</p>
${unsubFooter}`,
  });
}

export async function addToResendAudience(opts: {
  email: string;
}): Promise<{ ok: boolean; contactId: string | null; alreadyExists: boolean }> {
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!audienceId) return { ok: false, contactId: null, alreadyExists: false };
  const r = await getResend();
  if (!r) return { ok: false, contactId: null, alreadyExists: false };
  try {
    const result = await r.client.contacts.create({
      audienceId,
      email: opts.email,
      unsubscribed: false,
    });
    const data = (result as { data?: { id?: string } }).data;
    const errMsg = (result as { error?: { message?: string } }).error?.message;
    if (errMsg && /exist/i.test(errMsg)) {
      return { ok: true, contactId: null, alreadyExists: true };
    }
    return {
      ok: true,
      contactId: data?.id ?? null,
      alreadyExists: false,
    };
  } catch {
    return { ok: false, contactId: null, alreadyExists: false };
  }
}

export async function removeFromResendAudience(opts: {
  contactId?: string | null;
  email?: string | null;
}): Promise<{ ok: boolean }> {
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!audienceId) return { ok: false };
  if (!opts.contactId && !opts.email) return { ok: false };
  const r = await getResend();
  if (!r) return { ok: false };
  try {
    const result = await r.client.contacts.remove({
      audienceId,
      ...(opts.contactId
        ? { id: opts.contactId }
        : { email: opts.email as string }),
    });
    const errMsg = (result as { error?: { message?: string } }).error?.message;
    if (errMsg && !/not.*found|exist/i.test(errMsg)) {
      return { ok: false };
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export function buildTrackingUrl(
  carrier: string | null | undefined,
  trackingCode: string,
): string | null {
  if (!trackingCode) return null;
  const code = encodeURIComponent(trackingCode);
  const key = (carrier ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!key) return null;
  if (key.includes("usps")) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${code}`;
  }
  if (key.includes("ups")) {
    return `https://www.ups.com/track?tracknum=${code}`;
  }
  if (key.includes("fedex")) {
    return `https://www.fedex.com/fedextrack/?trknbr=${code}`;
  }
  if (key.includes("dhl")) {
    return `https://www.dhl.com/en/express/tracking.html?AWB=${code}`;
  }
  if (key.includes("canadapost") || key === "canpar") {
    return `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${code}`;
  }
  if (key.includes("royalmail")) {
    return `https://www.royalmail.com/track-your-item#/tracking-results/${code}`;
  }
  return null;
}

export async function sendShipmentEmail(opts: {
  to: string;
  orderId: number;
  trackingCode: string;
  carrier: string;
  trackingUrl?: string | null;
}): Promise<void> {
  const r = await getResend();
  if (!r) return;
  const url =
    opts.trackingUrl ?? buildTrackingUrl(opts.carrier, opts.trackingCode);
  const trackingLine = url
    ? `<p>Tracking: <a href="${url}"><strong>${opts.trackingCode}</strong></a> via ${opts.carrier}</p>
<p><a href="${url}">Track your package →</a></p>`
    : `<p>Tracking: <strong>${opts.trackingCode}</strong> via ${opts.carrier}</p>`;
  await r.client.emails.send({
    from: `${STORE_NAME} <${r.fromEmail}>`,
    to: opts.to,
    subject: `Order #${opts.orderId} shipped`,
    html: `<h1>Your order is on its way!</h1>
${trackingLine}`,
  });
}

export async function sendDeliveryEmail(opts: {
  to: string;
  orderId: number;
  trackingCode?: string | null;
  carrier?: string | null;
  trackingUrl?: string | null;
  orderUrl?: string | null;
}): Promise<void> {
  const r = await getResend();
  if (!r) return;
  const url =
    opts.trackingUrl ??
    (opts.trackingCode
      ? buildTrackingUrl(opts.carrier, opts.trackingCode)
      : null);
  const trackingLine = opts.trackingCode
    ? url
      ? `<p>Tracking: <a href="${url}"><strong>${opts.trackingCode}</strong></a>${
          opts.carrier ? ` via ${opts.carrier}` : ""
        }</p>`
      : `<p>Tracking: <strong>${opts.trackingCode}</strong>${
          opts.carrier ? ` via ${opts.carrier}` : ""
        }</p>`
    : "";
  const orderLink = opts.orderUrl
    ? `<p style="margin-top:24px"><a href="${opts.orderUrl}">View your order details →</a></p>`
    : "";
  await r.client.emails.send({
    from: `${STORE_NAME} <${r.fromEmail}>`,
    to: opts.to,
    subject: `Order #${opts.orderId} delivered`,
    html: `<h1>Your order has been delivered!</h1>
<p>Order #${opts.orderId} has arrived. We hope you enjoy it.</p>
${trackingLine}
${orderLink}`,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function forwardQuarantinedContactEmail(opts: {
  to: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  reasons: string[];
}): Promise<void> {
  const r = await getResend();
  if (!r) {
    throw new Error(
      "Email is not configured. Connect Resend to forward quarantined messages.",
    );
  }
  const reasonsList = opts.reasons.length
    ? `<ul>${opts.reasons
        .map((reason) => `<li>${escapeHtml(reason)}</li>`)
        .join("")}</ul>`
    : "<p><em>(no specific reasons recorded)</em></p>";
  const html = `
<h2>Forwarded from spam quarantine</h2>
<p>This message was originally filtered as suspicious. Reasons matched:</p>
${reasonsList}
<hr />
<p><strong>From:</strong> ${escapeHtml(opts.name)} &lt;${escapeHtml(opts.email)}&gt;</p>
<p><strong>Subject:</strong> ${escapeHtml(opts.subject)}</p>
<hr />
<p style="white-space:pre-wrap;">${escapeHtml(opts.message)}</p>`;
  await r.client.emails.send({
    from: `${STORE_NAME} Contact Form <${r.fromEmail}>`,
    to: opts.to,
    replyTo: opts.email,
    subject: `[Quarantine] ${opts.subject}`,
    html,
  });
}
