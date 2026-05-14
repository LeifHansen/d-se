import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Trash2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCart,
  useUpdateCartItem,
  useRemoveCartItem,
  useApplyCartDiscount,
  useRemoveCartDiscount,
  useValidateDiscount,
  getGetCartQueryKey,
} from "@workspace/api-client-react";
import { SiteShell } from "@/components/dose/SiteShell";
import { Seo } from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStoredCartId, formatMoney, setStoredCartId } from "@/lib/cart";
import { resumeCartFromToken } from "@/hooks/useCart";
import { ApiError } from "@/lib/api";

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
        setStoredCartId(cartId);
        setStatus({ state: "ok" });
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
  const cartId = useStoredCartId();
  const qc = useQueryClient();
  const { data, isLoading } = useGetCart(
    { cartId: cartId ?? undefined },
    { query: { enabled: !!cartId } as never },
  );
  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();
  const validate = useValidateDiscount();
  const applyDiscount = useApplyCartDiscount();
  const removeDiscount = useRemoveCartDiscount();
  const [code, setCode] = useState("");
  const [discountErr, setDiscountErr] = useState<string | null>(null);

  const refetch = () =>
    qc.invalidateQueries({
      queryKey: getGetCartQueryKey({ cartId: cartId ?? undefined }),
    });

  const empty = !cartId || !data || data.items.length === 0;

  return (
    <SiteShell testId="page-cart">
      <Seo title="Your cart" noindex />
      <section
        style={{ background: "hsl(170 58% 14%)", color: "hsl(45 49% 90%)" }}
      >
        <div className="mx-auto max-w-5xl px-6 py-16 md:px-10 md:py-20">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "hsl(42 53% 64%)" }}
          >
            Your bag
          </p>
          <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">
            The drop is{" "}
            <span
              className="font-display-italic"
              style={{ color: "hsl(95 30% 78%)" }}
            >
              ready.
            </span>
          </h1>

          {resume.state === "loading" && (
            <p className="mt-6 text-sm" data-testid="resume-status-loading">
              Restoring your cart…
            </p>
          )}
          {resume.state === "ok" && (
            <p
              className="mt-6 inline-block rounded-md px-4 py-2 text-sm"
              style={{ background: "hsla(45,49%,90%,0.1)" }}
              data-testid="resume-status-ok"
            >
              Welcome back — we picked up where you left off.
            </p>
          )}
          {resume.state === "error" && (
            <p
              className="mt-6 inline-block rounded-md px-4 py-2 text-sm"
              style={{ background: "hsl(0 60% 95%)", color: "hsl(0 60% 35%)" }}
              data-testid="resume-status-error"
            >
              {resume.message}
            </p>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12 md:px-10 md:py-16">
        {isLoading ? (
          <p data-testid="cart-loading" className="opacity-70">
            Loading your cart…
          </p>
        ) : empty ? (
          <div className="text-center" data-testid="cart-empty">
            <p
              className="font-display text-3xl"
              style={{ color: "hsl(170 58% 14%)" }}
            >
              Your bag is empty.
            </p>
            <p
              className="mt-2 text-sm"
              style={{ color: "hsl(170 18% 32%)" }}
            >
              Find your ritual in the shop.
            </p>
            <Button
              asChild
              className="mt-6 rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{
                background: "hsl(170 58% 14%)",
                color: "hsl(45 49% 90%)",
              }}
            >
              <Link href="/shop">Browse the shop</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-12 md:grid-cols-3">
            <ul
              className="md:col-span-2 divide-y"
              style={{ borderColor: "hsl(40 18% 80%)" }}
              data-testid="cart-items"
            >
              {data!.items.map((it) => (
                <li
                  key={it.id}
                  className="flex gap-5 py-6"
                  data-testid={`cart-item-${it.id}`}
                >
                  <div
                    className="aspect-square w-24 overflow-hidden rounded-xl"
                    style={{ background: "hsl(40 30% 88%)" }}
                  >
                    {it.product.images[0] ? (
                      <img
                        src={it.product.images[0]}
                        alt={it.product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`/products/${it.product.slug}`}
                          className="font-display text-xl hover:underline"
                        >
                          {it.product.name}
                        </Link>
                        <p
                          className="mt-1 text-sm"
                          style={{ color: "hsl(170 18% 32%)" }}
                        >
                          {formatMoney(it.product.priceCents, it.product.currency)}{" "}
                          each
                        </p>
                      </div>
                      <p className="font-display text-lg">
                        {formatMoney(it.lineTotalCents, it.product.currency)}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div
                        className="inline-flex items-center overflow-hidden rounded-full border"
                        style={{ borderColor: "hsl(40 18% 80%)" }}
                      >
                        <button
                          type="button"
                          aria-label="Decrease"
                          onClick={async () => {
                            await update.mutateAsync({
                              itemId: it.id,
                              data: {
                                cartId: data!.id,
                                quantity: Math.max(0, it.quantity - 1),
                              },
                            });
                            refetch();
                          }}
                          className="px-3 py-1 text-base"
                          data-testid={`cart-item-${it.id}-dec`}
                        >
                          −
                        </button>
                        <span className="min-w-[2rem] px-2 text-center text-sm">
                          {it.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label="Increase"
                          onClick={async () => {
                            await update.mutateAsync({
                              itemId: it.id,
                              data: { cartId: data!.id, quantity: it.quantity + 1 },
                            });
                            refetch();
                          }}
                          className="px-3 py-1 text-base"
                          data-testid={`cart-item-${it.id}-inc`}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await remove.mutateAsync({
                            itemId: it.id,
                            params: { cartId: data!.id },
                          });
                          refetch();
                        }}
                        className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.18em]"
                        style={{ color: "hsl(170 18% 32%)" }}
                        data-testid={`cart-item-${it.id}-remove`}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <aside
              className="h-fit rounded-2xl border bg-card p-6"
              style={{ borderColor: "hsl(40 18% 80%)" }}
              data-testid="cart-summary"
            >
              <h2 className="font-display text-2xl">Order summary</h2>
              <dl
                className="mt-4 space-y-2 text-sm"
                style={{ color: "hsl(170 18% 28%)" }}
              >
                <div className="flex justify-between">
                  <dt>Subtotal</dt>
                  <dd data-testid="summary-subtotal">
                    {formatMoney(data!.subtotalCents, data!.currency)}
                  </dd>
                </div>
                {data!.discountCents && data!.discountCents > 0 ? (
                  <div
                    className="flex items-center justify-between"
                    style={{ color: "hsl(95 30% 35%)" }}
                    data-testid="summary-discount-row"
                  >
                    <dt className="flex items-center gap-2">
                      <span>Discount</span>
                      {data!.discountCode ? (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
                          style={{
                            background: "hsl(170 58% 14%)",
                            color: "hsl(45 49% 90%)",
                          }}
                          data-testid="summary-discount-code"
                        >
                          {data!.discountCode}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        aria-label="Remove discount"
                        onClick={async () => {
                          await removeDiscount.mutateAsync({
                            params: { cartId: data!.id },
                          });
                          refetch();
                        }}
                        className="rounded-full p-1 hover:bg-black/5"
                        data-testid="button-remove-discount"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </dt>
                    <dd data-testid="summary-discount-amount">
                      −{formatMoney(data!.discountCents, data!.currency)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt>Shipping</dt>
                  <dd className="opacity-70">Calculated at checkout</dd>
                </div>
              </dl>
              <div
                className="mt-4 flex justify-between border-t pt-4 font-display text-xl"
                style={{ borderColor: "hsl(40 18% 80%)" }}
              >
                <span>Total</span>
                <span data-testid="summary-total">
                  {formatMoney(
                    data!.totalCents ?? data!.subtotalCents,
                    data!.currency,
                  )}
                </span>
              </div>

              <form
                className="mt-5 grid gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setDiscountErr(null);
                  const trimmed = code.trim();
                  if (!trimmed) return;
                  try {
                    // Validate first per the documented checkout flow.
                    const v = await validate.mutateAsync({
                      data: { cartId: data!.id, code: trimmed },
                    });
                    if (!v.valid) {
                      setDiscountErr(
                        v.reason ?? "That code can't be used right now.",
                      );
                      return;
                    }
                    await applyDiscount.mutateAsync({
                      data: { cartId: data!.id, code: trimmed },
                    });
                    setCode("");
                    refetch();
                  } catch (err) {
                    setDiscountErr(
                      err instanceof Error
                        ? err.message
                        : "Invalid discount code",
                    );
                  }
                }}
                data-testid="discount-form"
              >
                <label
                  className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                  htmlFor="discount-code"
                >
                  Discount code
                </label>
                <div className="flex gap-2">
                  <Input
                    id="discount-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="ENTER CODE"
                    data-testid="cart-discount-input"
                    autoComplete="off"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={
                      !code.trim() ||
                      validate.isPending ||
                      applyDiscount.isPending
                    }
                    data-testid="cart-discount-apply"
                  >
                    {validate.isPending || applyDiscount.isPending
                      ? "…"
                      : "Apply"}
                  </Button>
                </div>
                {discountErr ? (
                  <p
                    className="text-xs"
                    style={{ color: "hsl(0 70% 35%)" }}
                    role="alert"
                    data-testid="discount-error"
                  >
                    {discountErr}
                  </p>
                ) : null}
              </form>

              <Button
                asChild
                className="mt-6 w-full rounded-full py-6 text-[11px] font-semibold uppercase tracking-[0.22em]"
                style={{
                  background: "hsl(42 53% 54%)",
                  color: "hsl(170 58% 14%)",
                }}
                data-testid="cart-checkout"
              >
                <Link href="/checkout">Continue to checkout</Link>
              </Button>
            </aside>
          </div>
        )}
      </section>
    </SiteShell>
  );
}
