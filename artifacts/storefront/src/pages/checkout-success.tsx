import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetOrder } from "@workspace/api-client-react";
import { PromoBanner } from "@/components/dose/PromoBanner";
import { Header } from "@/components/dose/Header";
import { Footer } from "@/components/dose/Footer";
import { CookieBanner } from "@/components/dose/CookieBanner";
import { AgeGate } from "@/components/dose/AgeGate";
import { Button } from "@/components/ui/button";
import { clearCartId, getCartId } from "@/lib/cart-id";
import { formatMoney } from "@/lib/cart";

const CREAM = "hsl(45 49% 90%)";
const FOREST = "hsl(170 58% 14%)";
const GOLD = "hsl(42 53% 54%)";
const MUTED = "hsla(170,58%,14%,0.65)";

const SHIP_WINDOW_DAYS_MIN = 3;
const SHIP_WINDOW_DAYS_MAX = 7;

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function estimatedDeliveryWindow(placedAt: Date): string {
  const start = new Date(placedAt);
  start.setDate(start.getDate() + SHIP_WINDOW_DAYS_MIN);
  const end = new Date(placedAt);
  end.setDate(end.getDate() + SHIP_WINDOW_DAYS_MAX);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export default function CheckoutSuccessPage() {
  const qc = useQueryClient();

  // Read URL + cart-id ONCE on first render, before we wipe local cart state.
  // The cartId acts as the guest receipt token so non-signed-in shoppers can
  // load the order they just placed.
  const initial = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        orderId: null as number | null,
        sessionId: null as string | null,
        cartId: null as string | null,
      };
    }
    const search = new URLSearchParams(window.location.search);
    const orderIdParam = search.get("orderId");
    const parsed = orderIdParam ? Number(orderIdParam) : NaN;
    return {
      orderId: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
      sessionId: search.get("session_id"),
      cartId: getCartId(),
    };
  }, []);

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

  const validId = initial.orderId !== null;
  const queryParams = useMemo(
    () => ({
      ...(initial.cartId ? { cartId: initial.cartId } : {}),
      ...(initial.sessionId ? { sessionId: initial.sessionId } : {}),
    }),
    [initial.cartId, initial.sessionId],
  );

  // Poll briefly while the Stripe webhook is still in flight: the order is
  // created as "pending" and flips to "paid" once the webhook lands.
  const [pollMs, setPollMs] = useState<number>(2000);
  const { data: order, isLoading, isError, error } = useGetOrder(
    initial.orderId ?? 0,
    queryParams,
    {
      query: {
        enabled: validId,
        retry: false,
        refetchInterval: pollMs,
        refetchOnWindowFocus: false,
      } as never,
    },
  );

  useEffect(() => {
    if (!order) return;
    if (order.status === "pending") {
      setPollMs(2500);
    } else {
      setPollMs(0);
    }
  }, [order]);

  const processing = !!order && order.status === "pending";
  const notFound =
    isError && /404|not found/i.test(error instanceof Error ? error.message : "");

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: CREAM, color: FOREST }}
      data-testid="checkout-success-page"
    >
      <PromoBanner />
      <Header />
      <main id="main">
        <section className="mx-auto max-w-3xl px-6 py-16 md:px-10 md:py-20">
          <div className="text-center">
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
            {validId && (
              <p
                className="mt-6 text-[11px] uppercase tracking-[0.22em]"
                style={{ color: MUTED }}
                data-testid="success-order-id"
              >
                Order #{initial.orderId}
              </p>
            )}
          </div>

          {!validId ? null : isLoading ? (
            <p
              className="mt-10 text-center text-sm"
              style={{ color: MUTED }}
              data-testid="success-order-loading"
            >
              Loading your order…
            </p>
          ) : notFound ? (
            <p
              className="mt-10 text-center text-sm"
              style={{ color: MUTED }}
              data-testid="success-order-unavailable"
            >
              We couldn't load this order's details here. Check your email for
              a full receipt.
            </p>
          ) : isError ? (
            <p
              role="alert"
              className="mt-10 text-center text-sm"
              style={{ color: "hsl(0 70% 35%)" }}
              data-testid="success-order-error"
            >
              {error instanceof Error ? error.message : "Couldn't load order."}
            </p>
          ) : order ? (
            <div className="mt-10 space-y-6">
              {processing && (
                <div
                  className="rounded-2xl border p-4 text-center text-sm"
                  style={{
                    borderColor: "hsl(40 18% 80%)",
                    background: "hsl(45 50% 93%)",
                    color: MUTED,
                  }}
                  data-testid="success-order-processing"
                >
                  Payment is processing. We'll have your full receipt ready in
                  just a moment…
                </div>
              )}

              <div
                className="rounded-2xl border bg-card p-6 md:p-7"
                style={{ borderColor: "hsl(40 18% 80%)" }}
                data-testid="success-order-summary"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-2xl">Your order</h2>
                  <p
                    className="text-[11px] uppercase tracking-[0.22em]"
                    style={{ color: MUTED }}
                    data-testid="success-order-status"
                  >
                    Status: {order.status}
                  </p>
                </div>

                <ul
                  className="mt-5 divide-y"
                  style={{ borderColor: "hsl(40 18% 86%)" }}
                  data-testid="success-order-items"
                >
                  {order.items.map((it) => (
                    <li
                      key={it.id}
                      className="flex items-center gap-4 py-3 text-sm"
                    >
                      {it.productImage ? (
                        <img
                          src={it.productImage}
                          alt=""
                          className="h-14 w-14 rounded-md object-cover"
                          style={{ background: "hsl(45 50% 93%)" }}
                        />
                      ) : (
                        <div
                          className="h-14 w-14 rounded-md"
                          style={{ background: "hsl(45 50% 93%)" }}
                          aria-hidden
                        />
                      )}
                      <div className="flex-1">
                        <p className="font-medium">{it.productName}</p>
                        <p
                          className="text-xs"
                          style={{ color: MUTED }}
                        >
                          Qty {it.quantity}
                        </p>
                      </div>
                      <span>
                        {formatMoney(
                          it.priceCents * it.quantity,
                          order.currency,
                        )}
                      </span>
                    </li>
                  ))}
                </ul>

                <dl
                  className="mt-5 space-y-1 text-sm"
                  style={{ color: MUTED }}
                >
                  <div className="flex justify-between">
                    <dt>Subtotal</dt>
                    <dd>{formatMoney(order.subtotalCents, order.currency)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Shipping</dt>
                    <dd>{formatMoney(order.shippingCents, order.currency)}</dd>
                  </div>
                  {order.taxCents > 0 ? (
                    <div className="flex justify-between">
                      <dt>Tax</dt>
                      <dd>{formatMoney(order.taxCents, order.currency)}</dd>
                    </div>
                  ) : null}
                  {order.discountCents && order.discountCents > 0 ? (
                    <div
                      className="flex justify-between"
                      data-testid="success-order-discount"
                    >
                      <dt>
                        Discount
                        {order.discountCode ? ` (${order.discountCode})` : ""}
                      </dt>
                      <dd>
                        −{formatMoney(order.discountCents, order.currency)}
                      </dd>
                    </div>
                  ) : null}
                  <div
                    className="flex justify-between pt-2 font-display text-base"
                    style={{ color: FOREST }}
                  >
                    <dt>Total paid</dt>
                    <dd data-testid="success-order-total">
                      {formatMoney(order.totalCents, order.currency)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div
                  className="rounded-2xl border bg-card p-6"
                  style={{ borderColor: "hsl(40 18% 80%)" }}
                >
                  <h3 className="font-display text-lg">Shipping to</h3>
                  {order.shippingAddress ? (
                    <address
                      className="mt-3 not-italic text-sm leading-relaxed"
                      style={{ color: MUTED }}
                      data-testid="success-order-address"
                    >
                      {order.shippingAddress.name}
                      <br />
                      {order.shippingAddress.street1}
                      {order.shippingAddress.street2 ? (
                        <>
                          <br />
                          {order.shippingAddress.street2}
                        </>
                      ) : null}
                      <br />
                      {order.shippingAddress.city},{" "}
                      {order.shippingAddress.state}{" "}
                      {order.shippingAddress.zip}
                      <br />
                      {order.shippingAddress.country}
                    </address>
                  ) : (
                    <p
                      className="mt-3 text-sm"
                      style={{ color: MUTED }}
                      data-testid="success-order-address-pending"
                    >
                      We'll show your shipping address here as soon as Stripe
                      confirms payment.
                    </p>
                  )}
                  {order.email ? (
                    <p
                      className="mt-4 text-sm"
                      style={{ color: MUTED }}
                      data-testid="success-order-email"
                    >
                      Receipt sent to{" "}
                      <span style={{ color: FOREST }}>{order.email}</span>
                    </p>
                  ) : null}
                </div>

                <div
                  className="rounded-2xl border bg-card p-6"
                  style={{ borderColor: "hsl(40 18% 80%)" }}
                >
                  <h3 className="font-display text-lg">Estimated delivery</h3>
                  <p
                    className="mt-3 text-sm"
                    style={{ color: MUTED }}
                    data-testid="success-order-delivery"
                  >
                    {estimatedDeliveryWindow(new Date(order.createdAt))}
                  </p>
                  <p
                    className="mt-2 text-xs"
                    style={{ color: MUTED }}
                  >
                    Most orders ship within 1–2 business days. You'll get a
                    tracking link by email.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-12 flex justify-center">
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
