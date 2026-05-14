import { useEffect, useState } from "react";
import { AdminLayout } from "./AdminLayout";
import { Button } from "@/components/ui/button";
import {
  listAdminContactQuarantine,
  forwardAdminContactQuarantine,
  deleteAdminContactQuarantine,
  type AdminContactQuarantineEntry,
} from "@workspace/api-client-react";

type Entry = AdminContactQuarantineEntry;

export default function AdminContactQuarantine() {
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await listAdminContactQuarantine();
      setItems(result.items);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load quarantined messages.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function forward(id: number) {
    setBusyId(id);
    setError(null);
    try {
      await forwardAdminContactQuarantine(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to forward.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: number) {
    if (!confirm("Permanently delete this quarantined message?")) return;
    setBusyId(id);
    setError(null);
    try {
      await deleteAdminContactQuarantine(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminLayout title="Quarantined contact messages">
      <div data-testid="page-admin-contact-quarantine" className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Contact submissions filtered as suspicious by the spam heuristics.
          They were silently shadow-accepted (the sender saw a success page) and
          never delivered. Spot-check anything misclassified and forward it to
          your inbox. Entries auto-expire after the configured retention window.
        </p>

        {error && (
          <p className="text-sm text-red-600" data-testid="quarantine-error">
            {error}
          </p>
        )}

        {loading && <p className="text-sm">Loading…</p>}

        {!loading && items.length === 0 && (
          <p className="text-sm" data-testid="quarantine-empty">
            No quarantined messages right now.
          </p>
        )}

        <ul className="space-y-4">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-md border p-4"
              data-testid={`row-quarantine-${item.id}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">
                    {item.name}{" "}
                    <span className="text-muted-foreground">
                      &lt;{item.email}&gt;
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Received {new Date(item.createdAt).toLocaleString()} · expires{" "}
                    {new Date(item.expiresAt).toLocaleDateString()}
                    {item.ip ? ` · ip ${item.ip}` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busyId === item.id}
                    onClick={() => forward(item.id)}
                    data-testid={`button-forward-${item.id}`}
                  >
                    {item.forwardedAt
                      ? "Forward again"
                      : busyId === item.id
                        ? "…"
                        : "Forward to my inbox"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === item.id}
                    onClick={() => remove(item.id)}
                    data-testid={`button-delete-${item.id}`}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              <div className="mt-3 text-sm font-medium">{item.subject}</div>
              <pre className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">
                {item.message}
              </pre>
              {item.reasons.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.reasons.map((reason) => (
                    <span
                      key={reason}
                      className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {reason}
                    </span>
                  ))}
                </div>
              )}
              {item.forwardedAt && (
                <div
                  className="mt-2 text-xs text-muted-foreground"
                  data-testid={`text-forwarded-${item.id}`}
                >
                  Forwarded {new Date(item.forwardedAt).toLocaleString()}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </AdminLayout>
  );
}
