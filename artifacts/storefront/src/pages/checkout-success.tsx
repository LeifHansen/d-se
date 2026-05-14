import { useEffect } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { PromoBanner } from "@/components/dose/PromoBanner";
import { Header } from "@/components/dose/Header";
import { Footer } from "@/components/dose/Footer";
import { CookieBanner } from "@/components/dose/CookieBanner";
import { AgeGate } from "@/components/dose/AgeGate";
import { Button } from "@/components/ui/button";

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
    // Cart was cleared server-side; refresh any cached cart query.
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
          <Link href="/shop">
            <Button
              className="mt-8 rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{ background: FOREST, color: CREAM }}
              data-testid="button-keep-shopping"
            >
              Keep shopping
            </Button>
          </Link>
        </section>
      </main>
      <Footer />
      <CookieBanner />
      <AgeGate />
    </div>
  );
}
