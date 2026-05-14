import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import {
  useGetCart,
  useGetShippingRates,
  useCreateCheckout,
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

export default function CheckoutPage() {
  const cartId = useStoredCartId();
  const { data: cart, isLoading: cartLoading } = useGetCart(
    { cartId: cartId ?? undefined },
    { query: { enabled: !!cartId } as never },
  );
  const shipping = useGetShippingRates();
  const checkout = useCreateCheckout();

  const [email, setEmail] = useState("");
  const [address, setAddress] = useState<AddressInput>({
    name: "",
    street1: "",
    street2: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
    phone: "",
  });
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

  useEffect(() => {
    if (rates && rates.length > 0 && !rateId) {
      setRateId(rates[0].id);
    }
  }, [rates, rateId]);

  const updateField =
    <K extends keyof AddressInput>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setAddress((a) => ({ ...a, [key]: e.target.value }));

  const fetchRates = async () => {
    if (!cart?.id) return;
    try {
      const result = await shipping.mutateAsync({
        data: { cartId: cart.id, address },
      });
      setRates(result);
    } catch (err) {
      setRates([]);
      setSubmitErr(
        err instanceof Error ? err.message : "Couldn't fetch shipping rates",
      );
    }
  };

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
        window.localStorage.setItem("dose-last-order-email", email);
        if (result.orderId) {
          window.localStorage.setItem(
            "dose-last-order-id",
            String(result.orderId),
          );
        }
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
              <h2 className="font-display text-2xl">Shipping address</h2>
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
                  >
                    Enter your address and click calculate.
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
                      <p
                        className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                        style={{ color: "hsl(0 70% 35%)" }}
                        data-testid={`checkout-stock-${it.id}`}
                      >
                        Out of stock
                      </p>
                    ) : oversold ? (
                      <p
                        className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                        style={{ color: "hsl(0 70% 35%)" }}
                        data-testid={`checkout-stock-${it.id}`}
                      >
                        Only {inv} left — please reduce quantity
                      </p>
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
