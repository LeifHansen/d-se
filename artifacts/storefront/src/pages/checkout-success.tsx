import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clearCartId } from "@/lib/cart-id";

export default function CheckoutSuccessPage() {
  const qc = useQueryClient();

  useEffect(() => {
    // Stripe redirected back after a successful payment. The webhook clears
    // server-side cart state and marks the abandoned-cart record recovered;
    // here we just drop the local cart id so the next visit starts fresh,
    // and invalidate any cached cart query.
    clearCartId();
    qc.removeQueries({ queryKey: ["cart"] });
    qc.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey?.[0];
        return typeof k === "string" && k.includes("/cart");
      },
    });

    // Redirect to the order detail page so guests land on a real summary.
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const orderId =
      url.searchParams.get("orderId") ??
      (() => {
        try {
          return window.localStorage.getItem("dose-last-order-id");
        } catch {
          return null;
        }
      })();
    let email = "";
    try {
      email = window.localStorage.getItem("dose-last-order-email") ?? "";
    } catch {
      email = "";
    }
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    if (orderId) {
      const target = email
        ? `${base}/orders/${orderId}?email=${encodeURIComponent(email)}`
        : `${base}/orders/${orderId}`;
      window.location.replace(target);
    } else {
      window.location.replace(`${base}/account`);
    }
  }, [qc]);

  return (
    <div
      className="min-h-screen w-full bg-background text-foreground"
      data-testid="checkout-success-page"
    >
      <p className="p-6 text-sm opacity-60">Loading your order…</p>
    </div>
  );
}
