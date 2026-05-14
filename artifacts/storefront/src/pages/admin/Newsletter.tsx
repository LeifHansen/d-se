import { useEffect, useState, type FormEvent } from "react";
import { PageLayout } from "@/components/dose/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listAdminNewsletterSubscribers,
  adminUnsubscribeNewsletterSubscriber,
  getExportAdminNewsletterSubscribersUrl,
} from "@workspace/api-client-react";

type Status = "active" | "unsubscribed" | "all";
type Subscriber = {
  id: number;
  email: string;
  source: string | null;
  status: "active" | "unsubscribed";
  createdAt: string;
  unsubscribedAt?: string | null;
  resendContactId?: string | null;
};

export default function AdminNewsletter() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [items, setItems] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await listAdminNewsletterSubscribers({
        page,
        pageSize,
        ...(search ? { search } : {}),
        status,
      });
      setItems(result.items as unknown as Subscriber[]);
      setTotal(result.total);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load subscribers. You may need to sign in as an admin.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, search]);

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  async function unsubscribe(id: number) {
    setBusyId(id);
    try {
      await adminUnsubscribeNewsletterSubscriber(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unsubscribe.");
    } finally {
      setBusyId(null);
    }
  }

  const exportHref = `${getExportAdminNewsletterSubscribersUrl({ status })}`;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <PageLayout
      eyebrow="Admin"
      title="Newsletter subscribers"
      testId="page-admin-newsletter"
    >
      <form
        onSubmit={onSearchSubmit}
        className="not-prose flex flex-wrap items-end gap-3"
        data-testid="newsletter-filters"
      >
        <div className="flex-1 min-w-[220px]">
          <Label htmlFor="search">Search by email or source</Label>
          <Input
            id="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="email or source"
            data-testid="input-search"
          />
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            className="block h-10 rounded-md border bg-background px-3 text-sm"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value as Status);
            }}
            data-testid="select-status"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="unsubscribed">Unsubscribed</option>
          </select>
        </div>
        <Button type="submit" data-testid="button-search">
          Search
        </Button>
        <a
          href={exportHref}
          className="inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium"
          data-testid="link-export-csv"
        >
          Export CSV
        </a>
      </form>

      {error && (
        <p className="mt-4 text-sm text-red-600" data-testid="newsletter-error">
          {error}
        </p>
      )}

      <div className="not-prose mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm" data-testid="table-subscribers">
          <thead className="border-b">
            <tr>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Source</th>
              <th className="py-2 pr-4">Subscribed</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="py-4" colSpan={5}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td className="py-4" colSpan={5}>
                  No subscribers found.
                </td>
              </tr>
            )}
            {!loading &&
              items.map((s) => (
                <tr
                  key={s.id}
                  className="border-b"
                  data-testid={`row-subscriber-${s.id}`}
                >
                  <td className="py-2 pr-4">{s.email}</td>
                  <td className="py-2 pr-4">{s.source ?? "—"}</td>
                  <td className="py-2 pr-4">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 pr-4 capitalize">{s.status}</td>
                  <td className="py-2 pr-4">
                    {s.status === "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === s.id}
                        onClick={() => unsubscribe(s.id)}
                        data-testid={`button-unsubscribe-${s.id}`}
                      >
                        {busyId === s.id ? "…" : "Unsubscribe"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div
        className="not-prose mt-4 flex items-center justify-between text-sm"
        data-testid="pagination"
      >
        <span>
          {total} subscriber{total === 1 ? "" : "s"} · page {page} of{" "}
          {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            data-testid="button-prev-page"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            data-testid="button-next-page"
          >
            Next
          </Button>
        </div>
      </div>
    </PageLayout>
  );
}
