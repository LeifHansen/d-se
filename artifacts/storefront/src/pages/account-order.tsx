import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetOrder,
  useReorder,
  getGetCartQueryKey,
} from "@workspace/api-client-react";
import { SiteShell } from "@/components/dose/SiteShell";
import { OrderTracking } from "@/components/dose/OrderTracking";
import { OrderStatusBadge } from "@/components/dose/OrderStatusBadge";
import { Seo } from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";
import {
  formatMoney,
  getStoredCartId,
  setStoredCartId,
  requestOpenCartDrawer,
} from "@/lib/cart";
import { useToast } from "@/hooks/use-toast";

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

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const reorderMutation = useReorder();

  const availableItemCount =
    order?.items.filter((it) => it.available).length ?? 0;
  const nothingPurchasable =
    !!order && order.items.length > 0 && availableItemCount === 0;

  const handleReorder = () => {
    if (!validId) return;
    reorderMutation.mutate(
      { id: orderId, data: { cartId: getStoredCartId() } },
      {
        onSuccess: ({ cart, skipped }) => {
          if (cart?.id) setStoredCartId(cart.id);
          queryClient.invalidateQueries({
            queryKey: getGetCartQueryKey({ cartId: cart?.id }),
          });
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
          const added = (order?.items.length ?? 0) - skipped.length;
          if (added <= 0) {
            toast({
              title: "Nothing could be reordered",
              description:
                skipped.length > 0
                  ? `${skipped.map((s) => s.productName).join(", ")} ${skipped.length === 1 ? "is" : "are"} no longer available.`
                  : "This order has no items to reorder.",
              variant: "destructive",
            });
            return;
          }
          if (skipped.length > 0) {
            toast({
              title: "Some items were skipped",
              description: `${skipped.map((s) => `${s.productName} (${s.reason === "out_of_stock" ? "out of stock" : "unavailable"})`).join("; ")}.`,
            });
          } else {
            toast({
              title: "Added to cart",
              description: "Your past order is back in your cart.",
            });
          }
          requestOpenCartDrawer();
        },
        onError: () => {
          toast({
            title: "Couldn't reorder",
            description: "Please try again in a moment.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const unauthenticated =
    isError &&
    /401|403|unauth/i.test(error instanceof Error ? error.message : "");
  const notFound =
    isError && /404|not found/i.test(error instanceof Error ? error.message : "");

  return (
    <SiteShell testId="page-account-order">
      <Seo
        title={validId ? `Order #${orderId}` : "Order"}
        description={
          validId
            ? `Order #${orderId} details, status, and tracking.`
            : "Order details, status, and tracking."
        }
        noindex
      />
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
                  <div className="mt-2" data-testid="order-status">
                    <OrderStatusBadge
                      status={order.status}
                      testId="order-status-badge"
                    />
                  </div>
                </div>
                <p className="font-display text-2xl" data-testid="order-total">
                  {formatMoney(order.totalCents, order.currency)}
                </p>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={handleReorder}
                  disabled={
                    reorderMutation.isPending ||
                    order.items.length === 0 ||
                    nothingPurchasable
                  }
                  className="rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
                  style={{
                    background: "hsl(170 58% 14%)",
                    color: "hsl(45 49% 90%)",
                  }}
                  data-testid="button-reorder"
                >
                  {reorderMutation.isPending ? "Adding to cart…" : "Reorder"}
                </Button>
                <span
                  className="text-xs"
                  style={{ color: "hsl(170 18% 32%)" }}
                  data-testid="reorder-hint"
                >
                  {nothingPurchasable
                    ? "None of these items are available right now."
                    : "Adds the same items to your current cart."}
                </span>
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

              <OrderTracking order={order} />
            </div>
          </div>
        ) : null}
      </section>
    </SiteShell>
  );
}
