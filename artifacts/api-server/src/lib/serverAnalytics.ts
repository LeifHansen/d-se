import { createHash } from "crypto";

type PurchaseItem = {
  productId: number;
  productName: string;
  quantity: number;
  priceCents: number;
};

type PurchasePayload = {
  orderId: number;
  email: string | null;
  totalCents: number;
  currency: string;
  items: PurchaseItem[];
  eventId: string;
  clientId: string | null;
  fbp: string | null;
  fbc: string | null;
  clientIp: string | null;
  userAgent: string | null;
};

function sha256Lower(value: string): string {
  return createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex");
}

async function postJson(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    return { ok: false, status: 0, text: String(err) };
  }
}

export async function sendGa4Purchase(p: PurchasePayload): Promise<boolean> {
  const measurementId = process.env.VITE_GA4_ID || process.env.GA4_ID;
  const apiSecret = process.env.GA4_API_SECRET;
  if (!measurementId || !apiSecret || !p.clientId) return false;
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
    measurementId,
  )}&api_secret=${encodeURIComponent(apiSecret)}`;
  const body = {
    client_id: p.clientId,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: String(p.orderId),
          value: p.totalCents / 100,
          currency: p.currency.toUpperCase(),
          items: p.items.map((it) => ({
            item_id: String(it.productId),
            item_name: it.productName,
            quantity: it.quantity,
            price: it.priceCents / 100,
          })),
        },
      },
    ],
  };
  const res = await postJson(url, body);
  return res.ok;
}

export async function sendMetaPurchase(p: PurchasePayload): Promise<boolean> {
  const pixelId = process.env.VITE_META_PIXEL_ID || process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_TOKEN;
  if (!pixelId || !accessToken) return false;
  const userData: Record<string, unknown> = {};
  if (p.email) userData.em = [sha256Lower(p.email)];
  if (p.fbp) userData.fbp = p.fbp;
  if (p.fbc) userData.fbc = p.fbc;
  if (p.clientIp) userData.client_ip_address = p.clientIp;
  if (p.userAgent) userData.client_user_agent = p.userAgent;
  const body = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: p.eventId,
        action_source: "website",
        user_data: userData,
        custom_data: {
          currency: p.currency.toUpperCase(),
          value: p.totalCents / 100,
          contents: p.items.map((it) => ({
            id: String(it.productId),
            quantity: it.quantity,
            item_price: it.priceCents / 100,
          })),
          content_type: "product",
          order_id: String(p.orderId),
        },
      },
    ],
  };
  const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(
    pixelId,
  )}/events?access_token=${encodeURIComponent(accessToken)}`;
  const res = await postJson(url, body);
  return res.ok;
}

export async function trackPurchaseServerSide(
  p: PurchasePayload,
): Promise<void> {
  await Promise.allSettled([sendGa4Purchase(p), sendMetaPurchase(p)]);
}
