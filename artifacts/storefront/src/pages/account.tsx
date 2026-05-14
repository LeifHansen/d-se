import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useListMyOrders } from "@workspace/api-client-react";
import { SiteShell } from "@/components/dose/SiteShell";
import { Seo } from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/cart";

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}

function GuestOrderLookup() {
  const [, setLocation] = useLocation();
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const id = orderId.trim().replace(/^#/, "");
    if (!/^\d+$/.test(id)) {
      setErr("Order number should be digits only.");
      return;
    }
    if (!email.trim()) {
      setErr("Enter the email used at checkout.");
      return;
    }
    setErr(null);
    // The order detail page will perform the lookup (and show an error there
    // if the email doesn't match).
    setLocation(`/orders/${id}?email=${encodeURIComponent(email.trim())}`);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="mt-8 rounded-2xl border bg-card p-6"
      style={{ borderColor: "hsl(40 18% 80%)" }}
      data-testid="guest-order-lookup"
    >
      <h2 className="font-display text-2xl">Check on a guest order</h2>
      <p className="mt-1 text-sm" style={{ color: "hsl(170 18% 32%)" }}>
        Enter the order number from your confirmation email and the email you
        used at checkout.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="lookup-order">Order number</Label>
          <Input
            id="lookup-order"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="1234"
            required
            data-testid="lookup-order-id"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="lookup-email">Email</Label>
          <Input
            id="lookup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            data-testid="lookup-order-email"
          />
        </div>
      </div>
      <Button
        type="submit"
        className="mt-4 rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
        style={{
          background: "hsl(170 58% 14%)",
          color: "hsl(45 49% 90%)",
        }}
        data-testid="lookup-order-submit"
      >
        Find my order
      </Button>
      {err ? (
        <p
          role="alert"
          className="mt-3 text-xs"
          style={{ color: "hsl(0 70% 35%)" }}
          data-testid="lookup-order-error"
        >
          {err}
        </p>
      ) : null}
    </form>
  );
}

export default function AccountPage() {
  const { data, isLoading, isError, error } = useListMyOrders({
    query: { retry: false } as never,
  });

  const unauthenticated =
    isError &&
    /401|403|unauth/i.test(error instanceof Error ? error.message : "");

  return (
    <SiteShell testId="page-account">
      <Seo title="Your account" noindex />
      <section
        style={{ background: "hsl(170 58% 14%)", color: "hsl(45 49% 90%)" }}
      >
        <div className="mx-auto max-w-4xl px-6 py-16 md:px-10 md:py-20">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "hsl(42 53% 64%)" }}
          >
            Account
          </p>
          <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">
            Your{" "}
            <span
              className="font-display-italic"
              style={{ color: "hsl(95 30% 78%)" }}
            >
              orders.
            </span>
          </h1>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12 md:px-10 md:py-16">
        {isLoading ? (
          <p className="opacity-70" data-testid="account-loading">
            Loading…
          </p>
        ) : unauthenticated ? (
          <div
            className="rounded-2xl border p-8 text-center"
            style={{
              borderColor: "hsl(40 18% 80%)",
              background: "hsl(45 50% 93%)",
            }}
            data-testid="account-signin"
          >
            <p className="font-display text-2xl">Sign in to see your orders.</p>
            <p
              className="mt-2 text-sm"
              style={{ color: "hsl(170 18% 32%)" }}
            >
              Order confirmations and tracking links also arrive in your email.
            </p>
            <Button
              asChild
              className="mt-5 rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{
                background: "hsl(170 58% 14%)",
                color: "hsl(45 49% 90%)",
              }}
            >
              <Link href="/contact">Need help?</Link>
            </Button>
          </div>
        ) : isError ? (
          <p
            role="alert"
            className="text-sm"
            style={{ color: "hsl(0 70% 35%)" }}
            data-testid="account-error"
          >
            {error instanceof Error ? error.message : "Couldn't load orders."}
          </p>
        ) : data && data.length > 0 ? (
          <ul className="space-y-4" data-testid="account-orders">
            {data.map((order) => (
              <li
                key={order.id}
                className="rounded-2xl border bg-card p-5 transition-colors hover:bg-card/80"
                style={{ borderColor: "hsl(40 18% 80%)" }}
                data-testid={`order-${order.id}`}
              >
                <Link
                  href={`/account/orders/${order.id}`}
                  className="block"
                  data-testid={`link-order-${order.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-xl">
                        Order #{order.id}
                      </p>
                      <p
                        className="text-xs uppercase tracking-[0.18em]"
                        style={{ color: "hsl(170 18% 32%)" }}
                      >
                        {formatDate(String(order.createdAt))} · {order.status}
                      </p>
                    </div>
                    <p className="font-display text-lg">
                      {formatMoney(order.totalCents, order.currency)}
                    </p>
                  </div>
                  <ul
                    className="mt-3 space-y-1 text-sm"
                    style={{ color: "hsl(170 18% 28%)" }}
                  >
                    {order.items.map((it) => (
                      <li key={it.id}>
                        {it.productName}{" "}
                        <span className="opacity-70">× {it.quantity}</span>
                      </li>
                    ))}
                  </ul>
                  {order.trackingCode ? (
                    <p className="mt-2 text-sm">
                      {order.carrier ? `${order.carrier}: ` : "Tracking: "}
                      <code className="break-all">{order.trackingCode}</code>
                      {order.trackingUrl ? (
                        <>
                          {" — "}
                          <a
                            href={order.trackingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                            data-testid="account-order-tracking-link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Track package →
                          </a>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  <p
                    className="mt-3 text-[11px] font-semibold uppercase tracking-[0.22em]"
                    style={{ color: "hsl(170 58% 14%)" }}
                  >
                    View details →
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p
            className="text-center font-display text-2xl"
            data-testid="account-no-orders"
          >
            No orders yet.
          </p>
        )}

        <GuestOrderLookup />
      </section>
    </SiteShell>
  );
}
