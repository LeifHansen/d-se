type StatusStyle = {
  label: string;
  background: string;
  color: string;
};

const STATUS_STYLES: Record<string, StatusStyle> = {
  pending: {
    label: "Preparing",
    background: "hsl(40 50% 88%)",
    color: "hsl(35 60% 28%)",
  },
  paid: {
    label: "Preparing",
    background: "hsl(40 50% 88%)",
    color: "hsl(35 60% 28%)",
  },
  fulfilled: {
    label: "Preparing",
    background: "hsl(40 50% 88%)",
    color: "hsl(35 60% 28%)",
  },
  shipped: {
    label: "On its way",
    background: "hsl(200 55% 88%)",
    color: "hsl(205 60% 26%)",
  },
  delivered: {
    label: "Delivered",
    background: "hsl(140 40% 86%)",
    color: "hsl(150 55% 22%)",
  },
  cancelled: {
    label: "Cancelled",
    background: "hsl(40 30% 88%)",
    color: "hsl(0 50% 32%)",
  },
  canceled: {
    label: "Cancelled",
    background: "hsl(40 30% 88%)",
    color: "hsl(0 50% 32%)",
  },
  refunded: {
    label: "Refunded",
    background: "hsl(40 30% 88%)",
    color: "hsl(170 18% 28%)",
  },
};

function styleFor(status: string): StatusStyle {
  const key = status?.toLowerCase?.() ?? "";
  if (key in STATUS_STYLES) return STATUS_STYLES[key];
  return {
    label: status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown",
    background: "hsl(40 30% 88%)",
    color: "hsl(170 18% 28%)",
  };
}

export interface OrderStatusBadgeProps {
  status: string;
  testId?: string;
  className?: string;
}

export function OrderStatusBadge({
  status,
  testId,
  className,
}: OrderStatusBadgeProps) {
  const s = styleFor(status);
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] " +
        (className ?? "")
      }
      style={{ background: s.background, color: s.color }}
      data-testid={testId ?? "order-status-badge"}
      data-status={status}
      aria-label={`Order status: ${s.label}`}
    >
      {s.label}
    </span>
  );
}
