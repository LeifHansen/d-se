import { useState } from "react";
import { Link } from "wouter";
import { useListAdminCustomers } from "@workspace/api-client-react";
import { AdminLayout } from "./AdminLayout";
import { formatDateTime } from "./utils";
import { Input } from "@/components/ui/input";

export default function AdminCustomers() {
  const [search, setSearch] = useState("");
  const trimmed = search.trim();
  const { data, isLoading, error } = useListAdminCustomers(
    trimmed ? { search: trimmed } : undefined,
  );
  const customers = data ?? [];

  return (
    <AdminLayout title="Customers">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Saved customer records. Open one to see every order attached to it,
          including orders merged in from other email addresses.
        </p>
        <Input
          placeholder="Search by email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-customer-search"
        />
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading customers…</p>
        ) : error ? (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
            data-testid="text-customers-error"
          >
            Couldn't load customers. {(error as Error).message}
          </div>
        ) : customers.length === 0 ? (
          <div
            className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground"
            data-testid="text-customers-empty"
          >
            No customer records yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2 text-right">Orders</th>
                  <th className="px-4 py-2 text-right">Added</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-border/60"
                    data-testid={`row-customer-${c.id}`}
                  >
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/customers/${c.id}`}
                        className="font-medium underline"
                        data-testid={`link-customer-${c.id}`}
                      >
                        {c.name?.trim() || `Customer #${c.id}`}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {c.email}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {c.orderCount ?? 0}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {formatDateTime(c.createdAt)}
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
