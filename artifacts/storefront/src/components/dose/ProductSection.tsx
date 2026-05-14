import { useEffect, useMemo } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  useListFeaturedProducts,
  useAddCartItem,
  getGetCartQueryKey,
  type Product,
} from "@workspace/api-client-react";
import { track } from "@/lib/analytics";
import { formatMoney, getStoredCartId, setStoredCartId, resolveProductImage } from "@/lib/cart";

const BADGE_BY_TAG: Array<{ tag: string; label: string }> = [
  { tag: "bestseller", label: "Bestseller" },
  { tag: "new", label: "New" },
  { tag: "limited", label: "Limited" },
];

function pickBadge(p: Product): string | null {
  for (const { tag, label } of BADGE_BY_TAG) {
    if (p.tags?.includes(tag)) return label;
  }
  return null;
}

function deriveFeatures(p: Product): string[] {
  const desc = p.description ?? "";
  const sentences = desc
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length >= 3) return sentences.slice(0, 3);
  if (p.tags && p.tags.length > 0) {
    return p.tags.slice(0, 3).map((t) => t.replace(/[-_]/g, " "));
  }
  return sentences;
}

export function ProductSection() {
  const baseUrl = import.meta.env.BASE_URL;
  const { data, isLoading, isError } = useListFeaturedProducts();
  const products = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const addCartItem = useAddCartItem();

  useEffect(() => {
    if (!products.length) return;
    track("view_item_list", {
      item_list_name: "The Drop",
      currency: products[0]?.currency?.toUpperCase() ?? "USD",
      items: products.map((p, i) => ({
        item_id: p.slug,
        item_name: p.name,
        price: p.priceCents / 100,
        index: i,
      })),
    });
  }, [products]);

  return (
    <section
      id="shop"
      data-testid="product-section"
      className="relative"
      style={{ background: "hsl(170 58% 14%)", color: "hsl(45 49% 90%)" }}
    >
      <div className="mx-auto max-w-7xl px-6 py-24 md:px-10 md:py-32">
        <div className="flex flex-col items-end justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-xl">
            <p className="eyebrow" style={{ color: "hsla(45,49%,90%,0.65)" }}>
              The Drop
            </p>
            <h2 className="mt-3 font-display text-5xl leading-tight md:text-6xl">
              Three drops.
              <br />
              <span className="font-display-italic" style={{ color: "hsl(42 53% 64%)" }}>
                One ritual.
              </span>
            </h2>
          </div>
          <Link
            href="/#shop"
            className="inline-flex items-center gap-2 text-sm tracking-wide hover:opacity-80"
            data-testid="link-all-products"
          >
            View all products <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-3" data-testid="product-grid">
          {isLoading && products.length === 0 && (
            <div
              className="col-span-full flex items-center justify-center py-16"
              data-testid="product-section-loading"
            >
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "hsl(42 53% 64%)" }} />
            </div>
          )}
          {isError && (
            <div
              className="col-span-full rounded-2xl border p-6 text-center text-sm"
              style={{
                background: "hsl(170 50% 18%)",
                borderColor: "hsla(45,49%,90%,0.10)",
                color: "hsla(45,49%,90%,0.85)",
              }}
              data-testid="product-section-error"
            >
              We couldn't load The Drop right now. Please refresh.
            </div>
          )}
          {!isLoading && !isError && products.length === 0 && (
            <div
              className="col-span-full rounded-2xl border p-6 text-center text-sm"
              style={{
                background: "hsl(170 50% 18%)",
                borderColor: "hsla(45,49%,90%,0.10)",
                color: "hsla(45,49%,90%,0.85)",
              }}
              data-testid="product-section-empty"
            >
              New drops coming soon.
            </div>
          )}
          {products.map((p) => {
            const badge = pickBadge(p);
            const features = deriveFeatures(p);
            const img = resolveProductImage(p.images, baseUrl);
            const isAdding =
              addCartItem.isPending &&
              addCartItem.variables?.data.productId === p.id;
            return (
              <article
                key={p.id}
                className="group flex flex-col overflow-hidden rounded-3xl border"
                style={{
                  background: "hsl(170 50% 18%)",
                  borderColor: "hsla(45,49%,90%,0.10)",
                }}
                data-testid={`product-card-${p.slug}`}
              >
                <Link
                  href={`/products/${p.slug}`}
                  className="relative block aspect-[4/5] w-full overflow-hidden"
                  data-testid={`product-link-${p.slug}`}
                  aria-label={`View ${p.name}`}
                >
                  {img ? (
                    <img
                      src={img}
                      alt={`${p.name} packaging`}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <div
                      className="h-full w-full"
                      style={{ background: "hsl(170 60% 11%)" }}
                      aria-hidden="true"
                    />
                  )}
                  {badge && (
                    <span
                      className="absolute left-4 top-4 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]"
                      style={{
                        background: "hsl(45 49% 90%)",
                        color: "hsl(170 58% 14%)",
                      }}
                    >
                      {badge}
                    </span>
                  )}
                </Link>
                <div className="flex flex-1 flex-col gap-4 p-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <h3 className="font-display text-2xl">
                        <Link
                          href={`/products/${p.slug}`}
                          className="hover:opacity-80"
                          data-testid={`product-title-${p.slug}`}
                        >
                          {p.name}
                        </Link>
                      </h3>
                      {p.shortDescription && (
                        <p
                          className="text-xs uppercase tracking-[0.22em]"
                          style={{ color: "hsla(45,49%,90%,0.88)" }}
                        >
                          {p.shortDescription}
                        </p>
                      )}
                    </div>
                    <p
                      className="font-display text-2xl"
                      style={{ color: "hsl(42 53% 64%)" }}
                      data-testid={`product-price-${p.slug}`}
                    >
                      {formatMoney(p.priceCents, p.currency)}
                    </p>
                  </div>
                  {features.length > 0 && (
                    <ul className="space-y-2">
                      {features.map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-2 text-sm"
                          style={{ color: "hsla(45,49%,90%,0.85)" }}
                        >
                          <Check
                            className="mt-0.5 h-4 w-4 flex-shrink-0"
                            style={{ color: "hsl(95 14% 67%)" }}
                          />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-auto pt-2">
                    <Button
                      className="w-full rounded-full py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
                      style={{
                        background: "hsl(42 53% 54%)",
                        color: "hsl(170 58% 14%)",
                        borderColor: "hsl(42 53% 46%)",
                      }}
                      disabled={isAdding || p.inventory <= 0}
                      data-testid={`button-add-to-cart-${p.slug}`}
                      onClick={() => {
                        const value = p.priceCents / 100;
                        const item = {
                          item_id: p.slug,
                          item_name: p.name,
                          price: value,
                          quantity: 1,
                        };
                        track("add_to_cart", {
                          currency: (p.currency ?? "usd").toUpperCase(),
                          value,
                          items: [item],
                        });
                        const cartId = getStoredCartId() ?? undefined;
                        addCartItem.mutate(
                          { data: { cartId, productId: p.id, quantity: 1 } },
                          {
                            onSuccess: (cart) => {
                              setStoredCartId(cart.id);
                              queryClient.invalidateQueries({
                                queryKey: getGetCartQueryKey({ cartId: cart.id }),
                              });
                              queryClient.invalidateQueries({
                                queryKey: getGetCartQueryKey(),
                              });
                              toast({
                                title: "Added to cart",
                                description: `${p.name} is in your cart.`,
                              });
                            },
                            onError: () => {
                              toast({
                                title: "Couldn't add to cart",
                                description: "Please try again in a moment.",
                                variant: "destructive",
                              });
                            },
                          },
                        );
                      }}
                    >
                      {p.inventory <= 0
                        ? "Sold out"
                        : isAdding
                          ? "Adding…"
                          : "Add to Cart"}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
