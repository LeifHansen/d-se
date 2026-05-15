import { useState, type FormEvent } from "react";
import { useRoute, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminOrdersByEmail,
  useListAdminCustomers,
  useCreateAdminCustomer,
  useMergeOrdersIntoCustomer,
  getListAdminOrdersByEmailQueryKey,
  getListAdminOrdersQueryKey,
  getListAdminCustomersQueryKey,
  type Customer,
} from "@workspace/api-client-react";
import { AdminLayout } from "./AdminLayout";
import { formatCurrency, formatDateTime } from "./utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

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

  const qc = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const customersQuery = useListAdminCustomers(
    search.trim() ? { search: search.trim() } : undefined,
    { query: { enabled: open } as never },
  );
  const createCustomer = useCreateAdminCustomer();
  const mergeOrders = useMergeOrdersIntoCustomer();

  const existingCustomerId =
    orders.length > 0
      ? orders.every((o) => o.customerId === orders[0].customerId)
        ? orders[0].customerId ?? null
        : null
      : null;

  function resetDialog(): void {
    setSearch("");
    setNewName("");
    setErrorMessage(null);
  }

  async function handleMerge(customer: Customer): Promise<void> {
    setErrorMessage(null);
    try {
      const result = await mergeOrders.mutateAsync({
        data: { email: normalized, customerId: customer.id },
      });
      toast({
        title: "Orders merged",
        description: `${result.mergedCount} order${result.mergedCount === 1 ? "" : "s"} attached to ${customer.email}.`,
      });
      await Promise.all([
        qc.invalidateQueries({
          queryKey: getListAdminOrdersByEmailQueryKey(normalized),
        }),
        qc.invalidateQueries({ queryKey: getListAdminOrdersQueryKey() }),
        qc.invalidateQueries({ queryKey: getListAdminCustomersQueryKey() }),
      ]);
      setOpen(false);
      resetDialog();
    } catch (err) {
      setErrorMessage((err as Error).message || "Failed to merge orders");
    }
  }

  async function handleCreateAndMerge(e: FormEvent): Promise<void> {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const created = await createCustomer.mutateAsync({
        data: { email: normalized, name: newName.trim() || null },
      });
      await handleMerge(created);
    } catch (err) {
      setErrorMessage((err as Error).message || "Failed to create customer");
    }
  }

  const customers = customersQuery.data ?? [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link
              href="/admin/orders"
              className="text-xs text-muted-foreground underline"
              data-testid="link-back-to-orders"
            >
              ← Back to all orders
            </Link>
            <h1
              className="mt-2 text-2xl font-semibold"
              data-testid="text-customer-email"
            >
              Customer: {normalized || "—"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Every order placed under this email address.
            </p>
            {existingCustomerId != null ? (
              <Badge
                variant="secondary"
                className="mt-2"
                data-testid="badge-merged-customer"
              >
                Merged into customer #{existingCustomerId}
              </Badge>
            ) : null}
          </div>
          {orders.length > 0 ? (
            <Button
              type="button"
              onClick={() => {
                resetDialog();
                setOpen(true);
              }}
              data-testid="button-open-merge"
            >
              Merge into customer
            </Button>
          ) : null}
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

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) resetDialog();
        }}
      >
        <DialogContent data-testid="dialog-merge-customer">
          <DialogHeader>
            <DialogTitle>Merge into customer</DialogTitle>
            <DialogDescription>
              Attach every order placed under {normalized} to a single customer
              record.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="merge-search">Pick an existing customer</Label>
              <Input
                id="merge-search"
                placeholder="Search by email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-customer-search"
              />
              <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                {customersQuery.isLoading ? (
                  <p className="p-3 text-sm text-muted-foreground">Loading…</p>
                ) : customers.length === 0 ? (
                  <p
                    className="p-3 text-sm text-muted-foreground"
                    data-testid="text-no-customers"
                  >
                    No customers yet. Create one below.
                  </p>
                ) : (
                  <ul>
                    {customers.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2 last:border-b-0"
                        data-testid={`row-customer-${c.id}`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {c.email}
                          </p>
                          {c.name ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {c.name}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={mergeOrders.isPending}
                          onClick={() => handleMerge(c)}
                          data-testid={`button-merge-customer-${c.id}`}
                        >
                          Merge
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <form
              onSubmit={handleCreateAndMerge}
              className="space-y-2 rounded-md border border-dashed border-border p-3"
            >
              <Label htmlFor="merge-new-name">Or create a new customer</Label>
              <p className="text-xs text-muted-foreground">
                Email <span className="font-mono">{normalized}</span>
              </p>
              <Input
                id="merge-new-name"
                placeholder="Optional name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                data-testid="input-new-customer-name"
              />
              <Button
                type="submit"
                size="sm"
                disabled={createCustomer.isPending || mergeOrders.isPending}
                data-testid="button-create-and-merge"
              >
                Create & merge
              </Button>
            </form>

            {errorMessage ? (
              <p
                className="text-sm text-destructive"
                data-testid="text-merge-error"
              >
                {errorMessage}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                resetDialog();
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
