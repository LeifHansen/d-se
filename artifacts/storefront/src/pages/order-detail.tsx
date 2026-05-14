import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "wouter";
import { useLookupOrder } from "@workspace/api-client-react";
import type { Order } from "@workspace/api-client-react";
import { SiteShell } from "@/components/dose/SiteShell";
import { Seo } from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/cart";

const GUEST_EMAIL_KEY = "dose-last-order-email";

function formatDate(s: string | Date): string {
  try {
    return new Date(s).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(s);
  }
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = Number(params.id);
  const lookup = useLookupOrder();
  const [email, setEmail] = useState<string>("");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  // Auto-attempt with token from URL query, then email from URL/localStorage.
  useEffect(() => {
    if (!Number.isFinite(orderId) || tried) return;
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token") ?? "";
    if (token) {
      setTried(true);
      lookup
        .mutateAsync({ data: { orderId, token } })
        .then((res) => setOrder(res))
        .catch(() => {
          setError(
            "This link is invalid or expired. Enter the email used at checkout.",
          );
        });
      return;
    }
    let candidate = url.searchParams.get("email") ?? "";
    if (!candidate) {
      try {
        candidate = window.localStorage.getItem(GUEST_EMAIL_KEY) ?? "";
      } catch {
        candidate = "";
      }
    }
    if (candidate) {
      setEmail(candidate);
      setTried(true);
      lookup
        .mutateAsync({ data: { orderId, email: candidate } })
        .then((res) => {
          setOrder(res);
          try {
            window.localStorage.setItem(GUEST_EMAIL_KEY, candidate);
          } catch {
            /* ignore */
          }
        })
        .catch((err) => {
          setError(
            err instanceof Error
              ? "We couldn't find that order. Enter the email used at checkout."
              : "Order not found.",
          );
        });
    }
  }, [orderId, tried, lookup]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!Number.isFinite(orderId)) {
      setError("Invalid order number.");
      return;
    }
    try {
      const res = await lookup.mutateAsync({
        data: { orderId, email: email.trim() },
      });
      setOrder(res);
      try {
        window.localStorage.setItem(GUEST_EMAIL_KEY, email.trim());
      } catch {
        /* ignore */
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? "We couldn't find that order. Check your email and try again."
          : "Order not found.",
      );
    }
  };

  return (
    <SiteShell testId="page-order-detail">
      <Seo title={`Order #${params.id}`} noindex />
      <section
        style={{ background: "hsl(170 58% 14%)", color: "hsl(45 49% 90%)" }}
      >
        <div className="mx-auto max-w-3xl px-6 py-14 md:px-10">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "hsl(42 53% 64%)" }}
          >
            {order ? "Order confirmed" : "Order lookup"}
          </p>
          <h1 className="mt-2 font-display text-4xl leading-tight">
            {order ? "Thank you." : `Order #${params.id}`}
          </h1>
          {order ? (
            <p className="mt-3 text-sm opacity-80">
              Order #{order.id} · {formatDate(order.createdAt)} · {order.status}
            </p>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-12 md:px-10">
        {order ? (
          <div data-testid="order-summary">
            <ul
              className="space-y-3 border-b pb-4 text-sm"
              style={{
                borderColor: "hsl(40 18% 80%)",
                color: "hsl(170 18% 28%)",
              }}
            >
              {order.items.map((it) => (
                <li
                  key={it.id}
                  className="flex justify-between gap-2"
                  data-testid={`order-item-${it.id}`}
                >
                  <span>
                    {it.productName}{" "}
                    <span className="opacity-70">× {it.quantity}</span>
                  </span>
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
              className="mt-4 space-y-1.5 text-sm"
              style={{ color: "hsl(170 18% 28%)" }}
            >
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{formatMoney(order.subtotalCents, order.currency)}</dd>
              </div>
              {order.discountCents ? (
                <div className="flex justify-between">
                  <dt>
                    Discount
                    {order.discountCode ? ` (${order.discountCode})` : ""}
                  </dt>
                  <dd>-{formatMoney(order.discountCents, order.currency)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt>Shipping</dt>
                <dd>{formatMoney(order.shippingCents, order.currency)}</dd>
              </div>
              {order.taxCents ? (
                <div className="flex justify-between">
                  <dt>Tax</dt>
                  <dd>{formatMoney(order.taxCents, order.currency)}</dd>
                </div>
              ) : null}
              <div
                className="flex justify-between border-t pt-2 font-display text-base"
                style={{ borderColor: "hsl(40 18% 80%)", color: "hsl(170 58% 14%)" }}
              >
                <dt>Total</dt>
                <dd data-testid="order-total">
                  {formatMoney(order.totalCents, order.currency)}
                </dd>
              </div>
            </dl>
            {order.shippingAddress ? (
              <div className="mt-6">
                <h2 className="font-display text-xl">Shipping to</h2>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: "hsl(170 18% 28%)" }}
                >
                  {order.shippingAddress.name}
                  <br />
                  {order.shippingAddress.street1}
                  {order.shippingAddress.street2
                    ? `, ${order.shippingAddress.street2}`
                    : ""}
                  <br />
                  {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
                  {order.shippingAddress.zip}
                  <br />
                  {order.shippingAddress.country}
                </p>
              </div>
            ) : null}
            {order.trackingCode ? (
              <p className="mt-6 text-sm">
                Tracking: <code>{order.trackingCode}</code>
              </p>
            ) : null}
            <Button
              asChild
              className="mt-8 rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{
                background: "hsl(170 58% 14%)",
                color: "hsl(45 49% 90%)",
              }}
            >
              <Link href="/shop">Keep shopping</Link>
            </Button>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="rounded-2xl border bg-card p-6"
            style={{ borderColor: "hsl(40 18% 80%)" }}
            data-testid="order-lookup-form"
          >
            <h2 className="font-display text-2xl">Find your order</h2>
            <p
              className="mt-1 text-sm"
              style={{ color: "hsl(170 18% 32%)" }}
            >
              Enter the email you used at checkout to view this order.
            </p>
            <div className="mt-4 grid gap-2">
              <Label htmlFor="lookup-email">Email</Label>
              <Input
                id="lookup-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="order-lookup-email"
              />
            </div>
            <Button
              type="submit"
              disabled={lookup.isPending}
              className="mt-5 rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{
                background: "hsl(170 58% 14%)",
                color: "hsl(45 49% 90%)",
              }}
              data-testid="order-lookup-submit"
            >
              {lookup.isPending ? "Looking up…" : "View order"}
            </Button>
            {error ? (
              <p
                role="alert"
                className="mt-3 text-xs"
                style={{ color: "hsl(0 70% 35%)" }}
                data-testid="order-lookup-error"
              >
                {error}
              </p>
            ) : null}
          </form>
        )}
      </section>
    </SiteShell>
  );
}
