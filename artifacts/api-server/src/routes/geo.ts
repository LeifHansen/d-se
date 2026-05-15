import { Router, type IRouter, type Request } from "express";
import { LocateShippingResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const LOOKUP_TIMEOUT_MS = 1500;

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

async function lookupIp(
  ip: string,
): Promise<{ zip: string | null; country: string | null }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { zip: null, country: null };
    const data = (await res.json()) as {
      postal?: string | null;
      country_code?: string | null;
      country?: string | null;
      error?: boolean;
    };
    if (data.error) return { zip: null, country: null };
    const zip = typeof data.postal === "string" && data.postal ? data.postal : null;
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
  try {
    const result = await lookupIp(ip);
    res.json(LocateShippingResponse.parse(result));
  } catch (err) {
    req.log.warn({ err }, "shipping locate failed");
    res.json(LocateShippingResponse.parse({ zip: null, country: null }));
  }
});

export default router;
