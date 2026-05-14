import { useEffect, useState } from "react";

const CART_KEY = "dose-cart-id";
const CART_EVENT = "dose:cart-id-changed";

export function getStoredCartId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CART_KEY);
  } catch {
    return null;
  }
}

export function setStoredCartId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) {
      window.localStorage.setItem(CART_KEY, id);
    } else {
      window.localStorage.removeItem(CART_KEY);
    }
    window.dispatchEvent(new CustomEvent(CART_EVENT));
  } catch {
    // ignore — storage may be unavailable
  }
}

export function useStoredCartId(): string | null {
  const [id, setId] = useState<string | null>(() => getStoredCartId());
  useEffect(() => {
    const handler = () => setId(getStoredCartId());
    window.addEventListener(CART_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(CART_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return id;
}

export function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format((cents ?? 0) / 100);
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
