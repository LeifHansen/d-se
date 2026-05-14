import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminDiscountCodes,
  useCreateDiscountCode,
  useUpdateDiscountCode,
  useDeleteDiscountCode,
  getListAdminDiscountCodesQueryKey,
  type DiscountCode,
  type DiscountCodeInput,
} from "@workspace/api-client-react";
import { AdminLayout } from "./AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type FormState = {
  code: string;
  type: "percent" | "fixed";
  value: string;
  minSubtotalCents: string;
  maxRedemptions: string;
  expiresAt: string;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  code: "",
  type: "percent",
  value: "",
  minSubtotalCents: "",
  maxRedemptions: "",
  expiresAt: "",
  active: true,
};

function toForm(d: DiscountCode): FormState {
  return {
    code: d.code,
    type: d.type,
    value: String(
      d.type === "percent" ? d.value : Math.round(d.value) / 100,
    ),
    minSubtotalCents:
      d.minSubtotalCents != null ? String(d.minSubtotalCents / 100) : "",
    maxRedemptions: d.maxRedemptions != null ? String(d.maxRedemptions) : "",
    expiresAt: d.expiresAt ? d.expiresAt.slice(0, 10) : "",
    active: d.active,
  };
}

function fromForm(f: FormState): DiscountCodeInput | { error: string } {
  const code = f.code.trim().toUpperCase();
  if (!code) return { error: "Code is required" };
  const valueNum = Number(f.value);
  if (!Number.isFinite(valueNum) || valueNum <= 0)
    return { error: "Value must be greater than zero" };
  if (f.type === "percent" && valueNum > 100)
    return { error: "Percent must be 1–100" };
  const value =
    f.type === "percent" ? Math.round(valueNum) : Math.round(valueNum * 100);
  const minSubtotalCents = f.minSubtotalCents.trim()
    ? Math.round(Number(f.minSubtotalCents) * 100)
    : null;
  const maxRedemptions = f.maxRedemptions.trim()
    ? Math.round(Number(f.maxRedemptions))
    : null;
  const expiresAt = f.expiresAt
    ? new Date(`${f.expiresAt}T23:59:59Z`).toISOString()
    : null;
  return {
    code,
    type: f.type,
    value,
    minSubtotalCents,
    maxRedemptions,
    expiresAt,
    active: f.active,
  };
}

function formatDiscountValue(d: DiscountCode): string {
  return d.type === "percent" ? `${d.value}%` : `$${(d.value / 100).toFixed(2)}`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export default function AdminDiscounts() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const list = useListAdminDiscountCodes();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DiscountCode | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListAdminDiscountCodesQueryKey() });

  const createMut = useCreateDiscountCode({
    mutation: {
      onSuccess: () => {
        invalidate();
        setOpen(false);
        toast({ title: "Discount code created" });
      },
      onError: (e: Error) => setError(e.message),
    },
  });
  const updateMut = useUpdateDiscountCode({
    mutation: {
      onSuccess: () => {
        invalidate();
        setOpen(false);
        toast({ title: "Discount code updated" });
      },
      onError: (e: Error) => setError(e.message),
    },
  });
  const deleteMut = useDeleteDiscountCode({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Discount code deleted" });
      },
      onError: (e: Error) =>
        toast({ title: "Delete failed", description: e.message }),
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setOpen(true);
  };
  const openEdit = (d: DiscountCode) => {
    setEditing(d);
    setForm(toForm(d));
    setError(null);
    setOpen(true);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const built = fromForm(form);
    if ("error" in built) {
      setError(built.error);
      return;
    }
    if (editing) {
      updateMut.mutate({ id: editing.id, data: built });
    } else {
      createMut.mutate({ data: built });
    }
  };

  const toggleActive = (d: DiscountCode) => {
    updateMut.mutate({
      id: d.id,
      data: {
        code: d.code,
        type: d.type,
        value: d.value,
        minSubtotalCents: d.minSubtotalCents ?? null,
        maxRedemptions: d.maxRedemptions ?? null,
        expiresAt: d.expiresAt ?? null,
        active: !d.active,
      },
    });
  };

  const remove = (d: DiscountCode) => {
    if (!confirm(`Delete discount code "${d.code}"?`)) return;
    deleteMut.mutate({ id: d.id });
  };

  return (
    <AdminLayout title="Discount codes">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-foreground/70">
          Create, edit, or deactivate promo codes shoppers can apply at
          checkout.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} data-testid="discount-new">
              New code
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing ? `Edit ${editing.code}` : "New discount code"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="d-code">Code</Label>
                <Input
                  id="d-code"
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, code: e.target.value }))
                  }
                  placeholder="WELCOME10"
                  data-testid="discount-code-input"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="d-type">Type</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        type: v as "percent" | "fixed",
                      }))
                    }
                  >
                    <SelectTrigger id="d-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percent off</SelectItem>
                      <SelectItem value="fixed">Fixed amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="d-value">
                    {form.type === "percent" ? "Percent (1–100)" : "Amount ($)"}
                  </Label>
                  <Input
                    id="d-value"
                    type="number"
                    inputMode="decimal"
                    step={form.type === "percent" ? "1" : "0.01"}
                    min="0"
                    value={form.value}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, value: e.target.value }))
                    }
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="d-min">Min subtotal ($)</Label>
                  <Input
                    id="d-min"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={form.minSubtotalCents}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        minSubtotalCents: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="d-max">Max redemptions</Label>
                  <Input
                    id="d-max"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={form.maxRedemptions}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        maxRedemptions: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="d-expires">Expires</Label>
                <Input
                  id="d-expires"
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, expiresAt: e.target.value }))
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-md border border-foreground/10 p-3">
                <div>
                  <Label htmlFor="d-active" className="text-sm font-medium">
                    Active
                  </Label>
                  <p className="text-xs text-foreground/60">
                    Inactive codes cannot be redeemed.
                  </p>
                </div>
                <Switch
                  id="d-active"
                  checked={form.active}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, active: v }))
                  }
                />
              </div>
              {error && (
                <p
                  className="text-sm text-destructive"
                  data-testid="discount-error"
                >
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={createMut.isPending || updateMut.isPending}
                  data-testid="discount-save"
                >
                  {editing ? "Save changes" : "Create code"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border border-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Min</TableHead>
              <TableHead>Used / Max</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {list.isError && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-sm text-destructive"
                >
                  Failed to load discount codes.
                </TableCell>
              </TableRow>
            )}
            {list.data?.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-sm text-foreground/60"
                >
                  No discount codes yet.
                </TableCell>
              </TableRow>
            )}
            {list.data?.map((d) => (
              <TableRow key={d.id} data-testid={`discount-row-${d.id}`}>
                <TableCell className="font-mono">{d.code}</TableCell>
                <TableCell>{formatDiscountValue(d)}</TableCell>
                <TableCell>
                  {d.minSubtotalCents != null
                    ? `$${(d.minSubtotalCents / 100).toFixed(2)}`
                    : "—"}
                </TableCell>
                <TableCell>
                  {d.redemptionsCount}
                  {d.maxRedemptions != null ? ` / ${d.maxRedemptions}` : ""}
                </TableCell>
                <TableCell>{formatDate(d.expiresAt)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={d.active}
                      onCheckedChange={() => toggleActive(d)}
                      aria-label={`Toggle active for ${d.code}`}
                    />
                    <Badge variant={d.active ? "default" : "secondary"}>
                      {d.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(d)}
                      data-testid={`discount-edit-${d.id}`}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(d)}
                      data-testid={`discount-delete-${d.id}`}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminLayout>
  );
}
