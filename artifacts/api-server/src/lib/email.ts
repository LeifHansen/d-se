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
  await r.client.emails.send({
    from: `${STORE_NAME} <${r.fromEmail}>`,
    to: opts.to,
    subject: `Order #${opts.orderId} confirmed`,
    html: `<h1>Thanks for your order!</h1>
<p>Your order #${opts.orderId} has been received.</p>
<table>${lines}</table>
${summary}
<p><strong>Total: ${fmt(opts.totalCents)}</strong></p>`,
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
