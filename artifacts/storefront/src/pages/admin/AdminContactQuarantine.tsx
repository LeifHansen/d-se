import { useEffect, useState } from "react";
import { AdminLayout } from "./AdminLayout";
import { Button } from "@/components/ui/button";
import {
  listAdminSpamQuarantine,
  forwardAdminContactQuarantine,
  deleteAdminContactQuarantine,
  markAdminContactQuarantineLegit,
  deleteAdminNewsletterQuarantine,
  markAdminNewsletterQuarantineLegit,
  getAdminSpamTrackingStats,
  type AdminSpamQuarantineSummary,
  type AdminContactQuarantineEntry,
  type AdminNewsletterQuarantineEntry,
  type AdminSpamReasonCount,
  type AdminSpamTrackingStats,
} from "@workspace/api-client-react";

type BusyKey = `contact:${number}` | `newsletter:${number}` | null;

export default function AdminContactQuarantine() {
  const [data, setData] = useState<AdminSpamQuarantineSummary | null>(null);
  const [trackingStats, setTrackingStats] =
    useState<AdminSpamTrackingStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyKey>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [result, stats] = await Promise.all([
        listAdminSpamQuarantine(),
        getAdminSpamTrackingStats(),
      ]);
      setData(result);
      setTrackingStats(stats);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load quarantined submissions.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function run(key: NonNullable<BusyKey>, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  const contact = data?.contact ?? [];
  const newsletter = data?.newsletter ?? [];

  return (
    <AdminLayout title="Spam quarantine">
      <div data-testid="page-admin-contact-quarantine" className="space-y-8">
        <p className="text-sm text-muted-foreground">
          Submissions filtered as suspicious by the spam heuristics across the
          contact form and the newsletter signup. Senders saw a success page
          and nothing was delivered or added to the audience. Spot-check
          anything misclassified, mark it as legit so you can spot a pattern of
          false positives, forward it to your inbox, or delete it. Entries
          auto-expire after the configured retention window.
        </p>

        {error && (
          <p className="text-sm text-red-600" data-testid="quarantine-error">
            {error}
          </p>
        )}

        <SpamTrackingStatsPanel
          loading={loading}
          stats={trackingStats}
        />

        <ReasonCountsPanel
          loading={loading}
          counts7={data?.reasonCounts7d ?? []}
          counts30={data?.reasonCounts30d ?? []}
        />

        <section className="space-y-3" data-testid="section-contact-quarantine">
          <h2 className="text-lg font-semibold">Contact form ({contact.length})</h2>
          {loading && contact.length === 0 && <p className="text-sm">Loading…</p>}
          {!loading && contact.length === 0 && (
            <p className="text-sm" data-testid="quarantine-empty">
              No filtered contact submissions right now.
            </p>
          )}
          <ul className="space-y-4">
            {contact.map((item) => (
              <ContactRow
                key={item.id}
                item={item}
                busy={busy}
                onForward={() =>
                  run(`contact:${item.id}`, () =>
                    forwardAdminContactQuarantine(item.id),
                  )
                }
                onMarkLegit={() =>
                  run(`contact:${item.id}`, () =>
                    markAdminContactQuarantineLegit(item.id),
                  )
                }
                onDelete={() => {
                  if (!confirm("Permanently delete this quarantined message?"))
                    return;
                  void run(`contact:${item.id}`, () =>
                    deleteAdminContactQuarantine(item.id),
                  );
                }}
              />
            ))}
          </ul>
        </section>

        <section
          className="space-y-3"
          data-testid="section-newsletter-quarantine"
        >
          <h2 className="text-lg font-semibold">
            Newsletter signups ({newsletter.length})
          </h2>
          {loading && newsletter.length === 0 && (
            <p className="text-sm">Loading…</p>
          )}
          {!loading && newsletter.length === 0 && (
            <p className="text-sm" data-testid="newsletter-quarantine-empty">
              No filtered newsletter signups right now.
            </p>
          )}
          <ul className="space-y-4">
            {newsletter.map((item) => (
              <NewsletterRow
                key={item.id}
                item={item}
                busy={busy}
                onMarkLegit={() =>
                  run(`newsletter:${item.id}`, () =>
                    markAdminNewsletterQuarantineLegit(item.id),
                  )
                }
                onDelete={() => {
                  if (!confirm("Permanently delete this quarantined signup?"))
                    return;
                  void run(`newsletter:${item.id}`, () =>
                    deleteAdminNewsletterQuarantine(item.id),
                  );
                }}
              />
            ))}
          </ul>
        </section>
      </div>
    </AdminLayout>
  );
}

function SpamTrackingStatsPanel({
  loading,
  stats,
}: {
  loading: boolean;
  stats: AdminSpamTrackingStats | null;
}) {
  const rows: Array<{
    key: "contactRateLimits" | "contactFingerprints" | "newsletterRateLimits";
    label: string;
  }> = [
    { key: "contactRateLimits", label: "Contact form rate limits" },
    { key: "contactFingerprints", label: "Contact submission fingerprints" },
    { key: "newsletterRateLimits", label: "Newsletter rate limits" },
  ];
  const lastRunLabel = stats?.lastRunAt
    ? new Date(stats.lastRunAt).toLocaleString()
    : "Not yet on this server";
  return (
    <section
      className="rounded-md border p-4"
      data-testid="section-spam-tracking-stats"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">
          Spam-tracking table cleanup
        </h2>
        <span
          className="text-xs text-muted-foreground"
          data-testid="text-spam-tracking-last-run"
        >
          Last sweep: {lastRunLabel}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Background sweeps prune stale rate-limit and fingerprint rows so the
        spam heuristics keep performing well. Watch for sudden spikes in the
        current row counts — they can hint at a flood of automated traffic.
      </p>
      {loading && !stats ? (
        <p className="mt-3 text-sm">Loading…</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-1 pr-4">Table</th>
              <th className="py-1 pr-4">Current rows</th>
              <th className="py-1">Removed last sweep</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, label }) => {
              const entry = stats?.[key];
              return (
                <tr
                  key={key}
                  className="border-t"
                  data-testid={`spam-tracking-row-${key}`}
                >
                  <td className="py-1 pr-4">{label}</td>
                  <td
                    className="py-1 pr-4"
                    data-testid={`spam-tracking-${key}-current`}
                  >
                    {entry ? entry.rowCount : "—"}
                  </td>
                  <td
                    className="py-1"
                    data-testid={`spam-tracking-${key}-removed`}
                  >
                    {entry && entry.lastSweepRemoved != null
                      ? entry.lastSweepRemoved
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ReasonCountsPanel({
  loading,
  counts7,
  counts30,
}: {
  loading: boolean;
  counts7: AdminSpamReasonCount[];
  counts30: AdminSpamReasonCount[];
}) {
  const reasons = Array.from(
    new Set([
      ...counts30.map((c) => c.reason),
      ...counts7.map((c) => c.reason),
    ]),
  );
  const find = (list: AdminSpamReasonCount[], reason: string): number =>
    list.find((c) => c.reason === reason)?.count ?? 0;

  return (
    <section
      className="rounded-md border p-4"
      data-testid="section-reason-counts"
    >
      <h2 className="text-base font-semibold">Filter activity by reason</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Submissions are counted once per reason, even if a single message
        matched multiple sub-rules. Use this to tell whether a heuristic is
        firing too often.
      </p>
      {loading && reasons.length === 0 ? (
        <p className="mt-3 text-sm">Loading…</p>
      ) : reasons.length === 0 ? (
        <p
          className="mt-3 text-sm"
          data-testid="reason-counts-empty"
        >
          No filtered submissions in the last 30 days.
        </p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-1 pr-4">Reason</th>
              <th className="py-1 pr-4">Last 7 days</th>
              <th className="py-1">Last 30 days</th>
            </tr>
          </thead>
          <tbody>
            {reasons.map((reason) => (
              <tr
                key={reason}
                className="border-t"
                data-testid={`reason-row-${reason}`}
              >
                <td className="py-1 pr-4 font-mono text-xs">{reason}</td>
                <td
                  className="py-1 pr-4"
                  data-testid={`reason-${reason}-7d`}
                >
                  {find(counts7, reason)}
                </td>
                <td className="py-1" data-testid={`reason-${reason}-30d`}>
                  {find(counts30, reason)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ReasonChips({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {reasons.map((reason) => (
        <span
          key={reason}
          className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
        >
          {reason}
        </span>
      ))}
    </div>
  );
}

function LegitBadge({ at }: { at: string | Date | null | undefined }) {
  if (!at) return null;
  return (
    <span
      className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      data-testid="badge-legit"
    >
      Marked legit {new Date(at).toLocaleDateString()}
    </span>
  );
}

function ContactRow({
  item,
  busy,
  onForward,
  onMarkLegit,
  onDelete,
}: {
  item: AdminContactQuarantineEntry;
  busy: BusyKey;
  onForward: () => void;
  onMarkLegit: () => void;
  onDelete: () => void;
}) {
  const isBusy = busy === `contact:${item.id}`;
  return (
    <li
      className="rounded-md border p-4"
      data-testid={`row-quarantine-${item.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 font-medium">
            <span>{item.name}</span>
            <span className="text-muted-foreground">
              &lt;{item.email}&gt;
            </span>
            <LegitBadge at={item.markedLegitAt} />
          </div>
          <div className="text-sm text-muted-foreground">
            Received {new Date(item.createdAt).toLocaleString()} · expires{" "}
            {new Date(item.expiresAt).toLocaleDateString()}
            {item.ip ? ` · ip ${item.ip}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={isBusy}
            onClick={onForward}
            data-testid={`button-forward-${item.id}`}
          >
            {item.forwardedAt
              ? "Forward again"
              : isBusy
                ? "…"
                : "Forward to my inbox"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={isBusy || item.markedLegitAt != null}
            onClick={onMarkLegit}
            data-testid={`button-mark-legit-${item.id}`}
          >
            {item.markedLegitAt ? "Marked legit" : "Mark as legit"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isBusy}
            onClick={onDelete}
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
      <ReasonChips reasons={item.reasons} />
      {item.forwardedAt && (
        <div
          className="mt-2 text-xs text-muted-foreground"
          data-testid={`text-forwarded-${item.id}`}
        >
          Forwarded {new Date(item.forwardedAt).toLocaleString()}
        </div>
      )}
    </li>
  );
}

function NewsletterRow({
  item,
  busy,
  onMarkLegit,
  onDelete,
}: {
  item: AdminNewsletterQuarantineEntry;
  busy: BusyKey;
  onMarkLegit: () => void;
  onDelete: () => void;
}) {
  const isBusy = busy === `newsletter:${item.id}`;
  return (
    <li
      className="rounded-md border p-4"
      data-testid={`row-newsletter-quarantine-${item.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 font-medium">
            <span>{item.email}</span>
            <LegitBadge at={item.markedLegitAt} />
          </div>
          <div className="text-sm text-muted-foreground">
            Received {new Date(item.createdAt).toLocaleString()} · expires{" "}
            {new Date(item.expiresAt).toLocaleDateString()}
            {item.source ? ` · source ${item.source}` : ""}
            {item.ip ? ` · ip ${item.ip}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={isBusy || item.markedLegitAt != null}
            onClick={onMarkLegit}
            data-testid={`button-newsletter-mark-legit-${item.id}`}
          >
            {item.markedLegitAt ? "Marked legit" : "Mark as legit"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isBusy}
            onClick={onDelete}
            data-testid={`button-newsletter-delete-${item.id}`}
          >
            Delete
          </Button>
        </div>
      </div>
      <ReasonChips reasons={item.reasons} />
    </li>
  );
}
