import { useGetAdminTaxSummary } from "@workspace/api-client-react";
import { AdminLayout } from "./AdminLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export default function AdminTaxSummary() {
  const q = useGetAdminTaxSummary();

  return (
    <AdminLayout title="Tax summary">
      <p className="mb-4 text-sm text-foreground/70">
        Aggregate sales tax collected on completed orders. Configure tax
        registrations and rates in your Stripe Tax dashboard.
      </p>

      {q.isLoading && (
        <div className="py-8 text-center text-sm">Loading…</div>
      )}
      {q.isError && (
        <div className="py-8 text-center text-sm text-destructive">
          Failed to load tax summary.
        </div>
      )}

      {q.data && (
        <div className="space-y-6">
          {q.data.warning ? (
            <Alert variant="destructive" data-testid="tax-warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Stripe Tax is disabled</AlertTitle>
              <AlertDescription>{q.data.warning}</AlertDescription>
            </Alert>
          ) : (
            <Alert data-testid="tax-ok">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Stripe Tax is enabled</AlertTitle>
              <AlertDescription>
                Tax is being calculated and collected on checkout.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Tile
              label="Tax collected"
              value={`$${(q.data.taxCollectedCents / 100).toFixed(2)}`}
              sub={q.data.currency.toUpperCase()}
            />
            <Tile
              label="Taxable orders"
              value={String(q.data.taxableOrders)}
              sub="Paid + fulfilled"
            />
            <Tile
              label="Stripe Tax"
              value={
                <Badge
                  variant={q.data.stripeTaxEnabled ? "default" : "secondary"}
                >
                  {q.data.stripeTaxEnabled ? "Enabled" : "Disabled"}
                </Badge>
              }
            />
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-foreground/10 p-4">
      <div className="text-xs uppercase tracking-wide text-foreground/60">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-foreground/60">{sub}</div>}
    </div>
  );
}
