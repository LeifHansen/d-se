import { Link, useParams } from "wouter";
import { useGetOrder } from "@workspace/api-client-react";
import { SiteShell } from "@/components/dose/SiteShell";
import { Seo } from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/cart";

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

export default function AccountOrderPage() {
  const params = useParams<{ id: string }>();
  const orderId = Number(params.id);
  const validId = Number.isFinite(orderId) && orderId > 0;

  const { data: order, isLoading, isError, error } = useGetOrder(
    orderId,
    undefined,
    {
      query: { enabled: validId, retry: false } as never,
    },
  );

  const unauthenticated =
    isError &&
    /401|403|unauth/i.test(error instanceof Error ? error.message : "");
  const notFound =
    isError && /404|not found/i.test(error instanceof Error ? error.message : "");

  return (
    <SiteShell testId="page-account-order">
      <Seo title={validId ? `Order #${orderId}` : "Order"} noindex />
      <section
        style={{ background: "hsl(170 58% 14%)", color: "hsl(45 49% 90%)" }}
      >
        <div className="mx-auto max-w-4xl px-6 py-12 md:px-10 md:py-16">
          <Link
            href="/account"
            className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-80 hover:opacity-100"
            data-testid="link-back-to-account"
          >
            ← Back to orders
          </Link>
          <h1 className="mt-4 font-display text-3xl leading-tight md:text-4xl">
            Order{" "}
            <span
              className="font-display-italic"
              style={{ color: "hsl(95 30% 78%)" }}
            >
              #{validId ? orderId : "—"}
            </span>
          </h1>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12 md:px-10 md:py-16">
        {!validId ? (
          <p
            role="alert"
            className="text-sm"
            style={{ color: "hsl(0 70% 35%)" }}
            data-testid="account-order-invalid"
          >
            Invalid order id.
          </p>
        ) : isLoading ? (
          <p className="opacity-70" data-testid="account-order-loading">
            Loading…
          </p>
        ) : unauthenticated ? (
          <div
            className="rounded-2xl border p-8 text-center"
            style={{
              borderColor: "hsl(40 18% 80%)",
              background: "hsl(45 50% 93%)",
            }}
            data-testid="account-order-signin"
          >
            <p className="font-display text-2xl">Sign in to view this order.</p>
            <Button
              asChild
              className="mt-5 rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{
                background: "hsl(170 58% 14%)",
                color: "hsl(45 49% 90%)",
              }}
            >
              <Link href="/account">Go to account</Link>
            </Button>
          </div>
        ) : notFound ? (
          <p
            className="text-center font-display text-2xl"
            data-testid="account-order-not-found"
          >
            Order not found.
          </p>
        ) : isError ? (
          <p
            role="alert"
            className="text-sm"
            style={{ color: "hsl(0 70% 35%)" }}
            data-testid="account-order-error"
          >
            {error instanceof Error ? error.message : "Couldn't load order."}
          </p>
        ) : order ? (
          <div className="space-y-8">
            <div
              className="rounded-2xl border bg-card p-6"
              style={{ borderColor: "hsl(40 18% 80%)" }}
              data-testid="order-summary"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p
                    className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                    style={{ color: "hsl(170 18% 32%)" }}
                  >
                    Placed {formatDate(order.createdAt)}
                  </p>
                  <p
                    className="mt-1 text-xs uppercase tracking-[0.18em]"
                    style={{ color: "hsl(170 18% 32%)" }}
                    data-testid="order-status"
                  >
                    Status: {order.status}
                  </p>
                </div>
                <p className="font-display text-2xl" data-testid="order-total">
                  {formatMoney(order.totalCents, order.currency)}
                </p>
              </div>
            </div>

            <div
              className="rounded-2xl border bg-card p-6"
              style={{ borderColor: "hsl(40 18% 80%)" }}
            >
              <h2 className="font-display text-xl">Items</h2>
              <ul
                className="mt-4 divide-y"
                style={{ borderColor: "hsl(40 18% 86%)" }}
                data-testid="order-items"
              >
                {order.items.map((it) => (
                  <li
                    key={it.id}
                    className="flex items-center justify-between gap-4 py-3 text-sm"
                  >
                    <span>
                      {it.productName}{" "}
                      <span className="opacity-70">× {it.quantity}</span>
                    </span>
                    <span>
                      {formatMoney(it.priceCents * it.quantity, order.currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <dl
                className="mt-5 space-y-1 text-sm"
                style={{ color: "hsl(170 18% 28%)" }}
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
                  <div className="flex justify-between">
                    <dt>
                      Discount{order.discountCode ? ` (${order.discountCode})` : ""}
                    </dt>
                    <dd>−{formatMoney(order.discountCents, order.currency)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between pt-2 font-display text-base text-foreground">
                  <dt>Total</dt>
                  <dd>{formatMoney(order.totalCents, order.currency)}</dd>
                </div>
              </dl>
            </div>

            <div
              className="grid gap-6 md:grid-cols-2"
              data-testid="order-fulfillment"
            >
              <div
                className="rounded-2xl border bg-card p-6"
                style={{ borderColor: "hsl(40 18% 80%)" }}
              >
                <h2 className="font-display text-xl">Shipping</h2>
                {order.shippingAddress ? (
                  <address
                    className="mt-3 not-italic text-sm leading-relaxed"
                    style={{ color: "hsl(170 18% 28%)" }}
                    data-testid="order-shipping-address"
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
                    {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
                    {order.shippingAddress.zip}
                    <br />
                    {order.shippingAddress.country}
                  </address>
                ) : (
                  <p
                    className="mt-3 text-sm"
                    style={{ color: "hsl(170 18% 32%)" }}
                  >
                    No shipping address on file.
                  </p>
                )}
              </div>

              <div
                className="rounded-2xl border bg-card p-6"
                style={{ borderColor: "hsl(40 18% 80%)" }}
              >
                <h2 className="font-display text-xl">Tracking</h2>
                {order.trackingCode ? (
                  <div className="mt-3 text-sm" data-testid="order-tracking">
                    <p>
                      {order.carrier ? `${order.carrier}: ` : "Tracking number: "}
                      <code className="break-all">{order.trackingCode}</code>
                    </p>
                    {order.trackingUrl ? (
                      <a
                        href={order.trackingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block underline"
                        data-testid="order-tracking-link"
                      >
                        Track your package →
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <p
                    className="mt-3 text-sm"
                    style={{ color: "hsl(170 18% 32%)" }}
                    data-testid="order-tracking-pending"
                  >
                    Tracking will appear here once your order ships.
                  </p>
                )}
                {order.labelUrl ? (
                  <a
                    href={order.labelUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block text-sm underline"
                    data-testid="order-label-link"
                  >
                    View shipping label
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </SiteShell>
  );
}
