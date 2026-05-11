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
  // The connector cred fetch is async + cached; surface as "configured" when the
  // env hint is present. Detailed verification happens lazily on first send.
  const hasConnector = !!process.env.REPLIT_CONNECTORS_HOSTNAME;
  return {
    ok: hasConnector,
    detail: hasConnector ? null : "Replit connector hostname not set",
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
