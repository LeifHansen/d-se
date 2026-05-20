import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";
import { isStripeConfigured } from "../lib/stripe";
import { getStripeWebhookHealth } from "../lib/metrics";

const router: IRouter = Router();

async function checkDb(): Promise<{ ok: boolean; detail?: string | null }> {
  try {
    await db.execute(sql`select 1`);
    return { ok: true, detail: null };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

async function checkStripe(): Promise<{ ok: boolean; detail?: string | null }> {
  try {
    const ok = await isStripeConfigured();
    return { ok, detail: ok ? null : "not configured" };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

function checkResend(): { ok: boolean; detail?: string | null } {
  // Configured when either a direct API key is set (local / fly.io / non-Replit
  // hosts) OR the Replit connector hostname is available. Detailed verification
  // happens lazily on first send.
  const hasDirectKey = !!process.env.RESEND_API_KEY;
  const hasConnector = !!process.env.REPLIT_CONNECTORS_HOSTNAME;
  const ok = hasDirectKey || hasConnector;
  return {
    ok,
    detail: ok ? null : "set RESEND_API_KEY or run on Replit with the Resend connector",
  };
}

router.get("/healthz", async (req, res) => {
  const [dbCheck, stripeCheck, webhook] = await Promise.all([
    checkDb(),
    checkStripe(),
    getStripeWebhookHealth(),
  ]);
  const resendCheck = checkResend();
  const allOk = dbCheck.ok && stripeCheck.ok && resendCheck.ok;
  const data = HealthCheckResponse.parse({
    status: allOk ? "ok" : "degraded",
    requestId: (req as unknown as { id?: string }).id ?? null,
    checks: {
      db: dbCheck,
      stripe: stripeCheck,
      resend: resendCheck,
      webhook: {
        ok: webhook.healthy,
        detail: webhook.lastReceivedAt
          ? `last ${webhook.lastReceivedAt.toISOString()}`
          : "no events recorded yet",
      },
    },
  });
  res.status(allOk ? 200 : 503).json(data);
});

export default router;
