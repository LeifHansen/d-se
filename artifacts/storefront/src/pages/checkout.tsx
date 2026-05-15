import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCart,
  useGetShippingRates,
  useCreateCheckout,
  useListMyOrders,
  useUpdateCartItem,
  useRemoveCartItem,
  getGetCartQueryKey,
} from "@workspace/api-client-react";
import type {
  AddressInput,
  ShippingRate,
} from "@workspace/api-client-react";
import { SiteShell } from "@/components/dose/SiteShell";
import { Seo } from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStoredCartId, formatMoney } from "@/lib/cart";

const SAVED_ADDRESS_KEY = "dose-saved-address";
const SAVED_EMAIL_KEY = "dose-last-order-email";

const EMPTY_ADDRESS: AddressInput = {
  name: "",
  street1: "",
  street2: "",
  city: "",
  state: "",
  zip: "",
  country: "US",
  phone: "",
};

function isAddressLike(v: unknown): v is AddressInput {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.name === "string" &&
    typeof a.street1 === "string" &&
    typeof a.city === "string" &&
    typeof a.state === "string" &&
    typeof a.zip === "string" &&
    typeof a.country === "string"
  );
}

function readSavedAddress(): AddressInput | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SAVED_ADDRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isAddressLike(parsed)) return null;
    return {
      name: parsed.name,
      street1: parsed.street1,
      street2: parsed.street2 ?? "",
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
      country: parsed.country || "US",
      phone: parsed.phone ?? "",
    };
  } catch {
    return null;
  }
}

function readSavedEmail(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(SAVED_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

function addressIsBlank(a: AddressInput): boolean {
  return !a.name && !a.street1 && !a.city && !a.zip;
}

export default function CheckoutPage() {
  const cartId = useStoredCartId();
  const cartParams = { cartId: cartId ?? undefined };
  const { data: cart, isLoading: cartLoading } = useGetCart(cartParams, {
    query: { enabled: !!cartId } as never,
  });
  const qc = useQueryClient();
  const invalidateCart = () =>
    qc.invalidateQueries({ queryKey: getGetCartQueryKey(cartParams) });
  const updateItem = useUpdateCartItem({
    mutation: { onSuccess: () => invalidateCart() },
  });
  const removeItem = useRemoveCartItem({
    mutation: { onSuccess: () => invalidateCart() },
  });
  const shipping = useGetShippingRates();
  const checkout = useCreateCheckout();

  // Pull the signed-in user's most recent order so we can prefill from the
  // last server-side address. Quietly tolerate 401 for guests.
  const myOrders = useListMyOrders({
    query: { retry: false, refetchOnWindowFocus: false } as never,
  });
  const serverSavedAddress = useMemo<AddressInput | null>(() => {
    const list = (myOrders.data ?? []) as Array<{
      shippingAddress?: AddressInput | null;
      createdAt?: string;
    }>;
    for (const o of list) {
      if (o.shippingAddress && isAddressLike(o.shippingAddress)) {
        return {
          name: o.shippingAddress.name,
          street1: o.shippingAddress.street1,
          street2: o.shippingAddress.street2 ?? "",
          city: o.shippingAddress.city,
          state: o.shippingAddress.state,
          zip: o.shippingAddress.zip,
          country: o.shippingAddress.country || "US",
          phone: o.shippingAddress.phone ?? "",
        };
      }
    }
    return null;
  }, [myOrders.data]);

  const [email, setEmail] = useState<string>(() => readSavedEmail());
  const [address, setAddress] = useState<AddressInput>(
    () => readSavedAddress() ?? EMPTY_ADDRESS,
  );
  const [prefilled, setPrefilled] = useState<boolean>(
    () => !addressIsBlank(readSavedAddress() ?? EMPTY_ADDRESS),
  );
  const [editingFresh, setEditingFresh] = useState(false);
  const [rates, setRates] = useState<ShippingRate[] | null>(null);
  const [rateId, setRateId] = useState<string>("");
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  type StockIssue = {
    id: number;
    name: string;
    kind: "out" | "over";
    inv: number;
  };
  const stockIssues: StockIssue[] = [];
  for (const it of cart?.items ?? []) {
    const inv = it.product.inventory ?? 0;
    if (inv <= 0) {
      stockIssues.push({ id: it.id, name: it.product.name, kind: "out", inv });
    } else if (it.quantity > inv) {
      stockIssues.push({ id: it.id, name: it.product.name, kind: "over", inv });
    }
  }
  const hasStockIssue = stockIssues.length > 0;

  // Once the signed-in user's latest order loads, prefer it over the
  // localStorage copy (it's the canonical server-side record). Only apply
  // when the user hasn't already started editing fresh.
  useEffect(() => {
    if (!serverSavedAddress) return;
    if (editingFresh) return;
    setAddress((cur) => (addressIsBlank(cur) ? serverSavedAddress : cur));
    setPrefilled(true);
  }, [serverSavedAddress, editingFresh]);

  useEffect(() => {
    if (rates && rates.length > 0 && !rateId) {
      setRateId(rates[0].id);
    }
  }, [rates, rateId]);

  const useDifferentAddress = () => {
    setAddress(EMPTY_ADDRESS);
    setRates(null);
    setRateId("");
    setPrefilled(false);
    setEditingFresh(true);
  };

  const updateField =
    <K extends keyof AddressInput>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setAddress((a) => ({ ...a, [key]: e.target.value }));

  // Track the most recent rate request so out-of-order responses (e.g. from
  // the auto-fetch firing while the shopper is still editing) don't clobber
  // the current state with stale rates.
  const rateRequestRef = useRef(0);
  const fetchRates = async () => {
    if (!cart?.id) return;
    const requestId = ++rateRequestRef.current;
    try {
      const result = await shipping.mutateAsync({
        data: { cartId: cart.id, address },
      });
      if (requestId !== rateRequestRef.current) return;
      setRates(result);
    } catch (err) {
      if (requestId !== rateRequestRef.current) return;
      setRates([]);
      setSubmitErr(
        err instanceof Error ? err.message : "Couldn't fetch shipping rates",
      );
    }
  };

  const addressIsComplete = useMemo(
    () =>
      address.name.trim() !== "" &&
      address.street1.trim() !== "" &&
      address.city.trim() !== "" &&
      address.state.trim() !== "" &&
      address.zip.trim() !== "" &&
      address.country.trim() !== "",
    [address],
  );

  // Auto-fetch shipping rates (debounced) once required address fields are
  // filled. Reset rates whenever the address changes so the shopper isn't
  // shown stale options. The manual Calculate button stays as a fallback.
  const addressKey = useMemo(
    () =>
      JSON.stringify({
        name: address.name.trim(),
        street1: address.street1.trim(),
        street2: (address.street2 ?? "").trim(),
        city: address.city.trim(),
        state: address.state.trim(),
        zip: address.zip.trim(),
        country: address.country.trim(),
      }),
    [address],
  );

  useEffect(() => {
    setRates(null);
    setRateId("");
  }, [addressKey]);

  useEffect(() => {
    if (!cart?.id) return;
    if (!addressIsComplete) return;
    const handle = window.setTimeout(() => {
      void fetchRates();
    }, 600);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressKey, cart?.id, addressIsComplete]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitErr(null);
    if (!cart?.id) return;
    if (!rateId) {
      setSubmitErr("Please calculate shipping first.");
      return;
    }
    if (hasStockIssue) {
      setSubmitErr(
        "Some items in your bag are out of stock. Please update your bag before paying.",
      );
      return;
    }
    try {
      const result = await checkout.mutateAsync({
        data: {
          cartId: cart.id,
          email,
          address,
          shippingRateId: rateId,
        },
      });
      // Remember the guest's email so the order page and email-based lookup
      // both work without forcing them to type it again.
      try {
        window.localStorage.setItem(SAVED_EMAIL_KEY, email);
        if (result.orderId) {
          window.localStorage.setItem(
            "dose-last-order-id",
            String(result.orderId),
          );
        }
        // Persist the address locally so the next checkout pre-fills even
        // for guests / new browsers without an account.
        window.localStorage.setItem(
          SAVED_ADDRESS_KEY,
          JSON.stringify(address),
        );
      } catch {
        /* ignore */
      }
      if (result.url?.startsWith("http")) {
        window.location.href = result.url;
      } else {
        window.location.href = result.url;
      }
    } catch (err) {
      setSubmitErr(
        err instanceof Error ? err.message : "Couldn't start checkout",
      );
    }
  };

  if (!cartLoading && (!cart || cart.items.length === 0)) {
    return (
      <SiteShell testId="page-checkout">
        <Seo title="Checkout" noindex />
        <div className="mx-auto max-w-3xl px-6 py-24 text-center md:px-10">
          <h1 className="font-display text-4xl">Your bag is empty.</h1>
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
      </SiteShell>
    );
  }

  return (
    <SiteShell testId="page-checkout">
      <Seo title="Checkout" noindex />
      <section
        style={{ background: "hsl(170 58% 14%)", color: "hsl(45 49% 90%)" }}
      >
        <div className="mx-auto max-w-5xl px-6 py-14 md:px-10">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "hsl(42 53% 64%)" }}
          >
            Checkout
          </p>
          <h1 className="mt-2 font-display text-4xl leading-tight">
            One last step.
          </h1>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12 md:px-10">
        <form
          className="grid gap-10 md:grid-cols-3"
          onSubmit={onSubmit}
          data-testid="checkout-form"
        >
          <div className="md:col-span-2 space-y-8">
            <div>
              <h2 className="font-display text-2xl">Contact</h2>
              <div className="mt-4 grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="checkout-email"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-2xl">Shipping address</h2>
                {prefilled ? (
                  <button
                    type="button"
                    onClick={useDifferentAddress}
                    className="text-[11px] font-semibold uppercase tracking-[0.22em] underline underline-offset-4"
                    style={{ color: "hsl(170 18% 32%)" }}
                    data-testid="checkout-use-different-address"
                  >
                    Use a different address
                  </button>
                ) : null}
              </div>
              {prefilled ? (
                <p
                  className="mt-2 text-xs"
                  style={{ color: "hsl(170 18% 32%)" }}
                  data-testid="checkout-address-prefilled"
                >
                  We pre-filled your last shipping address.
                </p>
              ) : null}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    required
                    autoComplete="name"
                    value={address.name}
                    onChange={updateField("name")}
                    data-testid="checkout-name"
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="street1">Address</Label>
                  <Input
                    id="street1"
                    required
                    autoComplete="address-line1"
                    value={address.street1}
                    onChange={updateField("street1")}
                    data-testid="checkout-street1"
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="street2">Apt / Suite (optional)</Label>
                  <Input
                    id="street2"
                    autoComplete="address-line2"
                    value={address.street2 ?? ""}
                    onChange={updateField("street2")}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    required
                    autoComplete="address-level2"
                    value={address.city}
                    onChange={updateField("city")}
                    data-testid="checkout-city"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    required
                    autoComplete="address-level1"
                    value={address.state}
                    onChange={updateField("state")}
                    data-testid="checkout-state"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="zip">ZIP</Label>
                  <Input
                    id="zip"
                    required
                    autoComplete="postal-code"
                    value={address.zip}
                    onChange={updateField("zip")}
                    data-testid="checkout-zip"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    required
                    autoComplete="country"
                    value={address.country}
                    onChange={updateField("country")}
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl">Shipping method</h2>
                <Button
                  type="button"
                  variant="outline"
                  onClick={fetchRates}
                  disabled={shipping.isPending}
                  data-testid="checkout-calc-shipping"
                >
                  {shipping.isPending ? "Calculating…" : "Calculate"}
                </Button>
              </div>
              <div className="mt-4 space-y-2">
                {rates === null ? (
                  <p
                    className="text-sm"
                    style={{ color: "hsl(170 18% 32%)" }}
                    data-testid="checkout-rates-hint"
                  >
                    {shipping.isPending
                      ? "Fetching shipping options…"
                      : addressIsComplete
                        ? "Fetching shipping options…"
                        : "Fill in your address to see shipping options."}
                  </p>
                ) : rates.length === 0 ? (
                  <p
                    className="text-sm"
                    style={{ color: "hsl(0 70% 35%)" }}
                  >
                    No shipping options available.
                  </p>
                ) : (
                  rates.map((r) => (
                    <label
                      key={r.id}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border p-4"
                      style={{
                        borderColor:
                          rateId === r.id
                            ? "hsl(42 53% 54%)"
                            : "hsl(40 18% 80%)",
                        background:
                          rateId === r.id ? "hsl(45 50% 93%)" : "transparent",
                      }}
                    >
                      <input
                        type="radio"
                        name="shipping-rate"
                        value={r.id}
                        checked={rateId === r.id}
                        onChange={() => setRateId(r.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <p className="font-medium">
                          {r.carrier} · {r.service}
                        </p>
                        {r.deliveryDays ? (
                          <p
                            className="text-xs"
                            style={{ color: "hsl(170 18% 32%)" }}
                          >
                            ~{r.deliveryDays} business days
                          </p>
                        ) : null}
                      </div>
                      <p className="font-display text-lg">
                        {formatMoney(r.amountCents, r.currency)}
                      </p>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          <aside
            className="h-fit rounded-2xl border bg-card p-6"
            style={{ borderColor: "hsl(40 18% 80%)" }}
          >
            <h2 className="font-display text-2xl">Your order</h2>
            <ul
              className="mt-4 space-y-3 border-b pb-4 text-sm"
              style={{
                borderColor: "hsl(40 18% 80%)",
                color: "hsl(170 18% 28%)",
              }}
            >
              {cart?.items.map((it) => {
                const inv = it.product.inventory ?? 0;
                const lowThreshold = it.product.lowStockThreshold ?? 0;
                const oversold = it.quantity > inv;
                const outOfStock = inv <= 0;
                const lowStock =
                  !outOfStock && !oversold && lowThreshold > 0 && inv <= lowThreshold;
                return (
                  <li
                    key={it.id}
                    className="flex flex-col gap-1"
                    data-testid={`checkout-line-${it.id}`}
                  >
                    <div className="flex justify-between gap-2">
                      <span>
                        {it.product.name}{" "}
                        <span className="opacity-70">× {it.quantity}</span>
                      </span>
                      <span>
                        {formatMoney(it.lineTotalCents, it.product.currency)}
                      </span>
                    </div>
                    {outOfStock ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                          style={{ color: "hsl(0 70% 35%)" }}
                          data-testid={`checkout-stock-${it.id}`}
                        >
                          Out of stock
                        </p>
                        {cartId ? (
                          <button
                            type="button"
                            className="text-[11px] font-semibold uppercase tracking-[0.18em] underline underline-offset-2"
                            style={{ color: "hsl(170 58% 14%)" }}
                            onClick={() =>
                              removeItem.mutate({
                                itemId: it.id,
                                params: { cartId },
                              })
                            }
                            data-testid={`checkout-remove-oos-${it.id}`}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ) : oversold ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                          style={{ color: "hsl(0 70% 35%)" }}
                          data-testid={`checkout-stock-${it.id}`}
                        >
                          Only {inv} left — please reduce quantity
                        </p>
                        {cartId ? (
                          <button
                            type="button"
                            className="text-[11px] font-semibold uppercase tracking-[0.18em] underline underline-offset-2"
                            style={{ color: "hsl(170 58% 14%)" }}
                            onClick={() =>
                              updateItem.mutate({
                                itemId: it.id,
                                data: { cartId, quantity: inv },
                              })
                            }
                            data-testid={`checkout-update-to-${it.id}`}
                          >
                            Update to {inv}
                          </button>
                        ) : null}
                      </div>
                    ) : lowStock ? (
                      <p
                        className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                        style={{ color: "hsl(35 80% 30%)" }}
                        data-testid={`checkout-stock-${it.id}`}
                      >
                        Only {inv} left
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <dl
              className="mt-4 space-y-1.5 text-sm"
              style={{ color: "hsl(170 18% 28%)" }}
            >
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{formatMoney(cart?.subtotalCents ?? 0, cart?.currency)}</dd>
              </div>
              {cart?.discountCents ? (
                <div className="flex justify-between">
                  <dt>Discount</dt>
                  <dd>
                    -{formatMoney(cart.discountCents, cart.currency)}
                  </dd>
                </div>
              ) : null}
              {rateId && rates ? (
                <div className="flex justify-between">
                  <dt>Shipping</dt>
                  <dd>
                    {formatMoney(
                      rates.find((r) => r.id === rateId)?.amountCents ?? 0,
                      cart?.currency,
                    )}
                  </dd>
                </div>
              ) : null}
            </dl>
            <Button
              type="submit"
              disabled={checkout.isPending || !rateId || hasStockIssue}
              className="mt-6 w-full rounded-full py-6 text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{
                background: "hsl(42 53% 54%)",
                color: "hsl(170 58% 14%)",
              }}
              data-testid="checkout-submit"
            >
              {checkout.isPending
                ? "Starting…"
                : hasStockIssue
                  ? "Update bag to continue"
                  : "Pay securely"}
            </Button>
            {hasStockIssue ? (
              <p
                role="alert"
                className="mt-3 text-xs"
                style={{ color: "hsl(0 70% 35%)" }}
                data-testid="checkout-stock-warning"
              >
                {stockIssues.length === 1 && stockIssues[0]
                  ? `${stockIssues[0].name} is ${stockIssues[0].kind === "out" ? "out of stock" : `down to ${stockIssues[0].inv} in stock`}. Update your bag before paying.`
                  : "Some items in your bag aren't available in the quantity you selected. Update your bag before paying."}
              </p>
            ) : null}
            {submitErr ? (
              <p
                role="alert"
                className="mt-3 text-xs"
                style={{ color: "hsl(0 70% 35%)" }}
                data-testid="checkout-error"
              >
                {submitErr}
              </p>
            ) : null}
          </aside>
        </form>
      </section>
    </SiteShell>
  );
}
