import { eq } from "drizzle-orm";
import { db, systemMetricsTable } from "@workspace/db";

export const STRIPE_WEBHOOK_LAST_AT = "stripe.webhook.last_received_at";
export const WEBHOOK_STALENESS_MS = 24 * 60 * 60 * 1000;

export async function setMetric(key: string, value: string): Promise<void> {
  await db
    .insert(systemMetricsTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemMetricsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function getMetric(
  key: string,
): Promise<{ value: string | null; updatedAt: Date } | null> {
  const [row] = await db
    .select()
    .from(systemMetricsTable)
    .where(eq(systemMetricsTable.key, key));
  if (!row) return null;
  return { value: row.value, updatedAt: row.updatedAt };
}

export async function recordStripeWebhookReceived(): Promise<void> {
  await setMetric(STRIPE_WEBHOOK_LAST_AT, new Date().toISOString());
}

export async function getStripeWebhookHealth(): Promise<{
  lastReceivedAt: Date | null;
  healthy: boolean;
}> {
  const m = await getMetric(STRIPE_WEBHOOK_LAST_AT);
  if (!m?.value) return { lastReceivedAt: null, healthy: true };
  const lastReceivedAt = new Date(m.value);
  const healthy = Date.now() - lastReceivedAt.getTime() < WEBHOOK_STALENESS_MS;
  return { lastReceivedAt, healthy };
}
