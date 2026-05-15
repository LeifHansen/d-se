import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminBlogPosts,
  useCreateBlogPost,
  useUpdateBlogPost,
  useDeleteBlogPost,
  useRequestUploadUrl,
  getListAdminBlogPostsQueryKey,
  getAdminBlogPostBySlug,
  type BlogPost,
  type BlogPostInput,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { AdminLayout } from "./AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BLOG_PROSE_CLASSES,
  BlogMarkdown,
} from "@/components/blog/BlogMarkdown";
import {
  Dialog,
  DialogContent,
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

type EditorForm = {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string;
  author: string;
  tags: string;
  seoTitle: string;
  seoDescription: string;
  published: boolean;
};

const EMPTY_FORM: EditorForm = {
  slug: "",
  title: "",
  excerpt: "",
  content: "",
  coverImage: "",
  author: "",
  tags: "",
  seoTitle: "",
  seoDescription: "",
  published: false,
};

function toForm(p: BlogPost): EditorForm {
  return {
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    content: p.content,
    coverImage: p.coverImage ?? "",
    author: p.author ?? "",
    tags: (p.tags ?? []).join(", "),
    seoTitle: p.seoTitle ?? "",
    seoDescription: p.seoDescription ?? "",
    published: p.published,
  };
}

function fromForm(f: EditorForm): BlogPostInput | { error: string } {
  const slug = f.slug.trim().toLowerCase();
  const title = f.title.trim();
  const excerpt = f.excerpt.trim();
  const content = f.content;
  if (!slug) return { error: "Slug is required" };
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug))
    return { error: "Slug must be lowercase letters, numbers, and dashes" };
  if (!title) return { error: "Title is required" };
  if (!excerpt) return { error: "Excerpt is required" };
  if (!content.trim()) return { error: "Content is required" };
  const tags = f.tags
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    slug,
    title,
    excerpt,
    content,
    coverImage: f.coverImage.trim() || null,
    author: f.author.trim() || null,
    tags,
    seoTitle: f.seoTitle.trim() || null,
    seoDescription: f.seoDescription.trim() || null,
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

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminBlog() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useListAdminBlogPosts();
  const createPost = useCreateBlogPost();
  const updatePost = useUpdateBlogPost();
  const deletePost = useDeleteBlogPost();

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListAdminBlogPostsQueryKey() });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [form, setForm] = useState<EditorForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<BlogPost | null>(null);
  const [prefillLoading, setPrefillLoading] = useState(false);

  const posts = data ?? [];

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setSlugTouched(false);
    setEditorOpen(true);
  }

  async function openEdit(p: BlogPost) {
    setEditing(p);
    setForm(toForm(p));
    setFormError(null);
    setSlugTouched(true);
    setEditorOpen(true);
    setPrefillLoading(true);
    try {
      const fresh = await getAdminBlogPostBySlug(p.slug);
      setEditing(fresh);
      setForm(toForm(fresh));
    } catch (err) {
      toast({
        title: "Couldn't load latest post data",
        description: (err as Error).message,
      });
    } finally {
      setPrefillLoading(false);
    }
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
        await updatePost.mutateAsync({ id: editing.id, data: built });
        toast({ title: `Saved ${built.title}` });
      } else {
        await createPost.mutateAsync({ data: built });
        toast({ title: `Created ${built.title}` });
      }
      setEditorOpen(false);
      invalidate();
      refetch();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  async function performDelete(p: BlogPost) {
    try {
      await deletePost.mutateAsync({ id: p.id });
      toast({ title: `Deleted ${p.title}` });
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
            <h1 className="text-2xl font-semibold">Blog</h1>
            <p className="text-sm text-muted-foreground">
              Create posts, edit drafts, and publish to the public blog.
            </p>
          </div>
          <Button
            type="button"
            onClick={openCreate}
            data-testid="button-new-post"
          >
            New post
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading posts…</p>
        ) : error ? (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
            data-testid="text-posts-error"
          >
            Couldn't load posts. {(error as Error).message}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Post</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Published</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-border/60"
                    data-testid={`row-post-${p.id}`}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{p.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.slug}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {p.published ? (
                        <span
                          className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300"
                          data-testid={`badge-status-${p.id}`}
                        >
                          Published
                        </span>
                      ) : (
                        <span
                          className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
                          data-testid={`badge-status-${p.id}`}
                        >
                          Draft
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatDate(p.publishedAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={`/blog/${p.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="h-8 inline-flex items-center rounded-md border border-border px-3 text-xs"
                          data-testid={`link-preview-${p.id}`}
                        >
                          Preview
                        </a>
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
                ))}
                {posts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      No posts yet.
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
              {editing ? `Edit ${editing.title}` : "New post"}
            </DialogTitle>
            {editing && prefillLoading ? (
              <p
                className="text-xs text-muted-foreground"
                data-testid="text-post-prefill-loading"
              >
                Loading latest content…
              </p>
            ) : null}
          </DialogHeader>
          <form
            onSubmit={submitEditor}
            className="space-y-4"
            data-testid="post-editor-form"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="b-title">Title</Label>
                <Input
                  id="b-title"
                  value={form.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    setForm((f) => ({
                      ...f,
                      title,
                      slug: slugTouched ? f.slug : slugify(title),
                    }));
                  }}
                  required
                  data-testid="input-post-title"
                />
              </div>
              <div>
                <Label htmlFor="b-slug">Slug</Label>
                <Input
                  id="b-slug"
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((f) => ({ ...f, slug: e.target.value }));
                  }}
                  required
                  data-testid="input-post-slug"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="b-excerpt">Excerpt</Label>
              <Textarea
                id="b-excerpt"
                value={form.excerpt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, excerpt: e.target.value }))
                }
                rows={2}
                required
                data-testid="input-post-excerpt"
              />
            </div>

            <div>
              <Label htmlFor="b-content">Content (Markdown)</Label>
              <Tabs defaultValue="write" className="mt-1.5">
                <TabsList>
                  <TabsTrigger
                    value="write"
                    data-testid="tab-post-content-write"
                  >
                    Write
                  </TabsTrigger>
                  <TabsTrigger
                    value="preview"
                    data-testid="tab-post-content-preview"
                  >
                    Preview
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="write" className="mt-2">
                  <Textarea
                    id="b-content"
                    value={form.content}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, content: e.target.value }))
                    }
                    rows={14}
                    required
                    className="font-mono text-xs"
                    data-testid="input-post-content"
                  />
                </TabsContent>
                <TabsContent value="preview" className="mt-2">
                  <div
                    className="min-h-[20rem] rounded-md border border-border bg-background p-4"
                    data-testid="post-content-preview"
                  >
                    {form.content.trim() ? (
                      <div className={BLOG_PROSE_CLASSES}>
                        <BlogMarkdown content={form.content} />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nothing to preview yet. Start writing in the Write tab.
                      </p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div>
              <Label>Cover image</Label>
              <CoverImagePicker
                value={form.coverImage}
                onChange={(coverImage) =>
                  setForm((f) => ({ ...f, coverImage }))
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="b-author">Author</Label>
                <Input
                  id="b-author"
                  value={form.author}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, author: e.target.value }))
                  }
                  data-testid="input-post-author"
                />
              </div>
              <div>
                <Label htmlFor="b-tags">Tags (comma-separated)</Label>
                <Input
                  id="b-tags"
                  value={form.tags}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tags: e.target.value }))
                  }
                  data-testid="input-post-tags"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="b-seo-title">SEO title</Label>
                <Input
                  id="b-seo-title"
                  value={form.seoTitle}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, seoTitle: e.target.value }))
                  }
                  data-testid="input-post-seo-title"
                />
              </div>
              <div>
                <Label htmlFor="b-seo-desc">SEO description</Label>
                <Input
                  id="b-seo-desc"
                  value={form.seoDescription}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, seoDescription: e.target.value }))
                  }
                  data-testid="input-post-seo-description"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div>
                <div className="text-sm font-medium">Published</div>
                <p className="text-xs text-muted-foreground">
                  Drafts are hidden from the public blog but visible at
                  /blog/&lt;slug&gt; for preview.
                </p>
              </div>
              <Switch
                checked={form.published}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, published: checked }))
                }
                data-testid="switch-post-published"
              />
            </div>

            {formError ? (
              <p
                className="text-sm text-destructive"
                data-testid="text-post-form-error"
              >
                {formError}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditorOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createPost.isPending || updatePost.isPending}
                data-testid="button-save-post"
              >
                {editing ? "Save changes" : "Create post"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDelete != null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete
                ? `"${confirmDelete.title}" will be permanently removed.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && performDelete(confirmDelete)}
              data-testid="button-confirm-delete-post"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

function CoverImagePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { toast } = useToast();
  const requestUpload = useRequestUploadUrl();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please choose an image file" });
      return;
    }
    setUploading(true);
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
      if (!put.ok) throw new Error(`HTTP ${put.status}`);
      const published = await apiFetch<{ url: string }>(
        "/admin/uploads/publish-image",
        {
          method: "POST",
          body: JSON.stringify({ objectPath }),
        },
      );
      onChange(published.url);
    } catch (e) {
      toast({
        title: "Upload failed",
        description: (e as Error).message,
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2" data-testid="post-cover-image">
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… or upload below"
          data-testid="input-post-cover-image-url"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => handleFile(e.target.files?.[0])}
          data-testid="input-post-cover-image-file"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          data-testid="button-upload-cover-image"
        >
          {uploading ? "Uploading…" : "Upload"}
        </Button>
        {value ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange("")}
            data-testid="button-clear-cover-image"
          >
            Clear
          </Button>
        ) : null}
      </div>
      {value ? (
        <div className="overflow-hidden rounded-md border border-border bg-muted/30">
          <img
            src={value}
            alt="Cover"
            className="max-h-48 w-full object-cover"
          />
        </div>
      ) : null}
    </div>
  );
}
