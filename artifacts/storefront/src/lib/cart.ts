const CART_ID_KEY = "dose:cartId";

export function getStoredCartId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CART_ID_KEY);
  } catch {
    return null;
  }
}

export function setStoredCartId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CART_ID_KEY, id);
  } catch {
    /* ignore quota / privacy errors */
  }
}

export function formatPrice(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

export function resolveProductImage(
  images: string[] | undefined,
  baseUrl: string,
): string | null {
  const first = images?.[0];
  if (!first) return null;
  if (/^https?:\/\//i.test(first)) return first;
  // Image paths from the API are root-relative (e.g. `/api/storage/...`).
  // Storefront is hosted under a base path, but `/api/...` is shared via the
  // platform's path-based routing, so we use the raw path.
  if (first.startsWith("/")) return first;
  // Fallback: relative path resolved under the artifact's base URL.
  return `${baseUrl}${first}`;
}
