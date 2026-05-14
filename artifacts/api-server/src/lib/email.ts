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

export async function sendShipmentEmail(opts: {
  to: string;
  orderId: number;
  trackingCode: string;
  carrier: string;
}): Promise<void> {
  const r = await getResend();
  if (!r) return;
  await r.client.emails.send({
    from: `${STORE_NAME} <${r.fromEmail}>`,
    to: opts.to,
    subject: `Order #${opts.orderId} shipped`,
    html: `<h1>Your order is on its way!</h1>
<p>Tracking: <strong>${opts.trackingCode}</strong> via ${opts.carrier}</p>`,
  });
}
