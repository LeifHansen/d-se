import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "wouter";
import {
  useLookupOrder,
  useLookupOrderByToken,
  useResendOrderLink,
} from "@workspace/api-client-react";
import type { Order } from "@workspace/api-client-react";
import { SiteShell } from "@/components/dose/SiteShell";
import { OrderTracking } from "@/components/dose/OrderTracking";
import { OrderStatusBadge } from "@/components/dose/OrderStatusBadge";
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

function formatShortDate(s: string | Date): string {
  try {
    return new Date(s).toLocaleDateString("en-US", {
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
  const lookupByToken = useLookupOrderByToken();
  const resendLink = useResendOrderLink();
  const [email, setEmail] = useState<string>("");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [resendEmail, setResendEmail] = useState<string>("");
  const [resendStatus, setResendStatus] = useState<"idle" | "sent" | "throttled" | "error">("idle");

  // Auto-attempt with token from URL query, then email from URL/localStorage.
  useEffect(() => {
    if (!Number.isFinite(orderId) || tried) return;
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token") ?? "";
    if (token) {
      setTried(true);
      lookupByToken
        .mutateAsync({ data: { token } })
        .then((res) => setOrder(res))
        .catch(() => {
          setTokenExpired(true);
          setError(
            "This link is invalid or expired. Enter your email below to get a fresh one — or look up your order with the email used at checkout.",
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

  const onResend = async (e: FormEvent) => {
    e.preventDefault();
    setResendStatus("idle");
    if (!Number.isFinite(orderId)) return;
    try {
      await resendLink.mutateAsync({
        id: orderId,
        data: { email: resendEmail.trim() },
      });
      setResendStatus("sent");
    } catch (err) {
      // The API returns 200 even when the email doesn't match (so we never
      // confirm whether the order/email pair exists). The only failure path
      // we expect to surface is the throttle.
      const msg =
        err instanceof Error && /429|too many|rate/i.test(err.message)
          ? "throttled"
          : "error";
      setResendStatus(msg);
    }
  };

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
      <Seo
        title={
          order
            ? `Order #${order.id} · ${formatShortDate(order.createdAt)} · ${order.items.reduce((n, it) => n + it.quantity, 0)} item${order.items.reduce((n, it) => n + it.quantity, 0) === 1 ? "" : "s"} confirmed`
            : Number.isFinite(orderId)
              ? `Order #${orderId}`
              : "Order lookup"
        }
        description={
          order
            ? `Order #${order.id} details, status, and tracking.`
            : "Look up your DŌSE order."
        }
        noindex
      />
      <section
        style={{ background: "hsl(166 95% 19%)", color: "hsl(45 49% 90%)" }}
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
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm opacity-90">
              <span>
                Order #{order.id} · {formatDate(order.createdAt)}
              </span>
              <OrderStatusBadge
                status={order.status}
                testId="order-status-badge-hero"
              />
            </div>
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
                  <span className="flex flex-wrap items-center gap-2">
                    <span>
                      {it.productName}{" "}
                      <span className="opacity-70">× {it.quantity}</span>
                    </span>
                    {!it.available ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
                        style={{
                          background: "hsl(40 50% 88%)",
                          color: "hsl(0 55% 30%)",
                        }}
                        data-testid={`order-item-${it.id}-availability`}
                      >
                        {it.unavailableReason === "out_of_stock"
                          ? "Out of stock"
                          : "Unavailable"}
                      </span>
                    ) : null}
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
                style={{ borderColor: "hsl(40 18% 80%)", color: "hsl(166 95% 19%)" }}
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
            <div className="mt-6">
              <h2 className="font-display text-xl">Tracking</h2>
              <div className="mt-2" data-testid="order-shipment-status">
                <OrderStatusBadge
                  status={order.status}
                  testId="order-status-badge"
                />
              </div>
              <OrderTracking order={order} variant="inline" />
              {order.deliveredEmailSentAt ? (
                <p
                  className="mt-3 text-sm"
                  style={{ color: "hsl(170 18% 32%)" }}
                  data-testid="order-delivered-email-notice"
                >
                  We emailed you a delivery confirmation on{" "}
                  {formatDate(order.deliveredEmailSentAt)}.
                </p>
              ) : null}
              {!order.trackingCode ? (
                <p
                  className="mt-3 text-sm"
                  style={{ color: "hsl(170 18% 32%)" }}
                  data-testid="order-tracking-pending"
                >
                  Tracking will appear here once your order ships.
                </p>
              ) : null}
            </div>
            <Button
              asChild
              className="mt-8 rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{
                background: "hsl(166 95% 19%)",
                color: "hsl(45 49% 90%)",
              }}
            >
              <Link href="/shop">Keep shopping</Link>
            </Button>
          </div>
        ) : (
          <>
          {tokenExpired ? (
            <form
              onSubmit={onResend}
              className="mb-6 rounded-2xl border bg-card p-6"
              style={{ borderColor: "hsl(40 18% 80%)" }}
              data-testid="order-resend-form"
            >
              <h2 className="font-display text-2xl">Send me a fresh link</h2>
              <p
                className="mt-1 text-sm"
                style={{ color: "hsl(170 18% 32%)" }}
              >
                Enter the email used at checkout and we'll email you a new link
                to this order.
              </p>
              <div className="mt-4 grid gap-2">
                <Label htmlFor="resend-email">Email</Label>
                <Input
                  id="resend-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  data-testid="order-resend-email"
                />
              </div>
              <Button
                type="submit"
                disabled={resendLink.isPending || resendStatus === "sent"}
                className="mt-5 rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
                style={{
                  background: "hsl(166 95% 19%)",
                  color: "hsl(45 49% 90%)",
                }}
                data-testid="order-resend-submit"
              >
                {resendLink.isPending
                  ? "Sending…"
                  : resendStatus === "sent"
                    ? "Link sent"
                    : "Email me a new link"}
              </Button>
              {resendStatus === "sent" ? (
                <p
                  role="status"
                  className="mt-3 text-xs"
                  style={{ color: "hsl(166 95% 19%)" }}
                  data-testid="order-resend-success"
                >
                  If that email matches the order on file, a fresh link is on
                  its way. Check your inbox in a minute or two.
                </p>
              ) : null}
              {resendStatus === "throttled" ? (
                <p
                  role="alert"
                  className="mt-3 text-xs"
                  style={{ color: "hsl(0 70% 35%)" }}
                  data-testid="order-resend-throttled"
                >
                  Too many requests. Please wait a bit before trying again.
                </p>
              ) : null}
              {resendStatus === "error" ? (
                <p
                  role="alert"
                  className="mt-3 text-xs"
                  style={{ color: "hsl(0 70% 35%)" }}
                  data-testid="order-resend-error"
                >
                  Couldn't send the link right now. Please try again shortly.
                </p>
              ) : null}
            </form>
          ) : null}
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
                background: "hsl(166 95% 19%)",
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
          </>
        )}
      </section>
    </SiteShell>
  );
}
