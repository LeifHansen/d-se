import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useBulkUpdateInventory,
  useRequestUploadUrl,
  getExportProductsCsvUrl,
  getListAdminProductsQueryKey,
  type Product,
  type ProductInput,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
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
  images: string[];
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
  images: [],
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
    images: p.images ?? [],
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
  const images = f.images.map((s) => s.trim()).filter(Boolean);
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

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
  const [slugTouched, setSlugTouched] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);

  const slugConflict = useMemo(() => {
    const slug = form.slug.trim().toLowerCase();
    if (!slug) return null;
    const owner = (data ?? []).find((p) => p.slug === slug);
    if (!owner) return null;
    if (editing && owner.id === editing.id) return null;
    return owner;
  }, [form.slug, data, editing]);

  const slugSuggestion = useMemo(() => {
    if (!slugConflict) return null;
    const slug = form.slug.trim().toLowerCase();
    const base = slug.replace(/-\d+$/, "") || slug;
    const taken = new Set(
      (data ?? [])
        .filter((p) => !editing || p.id !== editing.id)
        .map((p) => p.slug),
    );
    let n = 2;
    while (taken.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }, [slugConflict, form.slug, data, editing]);

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
    setSlugTouched(false);
    setEditorOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm(toForm(p));
    setFormError(null);
    setSlugTouched(true);
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
    if (slugConflict) {
      setFormError(
        `Slug "${built.slug}" is already used by "${slugConflict.name}". Pick a different slug.`,
      );
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
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({
                      ...f,
                      name,
                      slug: slugTouched ? f.slug : slugify(name),
                    }));
                  }}
                  required
                  data-testid="input-product-name"
                />
              </div>
              <div>
                <Label htmlFor="p-slug">Slug</Label>
                <Input
                  id="p-slug"
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((f) => ({ ...f, slug: e.target.value }));
                  }}
                  placeholder="lowercase-with-dashes"
                  required
                  aria-invalid={slugConflict ? true : undefined}
                  data-testid="input-product-slug"
                />
                {slugConflict ? (
                  <p
                    className="mt-1 text-xs text-amber-700 dark:text-amber-400"
                    data-testid="text-slug-conflict"
                  >
                    Already used by &ldquo;{slugConflict.name}&rdquo;. Pick a
                    different slug.
                    {slugSuggestion ? (
                      <>
                        {" "}
                        <button
                          type="button"
                          className="underline underline-offset-2 hover:no-underline"
                          onClick={() => {
                            setSlugTouched(true);
                            setForm((f) => ({ ...f, slug: slugSuggestion }));
                          }}
                          data-testid="button-use-slug-suggestion"
                        >
                          Use {slugSuggestion}
                        </button>
                      </>
                    ) : null}
                  </p>
                ) : null}
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
              <Label>Images</Label>
              <ImageManager
                images={form.images}
                onChange={(images) => setForm((f) => ({ ...f, images }))}
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

function ImageManager({
  images,
  onChange,
}: {
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const { toast } = useToast();
  const requestUpload = useRequestUploadUrl();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    const uploaded: string[] = [];
    const failed: string[] = [];
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast({
            title: "Skipped non-image file",
            description: file.name,
          });
          continue;
        }
        try {
          const { uploadURL, objectPath } = await requestUpload.mutateAsync({
            data: {
              name: file.name,
              size: file.size,
              contentType: file.type,
            },
          });
          const put = await fetch(uploadURL, {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
          });
          if (!put.ok) {
            throw new Error(`HTTP ${put.status}`);
          }
          const published = await apiFetch<{ url: string }>(
            "/admin/uploads/publish-image",
            {
              method: "POST",
              body: JSON.stringify({ objectPath }),
            },
          );
          uploaded.push(published.url);
        } catch (e) {
          failed.push(`${file.name}: ${(e as Error).message}`);
        }
      }
      if (uploaded.length > 0) {
        onChange([...images, ...uploaded]);
      }
      if (failed.length > 0) {
        toast({
          title: `Failed to upload ${failed.length} file${failed.length === 1 ? "" : "s"}`,
          description: failed.join("\n"),
        });
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function remove(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) {
      return;
    }
    const next = images.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  function onDragStart(e: DragEvent<HTMLLIElement>, index: number) {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: DragEvent<HTMLLIElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onDrop(e: DragEvent<HTMLLIElement>, index: number) {
    e.preventDefault();
    if (dragIndex == null) return;
    move(dragIndex, index);
    setDragIndex(null);
  }

  return (
    <div className="space-y-3" data-testid="product-image-manager">
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
          data-testid="input-product-image-file"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          data-testid="button-upload-image"
        >
          {uploading ? "Uploading…" : "Upload images"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Drag thumbnails to reorder. The first image is the cover.
        </p>
      </div>
      {images.length === 0 ? (
        <p className="text-xs text-muted-foreground">No images yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((src, i) => (
            <li
              key={`${src}-${i}`}
              draggable
              onDragStart={(e) => onDragStart(e, i)}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, i)}
              className={`group relative overflow-hidden rounded-md border border-border bg-muted/30 ${
                dragIndex === i ? "opacity-50" : ""
              }`}
              data-testid={`product-image-thumb-${i}`}
            >
              <div className="aspect-square w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Product image ${i + 1}`}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </div>
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-background/85 px-1.5 py-1 text-[10px]">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, i - 1)}
                    disabled={i === 0}
                    className="rounded border border-border px-1.5 py-0.5 disabled:opacity-30"
                    aria-label="Move left"
                    data-testid={`button-image-up-${i}`}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, i + 1)}
                    disabled={i === images.length - 1}
                    className="rounded border border-border px-1.5 py-0.5 disabled:opacity-30"
                    aria-label="Move right"
                    data-testid={`button-image-down-${i}`}
                  >
                    →
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="rounded border border-destructive/40 px-1.5 py-0.5 text-destructive hover:bg-destructive/10"
                  data-testid={`button-image-remove-${i}`}
                >
                  Remove
                </button>
              </div>
              {i === 0 ? (
                <span className="absolute left-1 top-1 rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-background">
                  Cover
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
