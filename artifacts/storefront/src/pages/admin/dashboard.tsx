import { useGetAdminStats } from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const numberFormatter = new Intl.NumberFormat("en-US");

function formatCents(cents: number): string {
  return currencyFormatter.format((cents ?? 0) / 100);
}

function formatNumber(value: number): string {
  return numberFormatter.format(value ?? 0);
}

export default function AdminDashboard() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useGetAdminStats();

  return (
    <main
      id="main"
      className="mx-auto w-full max-w-5xl px-6 py-12"
      data-testid="page-admin-dashboard"
    >
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Admin
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Dashboard
          </h1>
        </div>
        {isFetching ? (
          <span
            className="text-xs text-muted-foreground"
            data-testid="admin-stats-refreshing"
          >
            Refreshing…
          </span>
        ) : null}
      </header>

      <section aria-labelledby="marketing-heading">
        <Card data-testid="panel-marketing">
          <CardHeader>
            <CardTitle id="marketing-heading">Marketing</CardTitle>
            <CardDescription>
              Newsletter growth and the last 7 days of paid orders.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div
                className="grid gap-6 sm:grid-cols-3"
                data-testid="marketing-loading"
              >
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : isError ? (
              <div
                className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
                data-testid="marketing-error"
                role="alert"
              >
                <p className="font-medium">Couldn't load marketing stats.</p>
                <p className="mt-1 text-destructive/80">
                  {error instanceof Error ? error.message : "Unknown error"}
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="mt-3 inline-flex items-center rounded-md border border-destructive/40 px-3 py-1 text-xs font-medium hover:bg-destructive/10"
                >
                  Try again
                </button>
              </div>
            ) : data ? (
              <div className="grid gap-6 sm:grid-cols-3">
                <Stat
                  label="Newsletter subscribers"
                  value={formatNumber(data.marketing.newsletterSubscribers)}
                  testId="marketing-subscribers"
                />
                <Stat
                  label="Orders (last 7 days)"
                  value={formatNumber(data.marketing.ordersLast7Days)}
                  testId="marketing-orders-7d"
                />
                <Stat
                  label="Revenue (last 7 days)"
                  value={formatCents(data.marketing.revenueCentsLast7Days)}
                  testId="marketing-revenue-7d"
                />
              </div>
            ) : null}

            {data?.marketing.ga4Url ? (
              <div className="mt-6 border-t pt-4">
                <a
                  href={data.marketing.ga4Url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  data-testid="marketing-ga4-link"
                >
                  Open Google Analytics
                  <span aria-hidden="true">→</span>
                </a>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className="mt-1 text-2xl font-semibold tabular-nums"
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}
