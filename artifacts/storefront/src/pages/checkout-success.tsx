import { useEffect } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { PromoBanner } from "@/components/dose/PromoBanner";
import { Header } from "@/components/dose/Header";
import { Footer } from "@/components/dose/Footer";
import { CookieBanner } from "@/components/dose/CookieBanner";
import { AgeGate } from "@/components/dose/AgeGate";
import { Button } from "@/components/ui/button";
import { clearCartId } from "@/lib/cart-id";

const CREAM = "hsl(45 49% 90%)";
const FOREST = "hsl(170 58% 14%)";
const GOLD = "hsl(42 53% 54%)";

export default function CheckoutSuccessPage() {
  const qc = useQueryClient();
  const orderId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("orderId")
      : null;

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
  }, [qc]);

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: CREAM, color: FOREST }}
      data-testid="checkout-success-page"
    >
      <PromoBanner />
      <Header />
      <main id="main">
        <section className="mx-auto max-w-2xl px-6 py-20 text-center md:px-10 md:py-28">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: GOLD }}
          >
            Order confirmed
          </p>
          <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">
            Thank you.
          </h1>
          <p className="mt-4 text-base">
            Your order is in. We'll send a confirmation email with tracking
            details as soon as it ships.
          </p>
          {orderId && (
            <p
              className="mt-6 text-[11px] uppercase tracking-[0.22em]"
              style={{ color: "hsla(170,58%,14%,0.6)" }}
              data-testid="success-order-id"
            >
              Order #{orderId}
            </p>
          )}
          <div className="mt-10 flex justify-center">
            <Link href="/shop">
              <Button
                className="rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
                style={{ background: FOREST, color: CREAM }}
                data-testid="link-keep-shopping"
              >
                Keep shopping
              </Button>
            </Link>
          </div>
        </section>
      </main>
      <Footer />
      <CookieBanner />
      <AgeGate />
    </div>
  );
}
