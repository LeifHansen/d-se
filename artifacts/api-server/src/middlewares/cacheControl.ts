import type { Response } from "express";
import type { RequestHandler } from "express";

export type CacheOptions = {
  sMaxAge: number;
  staleWhileRevalidate: number;
  maxAge?: number;
};

function appendVary(res: Response, field: string): void {
  const existing = res.getHeader("Vary");
  if (existing == null || existing === "") {
    res.setHeader("Vary", field);
    return;
  }
  if (existing === "*") return;
  const parts = String(existing)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.some((p) => p.toLowerCase() === field.toLowerCase())) return;
  parts.push(field);
  res.setHeader("Vary", parts.join(", "));
}

export function publicCache(opts: CacheOptions): RequestHandler {
  const maxAge = opts.maxAge ?? 0;
  const cacheValue = `public, max-age=${maxAge}, s-maxage=${opts.sMaxAge}, stale-while-revalidate=${opts.staleWhileRevalidate}`;
  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    const setHeaders = () => {
      if (res.headersSent) return;
      // Only cache successful, cacheable responses. Error responses (4xx/5xx)
      // and redirects we haven't opted into should not poison the CDN.
      if (res.statusCode >= 200 && res.statusCode < 300) {
        res.setHeader("Cache-Control", cacheValue);
        appendVary(res, "Accept");
        appendVary(res, "Accept-Encoding");
      } else {
        res.setHeader("Cache-Control", "no-store");
      }
    };
    const originalWriteHead = res.writeHead.bind(res);
    res.writeHead = ((...args: Parameters<typeof res.writeHead>) => {
      setHeaders();
      return originalWriteHead(...args);
    }) as typeof res.writeHead;
    next();
  };
}

export function noStore(): RequestHandler {
  return (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  };
}
