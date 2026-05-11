function resolveSiteUrl(): string {
  const explicit = process.env["SITE_URL"];
  if (explicit) return explicit.replace(/\/$/, "");
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (devDomain) return `https://${devDomain}`;
  return "https://dose.example.com";
}

export const SITE_URL = resolveSiteUrl();
