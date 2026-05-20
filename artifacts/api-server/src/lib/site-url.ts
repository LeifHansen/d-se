function resolveSiteUrl(): string {
  const explicit = process.env["SITE_URL"] ?? process.env["PUBLIC_APP_URL"];
  if (explicit) return explicit.replace(/\/$/, "");
  return "https://dose.example.com";
}

export const SITE_URL = resolveSiteUrl();
