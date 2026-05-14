import { useGetAdminStats } from "@workspace/api-client-react";
import type { MarketingDailyPoint } from "@workspace/api-client-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";
import { AdminLayout } from "./AdminLayout";
import { formatCurrency, formatDateTime } from "./utils";

function Sparkline({
  data,
  testId,
  format,
  color = "currentColor",
}: {
  data: MarketingDailyPoint[];
  testId: string;
  format: (value: number) => string;
  color?: string;
}) {
  const hasAnyValue = data.some((d) => d.value > 0);
  return (
    <div className="mt-2 h-10 w-full" data-testid={testId}>
      {hasAnyValue ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
          >
            <defs>
              <linearGradient id={`${testId}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={[0, "dataMax"]} />
            <Tooltip
              cursor={{ stroke: color, strokeOpacity: 0.3 }}
              contentStyle={{
                fontSize: "0.75rem",
                padding: "0.25rem 0.5rem",
                borderRadius: "0.375rem",
              }}
              labelFormatter={(label: string) =>
                new Date(label).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }
              formatter={(value: number) => [format(value), ""]}
              separator=""
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${testId}-fill)`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-full items-center text-xs text-muted-foreground">
          No activity in the last 7 days
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  testId: string;
}) {
  return (
    <div
      className="rounded-lg border border-border bg-card p-5"
      data-testid={testId}
    >
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export default function AdminDashboard() {
  const { data, isLoading, error } = useGetAdminStats();

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              A quick pulse on today and the last 30 days.
            </p>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
            data-testid="text-stats-error"
          >
            Couldn't load admin stats. {(error as Error).message}
          </div>
        ) : data ? (
          <>
            {data.webhookHealthy ? null : (
              <div
                className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
                data-testid="banner-stale-webhook"
              >
                <p className="font-medium">Stripe webhook looks stale.</p>
                <p className="mt-1 text-muted-foreground">
                  Last received{" "}
                  {data.webhookLastReceivedAt
                    ? formatDateTime(data.webhookLastReceivedAt)
                    : "never"}
                  . Verify the Stripe webhook endpoint is reachable.
                </p>
              </div>
            )}

            <div
              className="rounded-lg border border-border bg-gradient-to-br from-foreground/95 to-foreground p-6 text-background"
              data-testid="banner-today"
            >
              <p className="text-xs uppercase tracking-[0.2em] opacity-70">
                Today
              </p>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-10 gap-y-2">
                <div>
                  <p className="text-3xl font-semibold">
                    {data.ordersToday}
                  </p>
                  <p className="text-xs opacity-70">
                    {data.ordersToday === 1 ? "order" : "orders"}
                  </p>
                </div>
                <div>
                  <p className="text-3xl font-semibold">
                    {formatCurrency(data.revenueCentsToday)}
                  </p>
                  <p className="text-xs opacity-70">revenue</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard
                label="Orders this month"
                value={String(data.ordersThisMonth)}
                hint={formatCurrency(data.revenueCentsThisMonth)}
                testId="stat-month"
              />
              <StatCard
                label="Pending fulfillment"
                value={String(data.pendingFulfillment)}
                testId="stat-pending"
              />
              <StatCard
                label="Low stock products"
                value={String(data.lowStock)}
                hint={`of ${data.totalProducts} products`}
                testId="stat-low-stock"
              />
              <StatCard
                label="Total orders"
                value={String(data.totalOrders)}
                testId="stat-total-orders"
              />
            </div>

            <section
              className="rounded-lg border border-border bg-card"
              aria-labelledby="marketing-heading"
              data-testid="panel-marketing"
            >
              <header className="flex items-center justify-between border-b border-border px-5 py-3">
                <div>
                  <h2 id="marketing-heading" className="text-sm font-semibold">
                    Marketing
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Newsletter growth and the last 7 days of paid orders.
                  </p>
                </div>
                {data.marketing.ga4Url ? (
                  <a
                    href={data.marketing.ga4Url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium underline-offset-4 hover:underline"
                    data-testid="marketing-ga4-link"
                  >
                    Open Google Analytics →
                  </a>
                ) : null}
              </header>
              <div className="grid gap-6 px-5 py-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Newsletter subscribers
                  </p>
                  <p
                    className="mt-1 text-2xl font-semibold tabular-nums"
                    data-testid="marketing-subscribers"
                  >
                    {data.marketing.newsletterSubscribers.toLocaleString(
                      "en-US",
                    )}
                  </p>
                  <Sparkline
                    data={data.marketing.subscribersDaily}
                    testId="sparkline-subscribers"
                    format={(v) => `${v.toLocaleString("en-US")} new`}
                  />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Orders (last 7 days)
                  </p>
                  <p
                    className="mt-1 text-2xl font-semibold tabular-nums"
                    data-testid="marketing-orders-7d"
                  >
                    {data.marketing.ordersLast7Days.toLocaleString("en-US")}
                  </p>
                  <Sparkline
                    data={data.marketing.ordersDaily}
                    testId="sparkline-orders-7d"
                    format={(v) =>
                      `${v.toLocaleString("en-US")} ${v === 1 ? "order" : "orders"}`
                    }
                  />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Revenue (last 7 days)
                  </p>
                  <p
                    className="mt-1 text-2xl font-semibold tabular-nums"
                    data-testid="marketing-revenue-7d"
                  >
                    {formatCurrency(data.marketing.revenueCentsLast7Days)}
                  </p>
                  <Sparkline
                    data={data.marketing.revenueCentsDaily}
                    testId="sparkline-revenue-7d"
                    format={(v) => formatCurrency(v)}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card">
              <header className="flex items-center justify-between border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold">Recent orders</h2>
              </header>
              {data.recentOrders && data.recentOrders.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-5 py-2">Order</th>
                      <th className="px-5 py-2">Email</th>
                      <th className="px-5 py-2">Status</th>
                      <th className="px-5 py-2 text-right">Total</th>
                      <th className="px-5 py-2 text-right">Placed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentOrders.map((o) => (
                      <tr
                        key={o.id}
                        className="border-t border-border/60"
                        data-testid={`row-recent-order-${o.id}`}
                      >
                        <td className="px-5 py-2 font-mono">#{o.id}</td>
                        <td className="px-5 py-2">{o.email ?? "—"}</td>
                        <td className="px-5 py-2 capitalize">{o.status}</td>
                        <td className="px-5 py-2 text-right">
                          {formatCurrency(o.totalCents)}
                        </td>
                        <td className="px-5 py-2 text-right text-muted-foreground">
                          {formatDateTime(o.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-5 py-6 text-sm text-muted-foreground">
                  No orders yet.
                </p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}
