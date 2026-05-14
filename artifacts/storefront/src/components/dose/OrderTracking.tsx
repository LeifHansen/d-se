import type { Order } from "@workspace/api-client-react";

type OrderTrackingFields = Pick<
  Order,
  "trackingCode" | "trackingUrl" | "carrier" | "labelUrl"
>;

export function OrderTracking({
  order,
  variant = "card",
  showLabelUrl = true,
}: {
  order: OrderTrackingFields;
  variant?: "card" | "inline";
  showLabelUrl?: boolean;
}) {
  if (variant === "inline") {
    if (!order.trackingCode) return null;
    return (
      <div className="mt-6 text-sm" data-testid="order-tracking">
        <p>
          {order.carrier ? `${order.carrier}: ` : "Tracking: "}
          <code className="break-all">{order.trackingCode}</code>
        </p>
        {order.trackingUrl ? (
          <a
            href={order.trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block underline"
            data-testid="order-tracking-link"
          >
            Track your package →
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border bg-card p-6"
      style={{ borderColor: "hsl(40 18% 80%)" }}
    >
      <h2 className="font-display text-xl">Tracking</h2>
      {order.trackingCode ? (
        <div className="mt-3 text-sm" data-testid="order-tracking">
          <p>
            {order.carrier ? `${order.carrier}: ` : "Tracking number: "}
            <code className="break-all">{order.trackingCode}</code>
          </p>
          {order.trackingUrl ? (
            <a
              href={order.trackingUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block underline"
              data-testid="order-tracking-link"
            >
              Track your package →
            </a>
          ) : null}
        </div>
      ) : (
        <p
          className="mt-3 text-sm"
          style={{ color: "hsl(170 18% 32%)" }}
          data-testid="order-tracking-pending"
        >
          Tracking will appear here once your order ships.
        </p>
      )}
      {showLabelUrl && order.labelUrl ? (
        <a
          href={order.labelUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-sm underline"
          data-testid="order-label-link"
        >
          View shipping label
        </a>
      ) : null}
    </div>
  );
}
