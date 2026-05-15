import { useRoute, Link } from "wouter";
import { useGetAdminCustomer } from "@workspace/api-client-react";
import { AdminLayout } from "./AdminLayout";
import { formatCurrency, formatDateTime } from "./utils";

export default function AdminCustomerDetail() {
  const [, params] = useRoute<{ id: string }>("/admin/customers/:id");
  const id = Number(params?.id);
  const valid = Number.isInteger(id) && id > 0;
  const { data, isLoading, error } = useGetAdminCustomer(valid ? id : 0, {
    query: { enabled: valid } as never,
  });

  const customer = data?.customer;
  const orders = data?.orders ?? [];
  const emails = Array.from(
    new Set(
      orders
        .map((o) => (o.email ?? "").trim().toLowerCase())
        .filter((e) => e.length > 0),
    ),
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <Link
            href="/admin/customers"
            className="text-xs text-muted-foreground underline"
            data-testid="link-back-to-customers"
          >
            ← Back to all customers
          </Link>
          {!valid ? (
            <p className="mt-4 text-sm text-destructive">
              Invalid customer id.
            </p>
          ) : isLoading ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <div
              className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
              data-testid="text-customer-error"
            >
              Couldn't load customer. {(error as Error).message}
            </div>
          ) : customer ? (
            <>
              <h1
                className="mt-2 text-2xl font-semibold"
                data-testid="text-customer-name"
              >
                {customer.name?.trim() || `Customer #${customer.id}`}
              </h1>
              <p
                className="text-sm text-muted-foreground"
                data-testid="text-customer-primary-email"
              >
                {customer.email}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Added {formatDateTime(customer.createdAt)}
              </p>
              {emails.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    Order emails:
                  </span>
                  {emails.map((e) => (
                    <Link
                      key={e}
                      href={`/admin/orders/by-email/${encodeURIComponent(e)}`}
                      className="rounded-md border border-border px-2 py-1 font-mono underline"
                      data-testid={`link-email-${e}`}
                    >
                      {e}
                    </Link>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        {valid && !isLoading && !error ? (
          orders.length === 0 ? (
            <div
              className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground"
              data-testid="text-customer-orders-empty"
            >
              No orders attached to this customer yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Order</th>
                    <th className="px-4 py-2">Email</th>
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
                      <td className="px-4 py-2 text-muted-foreground">
                        {o.email ?? "—"}
                      </td>
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
          )
        ) : null}
      </div>
    </AdminLayout>
  );
}
