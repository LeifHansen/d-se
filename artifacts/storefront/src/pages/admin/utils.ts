export function formatCurrency(
  cents: number,
  currency: string = "USD",
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format((cents ?? 0) / 100);
}

export function formatDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatOrderLinkChannel(
  channel: "token" | "lookup" | "signed_in" | null | undefined,
): string {
  switch (channel) {
    case "token":
      return "Email link";
    case "lookup":
      return "Email + order ID lookup";
    case "signed_in":
      return "Signed-in account";
    default:
      return "—";
  }
}

export function formatDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
