import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Trash2 } from "lucide-react";
import {
  useGetCart,
  useUpdateCartItem,
  useRemoveCartItem,
  getGetCartQueryKey,
} from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useStoredCartId } from "@/lib/cart";
import { formatMoney } from "@/lib/api";

const CREAM = "hsl(45 49% 90%)";
const FOREST = "hsl(170 58% 14%)";
const GOLD = "hsl(42 53% 54%)";

export function CartDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const cartId = useStoredCartId();
  const qc = useQueryClient();
  const cartParams = { cartId: cartId ?? undefined };
  const cartQuery = useGetCart(cartParams, {
    query: { enabled: !!cartId } as never,
  });
  const cart = cartQuery.data;
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getGetCartQueryKey(cartParams) });
  const update = useUpdateCartItem({
    mutation: { onSuccess: () => invalidate() },
  });
  const remove = useRemoveCartItem({
    mutation: { onSuccess: () => invalidate() },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-0 p-0 sm:max-w-md"
        style={{ background: CREAM, color: FOREST }}
        data-testid="cart-drawer"
      >
        <SheetHeader
          className="border-b px-6 py-5"
          style={{ borderColor: "hsla(170,58%,14%,0.10)" }}
        >
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: GOLD }}
          >
            Your bag
          </p>
          <SheetTitle
            className="font-display text-2xl"
            style={{ color: FOREST }}
          >
            Cart
          </SheetTitle>
        </SheetHeader>

        {cartQuery.isLoading && (
          <div className="px-6 py-8 text-sm" data-testid="cart-drawer-loading">
            Loading your bag…
          </div>
        )}

        {(!cart || cart.items.length === 0) && !cartQuery.isLoading && (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
            data-testid="cart-drawer-empty"
          >
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: GOLD }}
            >
              Empty
            </p>
            <h3 className="font-display text-2xl">Your bag is empty.</h3>
            <p
              className="max-w-xs text-sm"
              style={{ color: "hsla(170,58%,14%,0.6)" }}
            >
              Add a tonic to get started — every order ships free over $60.
            </p>
            <Link href="/shop" onClick={() => onOpenChange(false)}>
              <Button
                className="mt-2 rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
                style={{ background: FOREST, color: CREAM }}
                data-testid="cart-drawer-shop"
              >
                Shop the drop
              </Button>
            </Link>
          </div>
        )}

        {cart && cart.items.length > 0 && cartId && (
          <>
            <ul
              className="flex-1 divide-y overflow-y-auto px-6"
              style={{ borderColor: "hsla(170,58%,14%,0.10)" }}
              data-testid="cart-drawer-items"
            >
              {cart.items.map((it) => (
                <li
                  key={it.id}
                  className="flex gap-4 py-5"
                  data-testid={`cart-drawer-item-${it.id}`}
                >
                  {it.product.images[0] ? (
                    <img
                      src={it.product.images[0]}
                      alt={it.product.name}
                      className="h-20 w-20 flex-shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-20 w-20 flex-shrink-0 rounded-lg bg-black/5" />
                  )}
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`/products/${it.product.slug}`}
                          onClick={() => onOpenChange(false)}
                          className="font-display text-base hover:underline"
                        >
                          {it.product.name}
                        </Link>
                        <p
                          className="text-[10px] uppercase tracking-[0.18em]"
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
                          remove.mutate({
                            itemId: it.id,
                            params: { cartId },
                          })
                        }
                        data-testid={`cart-drawer-remove-${it.id}`}
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
                              data: {
                                cartId,
                                quantity: Math.max(0, it.quantity - 1),
                              },
                            })
                          }
                          data-testid={`cart-drawer-decrease-${it.id}`}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span
                          className="min-w-[2ch] text-center text-sm"
                          data-testid={`cart-drawer-qty-${it.id}`}
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
                              data: {
                                cartId,
                                quantity: it.quantity + 1,
                              },
                            })
                          }
                          data-testid={`cart-drawer-increase-${it.id}`}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="font-display text-base">
                        {formatMoney(it.lineTotalCents, cart.currency)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div
              className="border-t px-6 py-5"
              style={{ borderColor: "hsla(170,58%,14%,0.10)" }}
              data-testid="cart-drawer-summary"
            >
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt>Subtotal</dt>
                  <dd data-testid="cart-drawer-subtotal">
                    {formatMoney(cart.subtotalCents, cart.currency)}
                  </dd>
                </div>
                {cart.discountCode && (cart.discountCents ?? 0) > 0 && (
                  <div
                    className="flex justify-between"
                    data-testid="cart-drawer-discount"
                  >
                    <dt>
                      Discount{" "}
                      <span
                        className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
                        style={{ background: FOREST, color: CREAM }}
                      >
                        {cart.discountCode}
                      </span>
                    </dt>
                    <dd>
                      −{formatMoney(cart.discountCents ?? 0, cart.currency)}
                    </dd>
                  </div>
                )}
                <div
                  className="flex justify-between border-t pt-3 font-display text-lg"
                  style={{ borderColor: "hsla(170,58%,14%,0.10)" }}
                >
                  <dt>Total</dt>
                  <dd data-testid="cart-drawer-total">
                    {formatMoney(
                      cart.totalCents ?? cart.subtotalCents,
                      cart.currency,
                    )}
                  </dd>
                </div>
              </dl>
              <p
                className="mt-2 text-[11px]"
                style={{ color: "hsla(170,58%,14%,0.6)" }}
              >
                Shipping &amp; taxes calculated at checkout.
              </p>
              <Link href="/checkout" onClick={() => onOpenChange(false)}>
                <Button
                  className="mt-4 w-full rounded-full py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
                  style={{ background: GOLD, color: FOREST }}
                  data-testid="cart-drawer-checkout"
                >
                  Checkout
                </Button>
              </Link>
              <Link href="/cart" onClick={() => onOpenChange(false)}>
                <Button
                  variant="ghost"
                  className="mt-2 w-full rounded-full py-4 text-[11px] font-semibold uppercase tracking-[0.22em]"
                  style={{ color: FOREST }}
                  data-testid="cart-drawer-view-cart"
                >
                  View full cart
                </Button>
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
