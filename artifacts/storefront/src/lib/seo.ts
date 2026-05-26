const RAW_SITE_URL =
  (import.meta.env.VITE_SITE_URL as string | undefined) ??
  (import.meta.env.VITE_REPLIT_DEV_DOMAIN
    ? `https://${import.meta.env.VITE_REPLIT_DEV_DOMAIN as string}`
    : undefined) ??
  "https://xn--dse-qxa.com";

export const SITE_URL = RAW_SITE_URL.replace(/\/$/, "");

export const SITE_NAME = "DŌSE";
export const SITE_TAGLINE = "THC Beverage Additive";
export const SITE_DESCRIPTION =
  "DŌSE is a precisely formulated THC beverage additive. Add a drop to any drink for a calm, controlled lift.";
export const DEFAULT_OG_IMAGE = "/opengraph.jpg";
export const TWITTER_HANDLE = "@dosewellness";

export function absoluteUrl(path: string): string {
  if (!path) return SITE_URL;
  if (/^https?:\/\//.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalized}`;
}

export function canonicalFor(pathname: string): string {
  const cleaned = pathname.split("?")[0]?.split("#")[0] ?? "/";
  return absoluteUrl(cleaned);
}
