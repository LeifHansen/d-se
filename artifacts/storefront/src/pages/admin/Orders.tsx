import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminOrders,
  useGetAdminOrderShippingRates,
  useFulfillOrder,
  getAdminOrderShippingRates,
  fulfillOrder,
  getListAdminOrdersQueryKey,
  type ListAdminOrdersParams,
  type Order,
  type ShippingRate,
} from "@workspace/api-client-react";
import { AdminLayout } from "./AdminLayout";
import { formatCurrency, formatDateTime } from "./utils";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "shipped", label: "Shipped" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

export default function AdminOrders() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [bulkErrors, setBulkErrors] = useState<
    { orderId: number; message: string }[]
  >([]);

  const params = useMemo<ListAdminOrdersParams>(() => {
    const p: ListAdminOrdersParams = {};
    if (status) p.status = status;
    if (appliedSearch.trim()) p.search = appliedSearch.trim();
    if (from) p.from = from;
    if (to) p.to = to;
    return p;
  }, [status, appliedSearch, from, to]);

  const { data, isLoading, error, refetch, isFetching } =
    useListAdminOrders(params);

  const selectedOrder = useMemo(
    () => (data ?? []).find((o) => o.id === selectedId) ?? null,
    [data, selectedId],
  );

  const queryClient = useQueryClient();

  const eligibleOrders = useMemo(
    () =>
      (data ?? []).filter(
        (o) =>
          o.status === "paid" &&
          o.shippingAddress &&
          !o.trackingCode &&
          !o.labelUrl,
      ),
    [data],
  );
  const eligibleIds = useMemo(
    () => new Set(eligibleOrders.map((o) => o.id)),
    [eligibleOrders],
  );
  const checkedEligibleCount = useMemo(
    () => Array.from(checkedIds).filter((id) => eligibleIds.has(id)).length,
    [checkedIds, eligibleIds],
  );
  const allEligibleChecked =
    eligibleOrders.length > 0 &&
    checkedEligibleCount === eligibleOrders.length;

  function toggleChecked(id: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllEligible() {
    if (allEligibleChecked) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(eligibleOrders.map((o) => o.id)));
    }
  }

  async function handleBulkBuyLabels() {
    const targets = (data ?? []).filter(
      (o) => checkedIds.has(o.id) && eligibleIds.has(o.id),
    );
    if (targets.length === 0) return;
    setBulkRunning(true);
    setBulkErrors([]);
    setBulkProgress({ done: 0, total: targets.length });
    const labels: { orderId: number; labelUrl: string }[] = [];
    const errors: { orderId: number; message: string }[] = [];
    const CONCURRENCY = 4;
    let completed = 0;
    let cursor = 0;

    async function processOne(order: (typeof targets)[number]) {
      try {
        const ratesResp = await getAdminOrderShippingRates(order.id);
        if (!ratesResp.rates || ratesResp.rates.length === 0) {
          throw new Error("No shipping rates available");
        }
        const cheapest = [...ratesResp.rates].sort(
          (a, b) => a.amountCents - b.amountCents,
        )[0];
        const updated = await fulfillOrder(order.id, {
          shippingRateId: cheapest.id,
          ...(ratesResp.shipmentId ? { shipmentId: ratesResp.shipmentId } : {}),
        });
        if (updated.labelUrl) {
          labels.push({ orderId: order.id, labelUrl: updated.labelUrl });
        } else {
          errors.push({
            orderId: order.id,
            message: "Label purchased but no label URL returned",
          });
        }
      } catch (err) {
        errors.push({
          orderId: order.id,
          message: err instanceof Error ? err.message : "Failed",
        });
      }
      completed += 1;
      setBulkProgress({ done: completed, total: targets.length });
    }

    async function worker() {
      while (true) {
        const index = cursor++;
        if (index >= targets.length) return;
        await processOne(targets[index]);
      }
    }

    const workerCount = Math.min(CONCURRENCY, targets.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    setBulkErrors(errors);
    setBulkRunning(false);
    setCheckedIds(new Set());
    await queryClient.invalidateQueries({
      queryKey: getListAdminOrdersQueryKey(params),
    });
    if (labels.length > 0) {
      openLabelPrintSheet(labels);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAppliedSearch(search);
  }

  function reset() {
    setStatus("");
    setSearch("");
    setAppliedSearch("");
    setFrom("");
    setTo("");
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="text-sm text-muted-foreground">
            Filter by status, search by order ID or email, and scope to a date
            range. Click a row to open it and buy a shipping label.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-5"
          data-testid="form-order-filters"
        >
          <label className="flex flex-col gap-1 text-xs">
            <span className="uppercase tracking-wider text-muted-foreground">
              Status
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              data-testid="select-status"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs md:col-span-2">
            <span className="uppercase tracking-wider text-muted-foreground">
              Search (order ID or email)
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. 1042 or jane@example.com"
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              data-testid="input-search"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="uppercase tracking-wider text-muted-foreground">
              From
            </span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              data-testid="input-from"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="uppercase tracking-wider text-muted-foreground">
              To
            </span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              data-testid="input-to"
            />
          </label>
          <div className="md:col-span-5 flex items-center gap-2">
            <button
              type="submit"
              className="h-9 rounded-md bg-foreground px-3 text-sm font-medium text-background"
              data-testid="button-apply-filters"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={reset}
              className="h-9 rounded-md border border-border px-3 text-sm"
              data-testid="button-reset-filters"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              className="h-9 rounded-md border border-border px-3 text-sm"
              data-testid="button-refresh"
            >
              Refresh
            </button>
            {isFetching ? (
              <span className="text-xs text-muted-foreground">Updating…</span>
            ) : null}
          </div>
        </form>

        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
          data-testid="bulk-actions-bar"
        >
          <span className="text-muted-foreground">
            {checkedEligibleCount === 0
              ? "Select paid orders with a shipping address to buy labels in bulk."
              : `${checkedEligibleCount} order${checkedEligibleCount === 1 ? "" : "s"} selected`}
          </span>
          <button
            type="button"
            onClick={handleBulkBuyLabels}
            disabled={checkedEligibleCount === 0 || bulkRunning}
            className="ml-auto h-9 rounded-md bg-foreground px-3 text-sm font-medium text-background disabled:opacity-50"
            data-testid="button-bulk-buy-labels"
          >
            {bulkRunning && bulkProgress
              ? `Buying labels… ${bulkProgress.done}/${bulkProgress.total}`
              : "Buy cheapest label for selected"}
          </button>
        </div>

        {bulkErrors.length > 0 ? (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
            data-testid="text-bulk-errors"
          >
            <p className="mb-1 font-medium">
              {bulkErrors.length} order{bulkErrors.length === 1 ? "" : "s"}{" "}
              couldn't be fulfilled:
            </p>
            <ul className="list-disc pl-5">
              {bulkErrors.map((e) => (
                <li key={e.orderId}>
                  #{e.orderId}: {e.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading orders…</p>
        ) : error ? (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
            data-testid="text-orders-error"
          >
            Couldn't load orders. {(error as Error).message}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all eligible paid orders"
                      checked={allEligibleChecked}
                      disabled={eligibleOrders.length === 0 || bulkRunning}
                      onChange={toggleAllEligible}
                      data-testid="checkbox-select-all-paid"
                    />
                  </th>
                  <th className="px-4 py-2">Order</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Items</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Placed</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((o) => {
                  const isEligible = eligibleIds.has(o.id);
                  return (
                    <tr
                      key={o.id}
                      className="cursor-pointer border-t border-border/60 hover:bg-foreground/5"
                      data-testid={`row-order-${o.id}`}
                      onClick={() => setSelectedId(o.id)}
                    >
                      <td
                        className="px-4 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Select order ${o.id}`}
                          checked={checkedIds.has(o.id)}
                          disabled={!isEligible || bulkRunning}
                          onChange={() => toggleChecked(o.id)}
                          data-testid={`checkbox-order-${o.id}`}
                        />
                      </td>
                      <td className="px-4 py-2 font-mono">#{o.id}</td>
                      <td className="px-4 py-2">{o.email ?? "—"}</td>
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
                  );
                })}
                {(data ?? []).length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                      data-testid="text-orders-empty"
                    >
                      No orders match those filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        {selectedOrder ? (
          <OrderDetailDrawer
            order={selectedOrder}
            listParams={params}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>
    </AdminLayout>
  );
}

function OrderDetailDrawer({
  order,
  listParams,
  onClose,
}: {
  order: Order;
  listParams: ListAdminOrdersParams;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [rates, setRates] = useState<ShippingRate[] | null>(null);
  const [shipmentId, setShipmentId] = useState<string | null>(null);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fulfilled, setFulfilled] = useState<Order | null>(null);

  const ratesMutation = useGetAdminOrderShippingRates();
  const fulfillMutation = useFulfillOrder();

  const view = fulfilled ?? order;
  const itemCount = view.items.reduce((s, i) => s + i.quantity, 0);
  const isShipped = Boolean(view.trackingCode || view.labelUrl);

  async function handleGetRates() {
    setErrorMsg(null);
    try {
      const result = await ratesMutation.mutateAsync({ id: order.id });
      setRates(result.rates);
      setShipmentId(result.shipmentId ?? null);
      if (result.rates.length > 0) {
        const cheapest = [...result.rates].sort(
          (a, b) => a.amountCents - b.amountCents,
        )[0];
        setSelectedRateId(cheapest.id);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to fetch shipping rates",
      );
    }
  }

  async function handleBuyLabel() {
    if (!selectedRateId) return;
    setErrorMsg(null);
    try {
      const updated = await fulfillMutation.mutateAsync({
        id: order.id,
        data: {
          shippingRateId: selectedRateId,
          ...(shipmentId ? { shipmentId } : {}),
        },
      });
      setFulfilled(updated);
      setRates(null);
      setShipmentId(null);
      setSelectedRateId(null);
      await queryClient.invalidateQueries({
        queryKey: getListAdminOrdersQueryKey(listParams),
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to buy shipping label",
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`order-drawer-title-${order.id}`}
      onClick={onClose}
      data-testid="order-detail-drawer"
    >
      <div
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h2
              id={`order-drawer-title-${order.id}`}
              className="text-lg font-semibold"
            >
              Order #{order.id}
            </h2>
            <p className="text-xs text-muted-foreground">
              {order.email ?? "—"} · placed {formatDateTime(order.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-2 py-1 text-xs"
            data-testid="button-close-drawer"
          >
            Close
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <section>
            <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
              Status
            </h3>
            <p className="capitalize" data-testid="text-order-status">
              {view.status}
              {view.trackingCode ? (
                <span className="ml-2 text-xs text-muted-foreground">
                  · tracking{" "}
                  <span className="font-mono" data-testid="text-tracking-code">
                    {view.trackingCode}
                  </span>
                </span>
              ) : null}
            </p>
            {view.labelUrl ? (
              <a
                href={view.labelUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm underline"
                data-testid="link-label-url"
              >
                Open shipping label
              </a>
            ) : null}
          </section>

          <section>
            <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
              Items ({itemCount})
            </h3>
            <ul className="space-y-2">
              {view.items.map((it) => (
                <li
                  key={it.id}
                  className="flex justify-between gap-4 rounded-md border border-border/60 px-3 py-2 text-sm"
                  data-testid={`row-item-${it.id}`}
                >
                  <div>
                    <div>{it.productName}</div>
                    <div className="text-xs text-muted-foreground">
                      Qty {it.quantity} ·{" "}
                      {formatCurrency(it.priceCents, view.currency)}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    {formatCurrency(
                      it.priceCents * it.quantity,
                      view.currency,
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {view.shippingAddress ? (
            <section>
              <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                Ship to
              </h3>
              <address className="not-italic text-sm leading-snug">
                {view.shippingAddress.name}
                <br />
                {view.shippingAddress.street1}
                {view.shippingAddress.street2 ? (
                  <>
                    <br />
                    {view.shippingAddress.street2}
                  </>
                ) : null}
                <br />
                {view.shippingAddress.city}, {view.shippingAddress.state}{" "}
                {view.shippingAddress.zip}
                <br />
                {view.shippingAddress.country}
              </address>
            </section>
          ) : (
            <section className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
              No shipping address on this order — can't fetch rates.
            </section>
          )}

          <section>
            <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
              Totals
            </h3>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{formatCurrency(view.subtotalCents, view.currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Shipping</dt>
                <dd>{formatCurrency(view.shippingCents, view.currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Tax</dt>
                <dd>{formatCurrency(view.taxCents, view.currency)}</dd>
              </div>
              {view.discountCents ? (
                <div className="flex justify-between text-muted-foreground">
                  <dt>Discount{view.discountCode ? ` (${view.discountCode})` : ""}</dt>
                  <dd>−{formatCurrency(view.discountCents, view.currency)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-border pt-1 font-medium">
                <dt>Total</dt>
                <dd>{formatCurrency(view.totalCents, view.currency)}</dd>
              </div>
            </dl>
          </section>

          {!isShipped && view.shippingAddress ? (
            <section className="space-y-3">
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
                Shipping label
              </h3>

              {rates === null ? (
                <button
                  type="button"
                  onClick={handleGetRates}
                  disabled={ratesMutation.isPending}
                  className="h-9 rounded-md bg-foreground px-3 text-sm font-medium text-background disabled:opacity-50"
                  data-testid="button-get-rates"
                >
                  {ratesMutation.isPending ? "Fetching rates…" : "Get rates"}
                </button>
              ) : rates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No shipping rates returned for this address.
                </p>
              ) : (
                <>
                  <ul
                    className="space-y-2"
                    data-testid="list-shipping-rates"
                  >
                    {rates.map((r) => (
                      <li key={r.id}>
                        <label
                          className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-foreground/5"
                          data-testid={`rate-option-${r.id}`}
                        >
                          <input
                            type="radio"
                            name="rate"
                            value={r.id}
                            checked={selectedRateId === r.id}
                            onChange={() => setSelectedRateId(r.id)}
                          />
                          <div className="flex-1">
                            <div className="font-medium">
                              {r.carrier} · {r.service}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {r.deliveryDays
                                ? `~${r.deliveryDays} day${r.deliveryDays === 1 ? "" : "s"}`
                                : "Delivery time varies"}
                            </div>
                          </div>
                          <div className="text-right font-medium">
                            {formatCurrency(
                              r.amountCents,
                              r.currency.toUpperCase(),
                            )}
                          </div>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleBuyLabel}
                      disabled={!selectedRateId || fulfillMutation.isPending}
                      className="h-9 rounded-md bg-foreground px-3 text-sm font-medium text-background disabled:opacity-50"
                      data-testid="button-buy-label"
                    >
                      {fulfillMutation.isPending
                        ? "Buying label…"
                        : "Buy label & notify customer"}
                    </button>
                    <button
                      type="button"
                      onClick={handleGetRates}
                      disabled={ratesMutation.isPending}
                      className="h-9 rounded-md border border-border px-3 text-sm disabled:opacity-50"
                      data-testid="button-refresh-rates"
                    >
                      Refresh rates
                    </button>
                  </div>
                </>
              )}

              {errorMsg ? (
                <p
                  className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
                  data-testid="text-fulfill-error"
                >
                  {errorMsg}
                </p>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function openLabelPrintSheet(
  labels: { orderId: number; labelUrl: string }[],
) {
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
  if (!win) return;
  const escape = (s: string) =>
    s.replace(/[&<>"']/g, (c) =>
      c === "&"
        ? "&amp;"
        : c === "<"
          ? "&lt;"
          : c === ">"
            ? "&gt;"
            : c === '"'
              ? "&quot;"
              : "&#39;",
    );
  const isPdf = (url: string) => /\.pdf(\?|$)/i.test(url);
  const pages = labels
    .map((l) => {
      const url = escape(l.labelUrl);
      const inner = isPdf(l.labelUrl)
        ? `<iframe src="${url}" title="Label for order ${l.orderId}"></iframe>`
        : `<img src="${url}" alt="Label for order ${l.orderId}" />`;
      return `<section class="label-page">
        <header>Order #${l.orderId}</header>
        ${inner}
      </section>`;
    })
    .join("\n");
  const pendingImgs = labels.filter((l) => !isPdf(l.labelUrl)).length;
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Shipping labels (${labels.length})</title>
  <style>
    @page { size: 4in 6in; margin: 0; }
    html, body { margin: 0; padding: 0; background: #f5f5f5; font-family: system-ui, sans-serif; }
    .label-page {
      page-break-after: always;
      width: 4in;
      height: 6in;
      margin: 12px auto;
      background: white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      display: flex;
      flex-direction: column;
      align-items: stretch;
      overflow: hidden;
    }
    .label-page:last-child { page-break-after: auto; }
    .label-page header {
      font-size: 10px;
      padding: 4px 8px;
      color: #555;
      border-bottom: 1px solid #eee;
    }
    .label-page img, .label-page iframe {
      flex: 1;
      width: 100%;
      object-fit: contain;
      border: 0;
    }
    @media print {
      body { background: white; }
      .label-page { margin: 0; box-shadow: none; }
      .label-page header { display: none; }
    }
  </style>
</head>
<body>
  ${pages}
  <script>
    (function () {
      var imgs = document.images;
      var remaining = ${pendingImgs};
      function maybePrint() {
        if (remaining <= 0) {
          setTimeout(function () { window.focus(); window.print(); }, 200);
        }
      }
      if (remaining === 0) { maybePrint(); }
      for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        if (img.complete) { remaining--; }
        else {
          img.addEventListener('load', function () { remaining--; maybePrint(); });
          img.addEventListener('error', function () { remaining--; maybePrint(); });
        }
      }
      maybePrint();
    })();
  </script>
</body>
</html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
