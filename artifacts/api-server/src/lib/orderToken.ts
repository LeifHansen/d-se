import crypto from "crypto";

const TOKEN_TTL_MS = Number(
  process.env.ORDER_TOKEN_TTL_MS ?? 30 * 24 * 60 * 60 * 1000,
);

function getSecret(): string {
  const secret =
    process.env.ORDER_TOKEN_SECRET ?? process.env.SESSION_SECRET ?? null;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ORDER_TOKEN_SECRET (or SESSION_SECRET) must be set to sign order links",
      );
    }
    return "dev-order-token-secret-do-not-use-in-production";
  }
  return secret;
}

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

type Payload = { oid: number; em: string; exp: number };

function macFor(payloadB64: string): string {
  return b64urlEncode(
    crypto.createHmac("sha256", getSecret()).update(payloadB64).digest(),
  );
}

export function signOrderToken(opts: {
  orderId: number;
  email: string;
  now?: number;
}): string {
  const exp = (opts.now ?? Date.now()) + TOKEN_TTL_MS;
  const payload: Payload = {
    oid: opts.orderId,
    em: opts.email.trim().toLowerCase(),
    exp,
  };
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const mac = macFor(payloadB64);
  return `${payloadB64}.${mac}`;
}

export function verifyOrderToken(
  token: string,
): { orderId: number; email: string } | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = macFor(payloadB64);
  const a = Buffer.from(expected);
  const b = Buffer.from(mac);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  let payload: Payload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8")) as Payload;
  } catch {
    return null;
  }
  if (
    typeof payload.oid !== "number" ||
    typeof payload.em !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  if (Date.now() > payload.exp) return null;
  return { orderId: payload.oid, email: payload.em };
}
