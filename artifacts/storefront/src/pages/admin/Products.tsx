import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useBulkUpdateInventory,
  getExportProductsCsvUrl,
  getListAdminProductsQueryKey,
  type Product,
  type ProductInput,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { AdminLayout } from "./AdminLayout";
import { formatCurrency } from "./utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Draft = { inventory: string; lowStockThreshold: string };

type EditorForm = {
  slug: string;
  name: string;
  description: string;
  shortDescription: string;
  price: string;
  compareAt: string;
  currency: string;
  images: string;
  inventory: string;
  lowStockThreshold: string;
  weightOz: string;
  tags: string;
  seoTitle: string;
  seoDescription: string;
  featured: boolean;
  published: boolean;
};

const EMPTY_FORM: EditorForm = {
  slug: "",
  name: "",
  description: "",
  shortDescription: "",
  price: "",
  compareAt: "",
  currency: "USD",
  images: "",
  inventory: "0",
  lowStockThreshold: "0",
  weightOz: "",
  tags: "",
  seoTitle: "",
  seoDescription: "",
  featured: false,
  published: true,
};

function toDraft(p: Product): Draft {
  return {
    inventory: String(p.inventory ?? 0),
    lowStockThreshold: String(p.lowStockThreshold ?? 0),
  };
}

function toForm(p: Product): EditorForm {
  return {
    slug: p.slug,
    name: p.name,
    description: p.description,
    shortDescription: p.shortDescription ?? "",
    price: (p.priceCents / 100).toFixed(2),
    compareAt: p.compareAtCents != null ? (p.compareAtCents / 100).toFixed(2) : "",
    currency: p.currency || "USD",
    images: (p.images ?? []).join("\n"),
    inventory: String(p.inventory ?? 0),
    lowStockThreshold: String(p.lowStockThreshold ?? 0),
    weightOz: p.weightOz != null ? String(p.weightOz) : "",
    tags: (p.tags ?? []).join(", "),
    seoTitle: p.seoTitle ?? "",
    seoDescription: p.seoDescription ?? "",
    featured: p.featured,
    published: p.published,
  };
}

function fromForm(f: EditorForm): ProductInput | { error: string } {
  const slug = f.slug.trim().toLowerCase();
  const name = f.name.trim();
  const description = f.description.trim();
  if (!slug) return { error: "Slug is required" };
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug))
    return { error: "Slug must be lowercase letters, numbers, and dashes" };
  if (!name) return { error: "Name is required" };
  if (!description) return { error: "Description is required" };
  const priceNum = Number(f.price);
  if (!Number.isFinite(priceNum) || priceNum < 0)
    return { error: "Price must be a non-negative number" };
  const priceCents = Math.round(priceNum * 100);
  let compareAtCents: number | null = null;
  if (f.compareAt.trim() !== "") {
    const c = Number(f.compareAt);
    if (!Number.isFinite(c) || c < 0)
      return { error: "Compare-at price must be a non-negative number" };
    compareAtCents = Math.round(c * 100);
  }
  const inventory = Number(f.inventory);
  if (!Number.isFinite(inventory) || inventory < 0 || !Number.isInteger(inventory))
    return { error: "Inventory must be a non-negative whole number" };
  const lowStockThreshold = Number(f.lowStockThreshold);
  if (
    !Number.isFinite(lowStockThreshold) ||
    lowStockThreshold < 0 ||
    !Number.isInteger(lowStockThreshold)
  )
    return { error: "Low-stock threshold must be a non-negative whole number" };
  let weightOz: number | null = null;
  if (f.weightOz.trim() !== "") {
    const w = Number(f.weightOz);
    if (!Number.isFinite(w) || w < 0)
      return { error: "Weight must be a non-negative number" };
    weightOz = w;
  }
  const images = f.images
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const tags = f.tags
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    slug,
    name,
    description,
    shortDescription: f.shortDescription.trim() || null,
    priceCents,
    compareAtCents,
    currency: f.currency.trim().toUpperCase() || "USD",
    images,
    inventory,
    lowStockThreshold,
    weightOz,
    tags,
    seoTitle: f.seoTitle.trim() || null,
    seoDescription: f.seoDescription.trim() || null,
    featured: f.featured,
    published: f.published,
  };
}

function isLow(p: Product) {
  return (p.inventory ?? 0) <= (p.lowStockThreshold ?? 0);
}

export default function AdminProducts() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useListAdminProducts();
  const updateProduct = useUpdateProduct();
  const createProduct = useCreateProduct();
  const deleteProduct = useDeleteProduct();
  const bulkUpdate = useBulkUpdateInventory();

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListAdminProductsQueryKey() });

  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<EditorForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);

  // Seed drafts whenever the product list changes, and prune any
  // selected ids that no longer correspond to a product (e.g. after a
  // delete).
  useEffect(() => {
    if (!data) return;
    setDrafts((prev) => {
      const next: Record<number, Draft> = { ...prev };
      for (const p of data) {
        if (!next[p.id]) next[p.id] = toDraft(p);
      }
      return next;
    });
    setSelected((prev) => {
      const ids = new Set(data.map((p) => p.id));
      let changed = false;
      const next = new Set<number>();
      for (const id of prev) {
        if (ids.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
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

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditorOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm(toForm(p));
    setFormError(null);
    setEditorOpen(true);
  }

  async function submitEditor(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const built = fromForm(form);
    if ("error" in built) {
      setFormError(built.error);
      return;
    }
    try {
      if (editing) {
        await updateProduct.mutateAsync({ id: editing.id, data: built });
        toast({ title: `Saved ${built.name}` });
      } else {
        await createProduct.mutateAsync({ data: built });
        toast({ title: `Created ${built.name}` });
      }
      setEditorOpen(false);
      setDrafts({});
      invalidate();
      refetch();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  async function performDelete(p: Product) {
    try {
      await deleteProduct.mutateAsync({ id: p.id });
      toast({ title: `Deleted ${p.name}` });
      setConfirmDelete(null);
      invalidate();
      refetch();
    } catch (err) {
      toast({
        title: "Delete failed",
        description: (err as Error).message,
      });
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Products</h1>
            <p className="text-sm text-muted-foreground">
              Create products, edit details, and manage inventory.
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
            <Button
              type="button"
              onClick={openCreate}
              data-testid="button-new-product"
            >
              New product
            </Button>
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
                  <th className="px-3 py-2 text-right">Actions</th>
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
                          {p.featured ? (
                            <span className="ml-2 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] uppercase">
                              featured
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
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={!rowDirty || updateProduct.isPending}
                            onClick={() => saveRow(p)}
                            className="h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
                            data-testid={`button-save-${p.id}`}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="h-8 rounded-md border border-border px-3 text-xs"
                            data-testid={`button-edit-${p.id}`}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(p)}
                            className="h-8 rounded-md border border-border px-3 text-xs text-destructive hover:bg-destructive/10"
                            data-testid={`button-delete-${p.id}`}
                          >
                            Delete
                          </button>
                        </div>
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

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${editing.name}` : "New product"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={submitEditor}
            className="space-y-4"
            data-testid="product-editor-form"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="p-name">Name</Label>
                <Input
                  id="p-name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  required
                  data-testid="input-product-name"
                />
              </div>
              <div>
                <Label htmlFor="p-slug">Slug</Label>
                <Input
                  id="p-slug"
                  value={form.slug}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, slug: e.target.value }))
                  }
                  placeholder="lowercase-with-dashes"
                  required
                  data-testid="input-product-slug"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="p-short">Short description</Label>
              <Textarea
                id="p-short"
                value={form.shortDescription}
                onChange={(e) =>
                  setForm((f) => ({ ...f, shortDescription: e.target.value }))
                }
                rows={2}
                data-testid="input-product-short"
              />
            </div>

            <div>
              <Label htmlFor="p-desc">Description</Label>
              <Textarea
                id="p-desc"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={5}
                required
                data-testid="input-product-description"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="p-price">Price ($)</Label>
                <Input
                  id="p-price"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, price: e.target.value }))
                  }
                  required
                  data-testid="input-product-price"
                />
              </div>
              <div>
                <Label htmlFor="p-compare">Compare at ($)</Label>
                <Input
                  id="p-compare"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={form.compareAt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, compareAt: e.target.value }))
                  }
                  data-testid="input-product-compare"
                />
              </div>
              <div>
                <Label htmlFor="p-currency">Currency</Label>
                <Input
                  id="p-currency"
                  value={form.currency}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, currency: e.target.value }))
                  }
                  maxLength={3}
                  data-testid="input-product-currency"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="p-inventory">Inventory</Label>
                <Input
                  id="p-inventory"
                  type="number"
                  min="0"
                  step="1"
                  value={form.inventory}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, inventory: e.target.value }))
                  }
                  required
                  data-testid="input-product-inventory"
                />
              </div>
              <div>
                <Label htmlFor="p-lowstock">Low-stock at</Label>
                <Input
                  id="p-lowstock"
                  type="number"
                  min="0"
                  step="1"
                  value={form.lowStockThreshold}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      lowStockThreshold: e.target.value,
                    }))
                  }
                  data-testid="input-product-lowstock"
                />
              </div>
              <div>
                <Label htmlFor="p-weight">Weight (oz)</Label>
                <Input
                  id="p-weight"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={form.weightOz}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, weightOz: e.target.value }))
                  }
                  data-testid="input-product-weight"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="p-images">Images (one URL per line)</Label>
              <Textarea
                id="p-images"
                value={form.images}
                onChange={(e) =>
                  setForm((f) => ({ ...f, images: e.target.value }))
                }
                rows={4}
                placeholder="https://…"
                data-testid="input-product-images"
              />
            </div>

            <div>
              <Label htmlFor="p-tags">Tags (comma separated)</Label>
              <Input
                id="p-tags"
                value={form.tags}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tags: e.target.value }))
                }
                placeholder="electrolytes, citrus"
                data-testid="input-product-tags"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="p-seo-title">SEO title</Label>
                <Input
                  id="p-seo-title"
                  value={form.seoTitle}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, seoTitle: e.target.value }))
                  }
                  data-testid="input-product-seo-title"
                />
              </div>
              <div>
                <Label htmlFor="p-seo-desc">SEO description</Label>
                <Input
                  id="p-seo-desc"
                  value={form.seoDescription}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, seoDescription: e.target.value }))
                  }
                  data-testid="input-product-seo-description"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <Label htmlFor="p-published" className="text-sm font-medium">
                    Published
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Drafts are hidden from the storefront.
                  </p>
                </div>
                <Switch
                  id="p-published"
                  checked={form.published}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, published: v }))
                  }
                  data-testid="switch-product-published"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <Label htmlFor="p-featured" className="text-sm font-medium">
                    Featured
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Surface on the home page.
                  </p>
                </div>
                <Switch
                  id="p-featured"
                  checked={form.featured}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, featured: v }))
                  }
                  data-testid="switch-product-featured"
                />
              </div>
            </div>

            {formError ? (
              <p
                className="text-sm text-destructive"
                data-testid="product-editor-error"
              >
                {formError}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditorOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createProduct.isPending || updateProduct.isPending}
                data-testid="button-save-product"
              >
                {editing ? "Save changes" : "Create product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(v) => {
          if (!v) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete
                ? `"${confirmDelete.name}" will be permanently removed. This cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) performDelete(confirmDelete);
              }}
              disabled={deleteProduct.isPending}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
