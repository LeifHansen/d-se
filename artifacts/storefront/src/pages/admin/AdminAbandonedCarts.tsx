import {
  useListAdminAbandonedCarts,
  type AbandonedCart,
} from "@workspace/api-client-react";
import { AdminLayout } from "./AdminLayout";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function recoveryStatus(c: AbandonedCart): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (c.recoveredAt) return { label: "Recovered", variant: "default" };
  if (c.secondReminderSentAt)
    return { label: "2 reminders sent", variant: "outline" };
  if (c.firstReminderSentAt)
    return { label: "1 reminder sent", variant: "outline" };
  return { label: "No reminders", variant: "secondary" };
}

export default function AdminAbandonedCarts() {
  const list = useListAdminAbandonedCarts();

  const totals = list.data?.reduce(
    (acc, c) => {
      acc.count += 1;
      if (c.recoveredAt) acc.recovered += 1;
      acc.value += c.subtotalCents ?? 0;
      return acc;
    },
    { count: 0, recovered: 0, value: 0 },
  );

  return (
    <AdminLayout title="Abandoned carts">
      <p className="mb-4 text-sm text-foreground/70">
        Carts where a shopper provided an email but did not check out. Recovery
        emails are sent automatically; this view shows the latest 200 records.
      </p>

      {totals && (
        <div className="mb-6 grid grid-cols-3 gap-4">
          <SummaryTile label="Total carts" value={String(totals.count)} />
          <SummaryTile
            label="Recovered"
            value={`${totals.recovered} / ${totals.count}`}
          />
          <SummaryTile
            label="Cart value"
            value={`$${(totals.value / 100).toFixed(2)}`}
          />
        </div>
      )}

      <div className="rounded-md border border-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Subtotal</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Reminder 1</TableHead>
              <TableHead>Reminder 2</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Order</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {list.isError && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-sm text-destructive"
                >
                  Failed to load abandoned carts.
                </TableCell>
              </TableRow>
            )}
            {list.data?.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-sm text-foreground/60"
                >
                  No abandoned carts.
                </TableCell>
              </TableRow>
            )}
            {list.data?.map((c) => {
              const status = recoveryStatus(c);
              return (
                <TableRow key={c.id} data-testid={`cart-row-${c.id}`}>
                  <TableCell className="font-mono text-xs">{c.email}</TableCell>
                  <TableCell>{c.itemCount ?? 0}</TableCell>
                  <TableCell>
                    ${((c.subtotalCents ?? 0) / 100).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDateTime(c.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDateTime(c.firstReminderSentAt)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDateTime(c.secondReminderSentAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {c.recoveredOrderId ?? "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </AdminLayout>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-foreground/10 p-4">
      <div className="text-xs uppercase tracking-wide text-foreground/60">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
