import crypto from "crypto";

const TOKEN_TTL_MS = Number(
  process.env.QUARANTINE_DIGEST_TOKEN_TTL_MS ?? 7 * 24 * 60 * 60 * 1000,
);

export type DigestAction = "forward" | "discard";

function getSecret(): string | null {
  const secret =
    process.env.QUARANTINE_DIGEST_SECRET ??
    process.env.SESSION_SECRET ??
    null;
  return secret && secret.length > 0 ? secret : null;
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

type Payload = { id: number; act: DigestAction; exp: number };

function macFor(payloadB64: string, secret: string): string {
  return b64urlEncode(
    crypto.createHmac("sha256", secret).update(payloadB64).digest(),
  );
}

export function isDigestActionSigningConfigured(): boolean {
  return getSecret() !== null;
}

export function signDigestActionToken(opts: {
  id: number;
  action: DigestAction;
  now?: number;
}): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const exp = (opts.now ?? Date.now()) + TOKEN_TTL_MS;
  const payload: Payload = { id: opts.id, act: opts.action, exp };
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const mac = macFor(payloadB64, secret);
  return `${payloadB64}.${mac}`;
}

export function verifyDigestActionToken(
  token: string,
): { id: number; action: DigestAction } | null {
  const secret = getSecret();
  if (!secret) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = macFor(payloadB64, secret);
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
    typeof payload.id !== "number" ||
    (payload.act !== "forward" && payload.act !== "discard") ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  if (Date.now() > payload.exp) return null;
  return { id: payload.id, action: payload.act };
}
