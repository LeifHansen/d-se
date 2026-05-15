import { Router, type IRouter, type Request } from "express";
import { LocateShippingResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const LOOKUP_TIMEOUT_MS = 1500;
const DEFAULT_PROVIDER_URL = "https://ipapi.co/{ip}/json/";
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 5_000;

type LookupResult = { zip: string | null; country: string | null };

const cache = new Map<string, { value: LookupResult; expiresAt: number }>();

export function _resetGeoCacheForTests(): void {
  cache.clear();
}

function getCacheTtlMs(): number {
  const raw = process.env.IP_GEO_CACHE_TTL_MS;
  if (!raw) return DEFAULT_CACHE_TTL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CACHE_TTL_MS;
}

function getCached(ip: string): LookupResult | null {
  const hit = cache.get(ip);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(ip);
    return null;
  }
  return hit.value;
}

function setCached(ip: string, value: LookupResult): void {
  const ttl = getCacheTtlMs();
  if (ttl <= 0) return;
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(ip, { value, expiresAt: Date.now() + ttl });
}

function buildProviderUrl(ip: string): string {
  const template = process.env.IP_GEO_PROVIDER_URL || DEFAULT_PROVIDER_URL;
  const apiKey = process.env.IP_GEO_API_KEY ?? "";
  const encoded = encodeURIComponent(ip);
  let url = template.includes("{ip}")
    ? template.replace("{ip}", encoded)
    : `${template}${template.endsWith("/") ? "" : "/"}${encoded}`;
  if (template.includes("{key}")) {
    url = url.replace("{key}", encodeURIComponent(apiKey));
  } else if (apiKey) {
    url += url.includes("?") ? `&key=${encodeURIComponent(apiKey)}` : `?key=${encodeURIComponent(apiKey)}`;
  }
  return url;
}

function isPrivateOrLocal(ip: string): boolean {
  if (!ip) return true;
  const v = ip.replace(/^::ffff:/, "");
  if (v === "127.0.0.1" || v === "::1" || v === "localhost") return true;
  if (/^10\./.test(v)) return true;
  if (/^192\.168\./.test(v)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true;
  if (/^169\.254\./.test(v)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(v)) return true;
  if (/^fe80:/i.test(v)) return true;
  return false;
}

function getClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  const fwd = Array.isArray(xff) ? xff[0] : xff;
  const first = fwd?.toString().split(",")[0].trim();
  return (first || req.ip || req.socket.remoteAddress || "").toString();
}

async function lookupIp(ip: string): Promise<LookupResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(buildProviderUrl(ip), {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { zip: null, country: null };
    const data = (await res.json()) as {
      postal?: string | null;
      zip?: string | null;
      country_code?: string | null;
      country?: string | null;
      error?: boolean;
    };
    if (data.error) return { zip: null, country: null };
    const postalRaw = data.postal ?? data.zip ?? null;
    const zip = typeof postalRaw === "string" && postalRaw ? postalRaw : null;
    const countryRaw = data.country_code ?? data.country ?? null;
    const country =
      typeof countryRaw === "string" && countryRaw
        ? countryRaw.toUpperCase().slice(0, 2)
        : null;
    return { zip, country };
  } catch {
    return { zip: null, country: null };
  } finally {
    clearTimeout(t);
  }
}

router.get("/shipping/locate", async (req, res): Promise<void> => {
  const ip = getClientIp(req);
  if (!ip || isPrivateOrLocal(ip)) {
    res.json(LocateShippingResponse.parse({ zip: null, country: null }));
    return;
  }
  const cached = getCached(ip);
  if (cached) {
    res.json(LocateShippingResponse.parse(cached));
    return;
  }
  try {
    const result = await lookupIp(ip);
    if (result.zip || result.country) setCached(ip, result);
    res.json(LocateShippingResponse.parse(result));
  } catch (err) {
    req.log.warn({ err }, "shipping locate failed");
    res.json(LocateShippingResponse.parse({ zip: null, country: null }));
  }
});

export default router;
