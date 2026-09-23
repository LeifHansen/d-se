import { useEffect, useMemo } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  useListFeaturedProducts,
  useAddCartItem,
  getGetCartQueryKey,
  type Product,
} from "@workspace/api-client-react";
import { track } from "@/lib/analytics";
import {
  formatMoney,
  getStoredCartId,
  setStoredCartId,
  resolveProductImage,
} from "@/lib/cart";
import { ImagePlaceholder } from "./ImagePlaceholder";

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
  if (sentences.length >= 3) return sentences.slice(0, 4);
  if (p.tags && p.tags.length > 0) {
    return p.tags.slice(0, 4).map((t) => t.replace(/[-_]/g, " "));
  }
  return sentences;
}

/**
 * The single SKU, shown large on the homepage right after the about section.
 * Reads the featured list and shows the first product only — DŌSE sells one
 * bottle, so there is no grid.
 */
export function FeaturedProduct() {
  const baseUrl = import.meta.env.BASE_URL;
  const { data, isLoading, isError } = useListFeaturedProducts();
  const product = useMemo<Product | null>(
    () => (Array.isArray(data) && data.length > 0 ? data[0] : null),
    [data],
  );
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const addCartItem = useAddCartItem();

  useEffect(() => {
    if (!product) return;
    track("view_item_list", {
      item_list_name: "The Product",
      currency: product.currency?.toUpperCase() ?? "USD",
      items: [
        {
          item_id: product.slug,
          item_name: product.name,
          price: product.priceCents / 100,
        },
      ],
    });
  }, [product]);

  function handleAdd(p: Product) {
    const value = p.priceCents / 100;
    track("add_to_cart", {
      currency: (p.currency ?? "usd").toUpperCase(),
      value,
      items: [{ item_id: p.slug, item_name: p.name, price: value, quantity: 1 }],
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
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
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
  }

  const isAdding = addCartItem.isPending;

  return (
    <section
      id="product"
      data-testid="product-section"
      className="grain grain-dark relative overflow-hidden bg-ink text-white"
    >
      {/* Spray mist */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 -top-24 h-[34rem] w-[34rem] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, hsl(var(--turquoise) / 0.35), transparent)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -right-32 h-[30rem] w-[30rem] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, hsl(var(--pink) / 0.35), transparent)",
        }}
      />
      <div
        aria-hidden="true"
        className="watermark watermark-white -right-3 top-2 text-[30vw] md:text-[18vw]"
        data-watermark="DŌSE"
      />

      <div className="relative mx-auto max-w-7xl px-6 py-20 md:px-10 md:py-28">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <p className="eyebrow text-turquoise-bright">The product · one bottle</p>
            <h2 className="mt-4 font-display text-6xl leading-[0.92] md:text-7xl">
              One bottle.{" "}
              <span className="font-display-italic text-pink-soft">
                Total control.
              </span>
            </h2>
          </div>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80 transition-colors hover:text-turquoise-bright"
            data-testid="link-all-products"
          >
            View in shop <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {/* States */}
        {isLoading && !product && (
          <div
            className="mt-14 flex items-center justify-center py-16"
            data-testid="product-section-loading"
          >
            <Loader2
              className="h-6 w-6 animate-spin text-turquoise-bright"
              aria-label="Loading product"
            />
          </div>
        )}
        {isError && (
          <div
            className="mt-14 rounded-2xl border border-white/10 bg-ink-soft p-6 text-center text-sm text-white/85"
            data-testid="product-section-error"
          >
            We couldn't load the product right now. Please refresh.
          </div>
        )}
        {!isLoading && !isError && !product && (
          <div
            className="mt-14 rounded-2xl border border-white/10 bg-ink-soft p-6 text-center text-sm text-white/85"
            data-testid="product-section-empty"
          >
            Coming soon.
          </div>
        )}

        {product &&
          (() => {
            const p = product;
            const badge = pickBadge(p);
            const features = deriveFeatures(p);
            const img = resolveProductImage(p.images, baseUrl);
            const soldOut = p.inventory <= 0;
            return (
              <article
                className="mt-14 grid overflow-hidden rounded-[2rem] border border-white/10 bg-ink-soft shadow-2xl md:grid-cols-2"
                data-testid={`product-card-${p.slug}`}
              >
                <Link
                  href={`/products/${p.slug}`}
                  className="relative block aspect-square w-full overflow-hidden md:aspect-auto md:min-h-[30rem]"
                  data-testid={`product-link-${p.slug}`}
                  aria-label={`View ${p.name}`}
                >
                  {img ? (
                    <img
                      src={img}
                      alt={`${p.name} — DŌSE beverage dropper`}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 hover:scale-[1.03]"
                    />
                  ) : (
                    <ImagePlaceholder
                      tone="dark"
                      label="Product packshot"
                      hint="Replace · 1500 × 1500"
                      slug="home-product"
                      aspect="auto"
                      className="absolute inset-0 h-full rounded-none border-0"
                    />
                  )}
                  {badge && (
                    <span className="sticker absolute left-5 top-5">{badge}</span>
                  )}
                </Link>

                <div className="flex flex-col gap-7 p-8 md:p-12">
                  <div>
                    <p className="eyebrow text-turquoise-bright">The dropper</p>
                    <h3 className="mt-3 font-display text-5xl leading-[0.92] md:text-6xl">
                      <Link
                        href={`/products/${p.slug}`}
                        className="transition-colors hover:text-turquoise-bright"
                        data-testid={`product-title-${p.slug}`}
                      >
                        {p.name}
                      </Link>
                    </h3>
                    {p.shortDescription && (
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-white/75">
                        {p.shortDescription}
                      </p>
                    )}
                  </div>

                  <p
                    className="font-display text-5xl text-turquoise-bright"
                    data-testid={`product-price-${p.slug}`}
                  >
                    {formatMoney(p.priceCents, p.currency)}
                  </p>

                  {features.length > 0 && (
                    <ul className="space-y-2.5">
                      {features.map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-2.5 text-sm text-white/85"
                        >
                          <Check
                            className="mt-0.5 h-4 w-4 flex-shrink-0 text-turquoise-bright"
                            aria-hidden="true"
                          />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-auto pt-2">
                    <button
                      type="button"
                      className="cta cta-pink cta-block"
                      disabled={isAdding || soldOut}
                      data-testid={`button-add-to-cart-${p.slug}`}
                      onClick={() => handleAdd(p)}
                    >
                      {soldOut ? "Sold out" : isAdding ? "Adding…" : "Add to Cart"}
                    </button>
                    <p className="mt-3 text-center text-[11px] uppercase tracking-[0.18em] text-white/65">
                      Free shipping over $60 · Every batch lab-tested
                    </p>
                  </div>
                </div>
              </article>
            );
          })()}
      </div>
    </section>
  );
}
