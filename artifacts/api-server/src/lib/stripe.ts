import Stripe from "stripe";

// Replit Stripe connector — fetches credentials from the connector hostname
// rather than requiring STRIPE_SECRET_KEY directly. See snippets/stripe-replit-sync.
type StripeCreds = { publishableKey: string; secretKey: string };

let cachedCreds: StripeCreds | null = null;
let cachedAt = 0;
const CRED_TTL_MS = 60_000;

async function fetchCreds(): Promise<StripeCreds> {
  const now = Date.now();
  if (cachedCreds && now - cachedAt < CRED_TTL_MS) return cachedCreds;
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;
  if (!hostname || !xReplitToken) {
    throw new Error("Replit Stripe connector not available");
  }
  const isProd = process.env.REPLIT_DEPLOYMENT === "1";
  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", "stripe");
  url.searchParams.set("environment", isProd ? "production" : "development");
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
  });
  const data = (await res.json()) as {
    items?: Array<{ settings?: { publishable?: string; secret?: string } }>;
  };
  const settings = data.items?.[0]?.settings;
  if (!settings?.publishable || !settings?.secret) {
    throw new Error("Stripe connection not found");
  }
  cachedCreds = {
    publishableKey: settings.publishable,
    secretKey: settings.secret,
  };
  cachedAt = now;
  return cachedCreds;
}

export async function getStripe(): Promise<Stripe> {
  const { secretKey } = await fetchCreds();
  return new Stripe(secretKey);
}

export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await fetchCreds();
  return publishableKey;
}

export async function isStripeConfigured(): Promise<boolean> {
  try {
    await fetchCreds();
    return true;
  } catch {
    return false;
  }
}
