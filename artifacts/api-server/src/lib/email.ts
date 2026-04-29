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
  await r.client.emails.send({
    from: `${STORE_NAME} <${r.fromEmail}>`,
    to: opts.to,
    subject: `Order #${opts.orderId} confirmed`,
    html: `<h1>Thanks for your order!</h1>
<p>Your order #${opts.orderId} has been received.</p>
<table>${lines}</table>
<p><strong>Total: $${(opts.totalCents / 100).toFixed(2)}</strong></p>`,
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
