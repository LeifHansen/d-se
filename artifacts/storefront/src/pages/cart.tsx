import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { PromoBanner } from "@/components/dose/PromoBanner";
import { Header } from "@/components/dose/Header";
import { Footer } from "@/components/dose/Footer";
import { CookieBanner } from "@/components/dose/CookieBanner";
import { AgeGate } from "@/components/dose/AgeGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCart,
  useApplyDiscount,
  useRemoveCartItem,
  useRemoveDiscount,
  useUpdateCartItem,
  useValidateDiscount,
  resumeCartFromToken,
} from "@/hooks/useCart";
import { setCartId } from "@/lib/cart-id";
import { formatMoney, ApiError } from "@/lib/api";

function useResumeFromQuery() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "loading" }
    | { state: "ok" }
    | { state: "error"; message: string }
  >({ state: "idle" });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const cartId = sp.get("cartId");
    const token = sp.get("token") ?? sp.get("resume");
    if (!cartId || !token) return;
    setStatus({ state: "loading" });
    resumeCartFromToken(cartId, token, qc)
      .then(() => {
        // Only adopt the resumed cart id once the backend confirmed the token.
        setCartId(cartId);
        setStatus({ state: "ok" });
        // Clean the URL so reloading doesn't re-trigger the resume.
        const url = new URL(window.location.href);
        url.searchParams.delete("cartId");
        url.searchParams.delete("token");
        url.searchParams.delete("resume");
        window.history.replaceState({}, "", url.toString());
      })
      .catch((err) => {
        const message =
          err instanceof ApiError
            ? err.message
            : "We couldn't restore your cart from that link.";
        setStatus({ state: "error", message });
      });
  }, [qc]);

  return status;
}

export default function CartPage() {
  const resume = useResumeFromQuery();
  const cartQuery = useCart();
  const cart = cartQuery.data;
  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();
  const validate = useValidateDiscount();
  const apply = useApplyDiscount();
  const removeDiscount = useRemoveDiscount();
  const [code, setCode] = useState("");
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [discountPreview, setDiscountPreview] = useState<{
    code: string;
    discountCents: number;
  } | null>(null);

  async function onApplyCode(e: React.FormEvent) {
    e.preventDefault();
    setDiscountError(null);
    setDiscountPreview(null);
    if (!cart) return;
    const trimmed = code.trim();
    if (!trimmed) return;
    try {
      // Validate first per the documented checkout flow.
      const v = await validate.mutateAsync({ code: trimmed, cartId: cart.id });
      if (!v.valid) {
        setDiscountError(v.reason ?? "That code can't be used right now.");
        return;
      }
      setDiscountPreview({
        code: v.code ?? trimmed,
        discountCents: v.discountCents ?? 0,
      });
      // Persist on the cart so the discount survives checkout.
      await apply.mutateAsync({ code: trimmed });
      setCode("");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Couldn't apply that code.";
      setDiscountError(message);
    }
  }

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "hsl(45 49% 90%)", color: "hsl(170 58% 14%)" }}
      data-testid="cart-page"
    >
      <PromoBanner />
      <Header />
      <main id="main">
        <section className="mx-auto max-w-5xl px-6 py-16 md:px-10 md:py-20">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "hsl(42 53% 54%)" }}
          >
            Your bag
          </p>
          <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">
            Cart
          </h1>

          {resume.state === "loading" && (
            <p className="mt-6 text-sm" data-testid="resume-status-loading">
              Restoring your cart…
            </p>
          )}
          {resume.state === "ok" && (
            <p
              className="mt-6 rounded-md px-4 py-3 text-sm"
              style={{
                background: "hsla(170, 58%, 14%, 0.06)",
              }}
              data-testid="resume-status-ok"
            >
              Welcome back — we picked up where you left off.
            </p>
          )}
          {resume.state === "error" && (
            <p
              className="mt-6 rounded-md px-4 py-3 text-sm"
              style={{
                background: "hsl(0 60% 95%)",
                color: "hsl(0 60% 35%)",
              }}
              data-testid="resume-status-error"
            >
              {resume.message}
            </p>
          )}

          {cartQuery.isLoading && (
            <p className="mt-10 text-sm" data-testid="cart-loading">
              Loading your bag…
            </p>
          )}

          {cart && cart.items.length === 0 && (
            <div className="mt-10" data-testid="cart-empty">
              <p className="text-base">Your bag is empty.</p>
              <Link href="/shop">
                <Button
                  className="mt-6 rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
                  style={{
                    background: "hsl(170 58% 14%)",
                    color: "hsl(45 49% 90%)",
                  }}
                  data-testid="link-shop"
                >
                  Shop the drop
                </Button>
              </Link>
            </div>
          )}

          {cart && cart.items.length > 0 && (
            <div className="mt-10 grid gap-10 md:grid-cols-[2fr_1fr]">
              <ul
                className="divide-y rounded-2xl border bg-white/60"
                style={{ borderColor: "hsla(170,58%,14%,0.10)" }}
                data-testid="cart-items"
              >
                {cart.items.map((it) => (
                  <li
                    key={it.id}
                    className="flex gap-4 p-4 md:p-6"
                    data-testid={`cart-item-${it.id}`}
                  >
                    {it.product.images[0] ? (
                      <img
                        src={it.product.images[0]}
                        alt={it.product.name}
                        className="h-20 w-20 flex-shrink-0 rounded-lg object-cover md:h-24 md:w-24"
                      />
                    ) : (
                      <div className="h-20 w-20 flex-shrink-0 rounded-lg bg-black/5 md:h-24 md:w-24" />
                    )}
                    <div className="flex flex-1 flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link
                            href={`/products/${it.product.slug}`}
                            className="font-display text-lg hover:underline"
                          >
                            {it.product.name}
                          </Link>
                          <p
                            className="text-xs uppercase tracking-[0.18em]"
                            style={{ color: "hsla(170,58%,14%,0.6)" }}
                          >
                            {formatMoney(it.product.priceCents, cart.currency)} each
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label="Remove item"
                          className="rounded-full p-1 hover:bg-black/5"
                          onClick={() =>
                            remove.mutate({ itemId: it.id })
                          }
                          data-testid={`button-remove-${it.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div
                          className="inline-flex items-center rounded-full border"
                          style={{ borderColor: "hsla(170,58%,14%,0.18)" }}
                        >
                          <button
                            type="button"
                            className="px-3 py-2"
                            aria-label="Decrease quantity"
                            onClick={() =>
                              update.mutate({
                                itemId: it.id,
                                quantity: Math.max(0, it.quantity - 1),
                              })
                            }
                            data-testid={`button-decrease-${it.id}`}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span
                            className="min-w-[2ch] text-center text-sm"
                            data-testid={`quantity-${it.id}`}
                          >
                            {it.quantity}
                          </span>
                          <button
                            type="button"
                            className="px-3 py-2"
                            aria-label="Increase quantity"
                            onClick={() =>
                              update.mutate({
                                itemId: it.id,
                                quantity: it.quantity + 1,
                              })
                            }
                            data-testid={`button-increase-${it.id}`}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <p className="font-display text-lg">
                          {formatMoney(it.lineTotalCents, cart.currency)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <aside
                className="h-fit rounded-2xl border bg-white/80 p-6"
                style={{ borderColor: "hsla(170,58%,14%,0.10)" }}
                data-testid="cart-summary"
              >
                <h2 className="font-display text-2xl">Summary</h2>

                <form
                  onSubmit={onApplyCode}
                  className="mt-5"
                  data-testid="discount-form"
                >
                  <label
                    htmlFor="promo-code"
                    className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                  >
                    Promo code
                  </label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      id="promo-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="ENTER CODE"
                      className="rounded-full bg-white"
                      data-testid="input-discount-code"
                      autoComplete="off"
                    />
                    <Button
                      type="submit"
                      disabled={
                        validate.isPending || apply.isPending || !code.trim()
                      }
                      className="rounded-full px-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
                      style={{
                        background: "hsl(170 58% 14%)",
                        color: "hsl(45 49% 90%)",
                      }}
                      data-testid="button-apply-discount"
                    >
                      {validate.isPending || apply.isPending ? "…" : "Apply"}
                    </Button>
                  </div>
                  {discountError && (
                    <p
                      className="mt-2 text-xs"
                      style={{ color: "hsl(0 60% 35%)" }}
                      data-testid="discount-error"
                    >
                      {discountError}
                    </p>
                  )}
                  {discountPreview && (
                    <p
                      className="mt-2 text-xs"
                      data-testid="discount-preview"
                    >
                      Code <strong>{discountPreview.code}</strong> applied — you
                      save{" "}
                      {formatMoney(discountPreview.discountCents, cart.currency)}.
                    </p>
                  )}
                </form>

                <dl className="mt-6 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt>Subtotal</dt>
                    <dd data-testid="summary-subtotal">
                      {formatMoney(cart.subtotalCents, cart.currency)}
                    </dd>
                  </div>
                  {cart.discountCode && cart.discountCents > 0 && (
                    <div
                      className="flex items-center justify-between"
                      data-testid="summary-discount-row"
                    >
                      <dt className="flex items-center gap-2">
                        <span>Discount</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
                          style={{
                            background: "hsl(170 58% 14%)",
                            color: "hsl(45 49% 90%)",
                          }}
                          data-testid="summary-discount-code"
                        >
                          {cart.discountCode}
                        </span>
                        <button
                          type="button"
                          aria-label="Remove discount"
                          onClick={() => removeDiscount.mutate()}
                          className="rounded-full p-1 hover:bg-black/5"
                          data-testid="button-remove-discount"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </dt>
                      <dd data-testid="summary-discount-amount">
                        −{formatMoney(cart.discountCents, cart.currency)}
                      </dd>
                    </div>
                  )}
                  <div
                    className="flex justify-between border-t pt-3 font-display text-lg"
                    style={{ borderColor: "hsla(170,58%,14%,0.10)" }}
                  >
                    <dt>Total</dt>
                    <dd data-testid="summary-total">
                      {formatMoney(cart.totalCents, cart.currency)}
                    </dd>
                  </div>
                </dl>

                <Button
                  className="mt-6 w-full rounded-full py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
                  style={{
                    background: "hsl(42 53% 54%)",
                    color: "hsl(170 58% 14%)",
                  }}
                  data-testid="button-checkout"
                >
                  Proceed to checkout
                </Button>
                <p
                  className="mt-3 text-center text-[11px]"
                  style={{ color: "hsla(170,58%,14%,0.6)" }}
                >
                  Shipping &amp; taxes calculated at checkout.
                </p>
              </aside>
            </div>
          )}
        </section>
      </main>
      <Footer />
      <CookieBanner />
      <AgeGate />
    </div>
  );
}
