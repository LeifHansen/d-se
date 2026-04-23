import { Resend } from "resend";

let _resend: Resend | null = null;

export function getResend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@example.com";
export const STORE_NAME = process.env.STORE_NAME ?? "Store";

export async function sendOrderConfirmation(opts: {
  to: string;
  orderId: number;
  totalCents: number;
  items: Array<{ name: string; quantity: number; priceCents: number }>;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  const lines = opts.items
    .map(
      (i) =>
        `<tr><td>${i.name}</td><td>${i.quantity}</td><td>$${(
          i.priceCents / 100
        ).toFixed(2)}</td></tr>`,
    )
    .join("");
  await resend.emails.send({
    from: `${STORE_NAME} <${FROM_EMAIL}>`,
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
  const resend = getResend();
  if (!resend) return;
  await resend.emails.send({
    from: `${STORE_NAME} <${FROM_EMAIL}>`,
    to: opts.to,
    subject: `Order #${opts.orderId} shipped`,
    html: `<h1>Your order is on its way!</h1>
<p>Tracking: <strong>${opts.trackingCode}</strong> via ${opts.carrier}</p>`,
  });
}
