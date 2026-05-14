import { useMemo, useState } from "react";
import {
  useListAdminOrders,
  type ListAdminOrdersParams,
} from "@workspace/api-client-react";
import { AdminLayout } from "./AdminLayout";
import { formatCurrency, formatDateTime } from "./utils";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "shipped", label: "Shipped" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

export default function AdminOrders() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const params = useMemo<ListAdminOrdersParams>(() => {
    const p: ListAdminOrdersParams = {};
    if (status) p.status = status;
    if (appliedSearch.trim()) p.search = appliedSearch.trim();
    if (from) p.from = from;
    if (to) p.to = to;
    return p;
  }, [status, appliedSearch, from, to]);

  const { data, isLoading, error, refetch, isFetching } =
    useListAdminOrders(params);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAppliedSearch(search);
  }

  function reset() {
    setStatus("");
    setSearch("");
    setAppliedSearch("");
    setFrom("");
    setTo("");
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="text-sm text-muted-foreground">
            Filter by status, search by order ID or email, and scope to a date
            range.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-5"
          data-testid="form-order-filters"
        >
          <label className="flex flex-col gap-1 text-xs">
            <span className="uppercase tracking-wider text-muted-foreground">
              Status
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              data-testid="select-status"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs md:col-span-2">
            <span className="uppercase tracking-wider text-muted-foreground">
              Search (order ID or email)
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. 1042 or jane@example.com"
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              data-testid="input-search"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="uppercase tracking-wider text-muted-foreground">
              From
            </span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              data-testid="input-from"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="uppercase tracking-wider text-muted-foreground">
              To
            </span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              data-testid="input-to"
            />
          </label>
          <div className="md:col-span-5 flex items-center gap-2">
            <button
              type="submit"
              className="h-9 rounded-md bg-foreground px-3 text-sm font-medium text-background"
              data-testid="button-apply-filters"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={reset}
              className="h-9 rounded-md border border-border px-3 text-sm"
              data-testid="button-reset-filters"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              className="h-9 rounded-md border border-border px-3 text-sm"
              data-testid="button-refresh"
            >
              Refresh
            </button>
            {isFetching ? (
              <span className="text-xs text-muted-foreground">Updating…</span>
            ) : null}
          </div>
        </form>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading orders…</p>
        ) : error ? (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
            data-testid="text-orders-error"
          >
            Couldn't load orders. {(error as Error).message}
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
                {(data ?? []).map((o) => (
                  <tr
                    key={o.id}
                    className="border-t border-border/60"
                    data-testid={`row-order-${o.id}`}
                  >
                    <td className="px-4 py-2 font-mono">#{o.id}</td>
                    <td className="px-4 py-2">{o.email ?? "—"}</td>
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
                {(data ?? []).length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                      data-testid="text-orders-empty"
                    >
                      No orders match those filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
