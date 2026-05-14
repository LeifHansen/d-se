import { useEffect, useMemo, useState } from "react";
import {
  useListAdminProducts,
  useUpdateProduct,
  useBulkUpdateInventory,
  getExportProductsCsvUrl,
  type Product,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { AdminLayout } from "./AdminLayout";
import { formatCurrency } from "./utils";

type Draft = { inventory: string; lowStockThreshold: string };

function toDraft(p: Product): Draft {
  return {
    inventory: String(p.inventory ?? 0),
    lowStockThreshold: String(p.lowStockThreshold ?? 0),
  };
}

function isLow(p: Product) {
  return (p.inventory ?? 0) <= (p.lowStockThreshold ?? 0);
}

export default function AdminProducts() {
  const { toast } = useToast();
  const { data, isLoading, error, refetch, queryKey } = useListAdminProducts();
  const updateProduct = useUpdateProduct();
  const bulkUpdate = useBulkUpdateInventory();

  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Seed drafts whenever the product list changes.
  useEffect(() => {
    if (!data) return;
    setDrafts((prev) => {
      const next: Record<number, Draft> = { ...prev };
      for (const p of data) {
        if (!next[p.id]) next[p.id] = toDraft(p);
      }
      return next;
    });
  }, [data]);

  const products = data ?? [];

  const dirty = useMemo(() => {
    const ids: number[] = [];
    for (const p of products) {
      const d = drafts[p.id];
      if (!d) continue;
      const inv = Number(d.inventory);
      const lst = Number(d.lowStockThreshold);
      if (
        Number.isFinite(inv) &&
        Number.isFinite(lst) &&
        (inv !== p.inventory || lst !== p.lowStockThreshold)
      ) {
        ids.push(p.id);
      }
    }
    return ids;
  }, [drafts, products]);

  function setDraft(id: number, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === products.length) setSelected(new Set());
    else setSelected(new Set(products.map((p) => p.id)));
  }

  async function saveRow(p: Product) {
    const d = drafts[p.id];
    if (!d) return;
    const inventory = Number(d.inventory);
    const lowStockThreshold = Number(d.lowStockThreshold);
    if (!Number.isFinite(inventory) || inventory < 0) {
      toast({ title: "Inventory must be a non-negative number" });
      return;
    }
    if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
      toast({ title: "Low-stock threshold must be a non-negative number" });
      return;
    }
    try {
      await updateProduct.mutateAsync({
        id: p.id,
        data: {
          slug: p.slug,
          name: p.name,
          description: p.description,
          shortDescription: p.shortDescription ?? null,
          priceCents: p.priceCents,
          compareAtCents: p.compareAtCents ?? null,
          currency: p.currency,
          images: p.images ?? [],
          inventory,
          lowStockThreshold,
          weightOz: p.weightOz ?? null,
          tags: p.tags ?? [],
          seoTitle: p.seoTitle ?? null,
          seoDescription: p.seoDescription ?? null,
          featured: p.featured,
          published: p.published,
        },
      });
      toast({ title: `Saved ${p.name}` });
      refetch();
    } catch (e) {
      toast({
        title: "Failed to save",
        description: (e as Error).message,
      });
    }
  }

  async function applyBulkInventory(value: number) {
    if (selected.size === 0) return;
    try {
      await bulkUpdate.mutateAsync({
        data: {
          updates: Array.from(selected).map((id) => ({
            id,
            inventory: value,
          })),
        },
      });
      toast({ title: `Updated ${selected.size} products` });
      setSelected(new Set());
      setDrafts({});
      refetch();
    } catch (e) {
      toast({
        title: "Bulk update failed",
        description: (e as Error).message,
      });
    }
  }

  async function applyBulkThreshold(value: number) {
    if (selected.size === 0) return;
    try {
      await bulkUpdate.mutateAsync({
        data: {
          updates: Array.from(selected).map((id) => {
            const p = products.find((x) => x.id === id)!;
            return {
              id,
              inventory: p.inventory,
              lowStockThreshold: value,
            };
          }),
        },
      });
      toast({ title: `Updated low-stock threshold on ${selected.size}` });
      setSelected(new Set());
      setDrafts({});
      refetch();
    } catch (e) {
      toast({
        title: "Bulk update failed",
        description: (e as Error).message,
      });
    }
  }

  async function downloadCsv() {
    try {
      const res = await fetch(getExportProductsCsvUrl(), {
        credentials: "include",
        headers: { accept: "text/csv" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `products-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({
        title: "CSV download failed",
        description: (e as Error).message,
      });
    }
  }

  // Avoid an unused-var warning while keeping queryKey available for future
  // optimistic updates.
  void queryKey;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Products</h1>
            <p className="text-sm text-muted-foreground">
              Edit inventory inline, set per-product low-stock thresholds, and
              export the catalog.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadCsv}
              className="h-9 rounded-md border border-border px-3 text-sm"
              data-testid="button-download-csv"
            >
              Download CSV
            </button>
          </div>
        </div>

        <BulkBar
          selectedCount={selected.size}
          onClear={() => setSelected(new Set())}
          onApplyInventory={applyBulkInventory}
          onApplyThreshold={applyBulkThreshold}
          pending={bulkUpdate.isPending}
        />

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading products…</p>
        ) : error ? (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
            data-testid="text-products-error"
          >
            Couldn't load products. {(error as Error).message}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={
                        products.length > 0 &&
                        selected.size === products.length
                      }
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                      data-testid="checkbox-select-all"
                    />
                  </th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2 text-right">Inventory</th>
                  <th className="px-3 py-2 text-right">Low-stock at</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const d = drafts[p.id] ?? toDraft(p);
                  const rowDirty = dirty.includes(p.id);
                  return (
                    <tr
                      key={p.id}
                      className="border-t border-border/60"
                      data-testid={`row-product-${p.id}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          aria-label={`Select ${p.name}`}
                          data-testid={`checkbox-product-${p.id}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.slug}
                          {!p.published ? (
                            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
                              draft
                            </span>
                          ) : null}
                          {isLow(p) ? (
                            <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] uppercase text-amber-700 dark:text-amber-300">
                              low stock
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrency(p.priceCents, p.currency)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          value={d.inventory}
                          onChange={(e) =>
                            setDraft(p.id, { inventory: e.target.value })
                          }
                          className="h-8 w-24 rounded border border-border bg-background px-2 text-right text-sm"
                          data-testid={`input-inventory-${p.id}`}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          value={d.lowStockThreshold}
                          onChange={(e) =>
                            setDraft(p.id, {
                              lowStockThreshold: e.target.value,
                            })
                          }
                          className="h-8 w-24 rounded border border-border bg-background px-2 text-right text-sm"
                          data-testid={`input-threshold-${p.id}`}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          disabled={!rowDirty || updateProduct.isPending}
                          onClick={() => saveRow(p)}
                          className="h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
                          data-testid={`button-save-${p.id}`}
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {products.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      No products yet.
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

function BulkBar({
  selectedCount,
  onClear,
  onApplyInventory,
  onApplyThreshold,
  pending,
}: {
  selectedCount: number;
  onClear: () => void;
  onApplyInventory: (n: number) => void;
  onApplyThreshold: (n: number) => void;
  pending: boolean;
}) {
  const [inv, setInv] = useState("");
  const [thr, setThr] = useState("");

  if (selectedCount === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Tip: select rows with the checkboxes to bulk-edit inventory or
        thresholds.
      </p>
    );
  }
  return (
    <div
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3"
      data-testid="bulk-bar"
    >
      <div className="text-sm">
        <strong>{selectedCount}</strong> selected
      </div>
      <label className="flex items-center gap-2 text-xs">
        <span className="uppercase tracking-wider text-muted-foreground">
          Set inventory
        </span>
        <input
          type="number"
          min={0}
          value={inv}
          onChange={(e) => setInv(e.target.value)}
          className="h-8 w-24 rounded border border-border bg-background px-2 text-right text-sm"
          data-testid="input-bulk-inventory"
        />
        <button
          type="button"
          disabled={pending || inv === "" || Number(inv) < 0}
          onClick={() => {
            onApplyInventory(Number(inv));
            setInv("");
          }}
          className="h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:opacity-50"
          data-testid="button-apply-bulk-inventory"
        >
          Apply
        </button>
      </label>
      <label className="flex items-center gap-2 text-xs">
        <span className="uppercase tracking-wider text-muted-foreground">
          Set low-stock at
        </span>
        <input
          type="number"
          min={0}
          value={thr}
          onChange={(e) => setThr(e.target.value)}
          className="h-8 w-24 rounded border border-border bg-background px-2 text-right text-sm"
          data-testid="input-bulk-threshold"
        />
        <button
          type="button"
          disabled={pending || thr === "" || Number(thr) < 0}
          onClick={() => {
            onApplyThreshold(Number(thr));
            setThr("");
          }}
          className="h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:opacity-50"
          data-testid="button-apply-bulk-threshold"
        >
          Apply
        </button>
      </label>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto h-8 rounded-md border border-border px-3 text-xs"
        data-testid="button-bulk-clear"
      >
        Clear
      </button>
    </div>
  );
}
