import { useRoute, Link } from "wouter";
import { useListAdminOrdersByEmail } from "@workspace/api-client-react";
import { AdminLayout } from "./AdminLayout";
import { formatCurrency, formatDateTime } from "./utils";

export default function AdminOrdersByEmail() {
  const [, params] = useRoute<{ email: string }>("/admin/orders/by-email/:email");
  let rawEmail = "";
  if (params?.email) {
    try {
      rawEmail = decodeURIComponent(params.email);
    } catch {
      rawEmail = params.email;
    }
  }
  const normalized = rawEmail.trim().toLowerCase();

  const { data, isLoading, error } = useListAdminOrdersByEmail(normalized);

  const orders = data?.orders ?? [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <Link
            href="/admin/orders"
            className="text-xs text-muted-foreground underline"
            data-testid="link-back-to-orders"
          >
            ← Back to all orders
          </Link>
          <h1 className="mt-2 text-2xl font-semibold" data-testid="text-customer-email">
            Customer: {normalized || "—"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Every order placed under this email address.
          </p>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading orders…</p>
        ) : error ? (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
            data-testid="text-orders-error"
          >
            Couldn't load orders. {(error as Error).message}
          </div>
        ) : orders.length === 0 ? (
          <div
            className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground"
            data-testid="text-orders-empty"
          >
            No other orders have been placed under {normalized}.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Order</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Items</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Placed</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className="border-t border-border/60"
                    data-testid={`row-order-${o.id}`}
                  >
                    <td className="px-4 py-2 font-mono">#{o.id}</td>
                    <td className="px-4 py-2 capitalize">{o.status}</td>
                    <td className="px-4 py-2 text-right">
                      {o.items.reduce((s, i) => s + i.quantity, 0)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatCurrency(o.totalCents, o.currency)}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {formatDateTime(o.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
