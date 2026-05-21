import { useMemo } from "react";
import { Link, useSearch } from "wouter";
import { ArrowRight } from "lucide-react";
import { useListProducts } from "@workspace/api-client-react";
import { SiteShell } from "@/components/dose/SiteShell";
import { Seo } from "@/components/seo/Seo";
import { formatMoney } from "@/lib/cart";
import { Stars } from "@/components/dose/Stars";
import { Image } from "@/components/dose/Image";
import { parseTagsFromSearch, buildShopHref, toggleTag } from "@/lib/tagFilter";

export default function Shop() {
  const search = useSearch();
  const activeTags = useMemo(() => parseTagsFromSearch(search), [search]);

  const { data: allProducts } = useListProducts();
  const { data, isLoading, isError, error, refetch } = useListProducts(
    activeTags.length > 0 ? { tags: activeTags.join(",") } : undefined,
  );

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of allProducts ?? []) {
      for (const t of p.tags ?? []) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allProducts]);

  return (
    <SiteShell testId="page-shop">
      <Seo
        title="Shop"
        description="The full DŌSE collection — precision THC droppers, wellness elixirs, and ritual essentials."
      />
      <section
        style={{ background: "hsl(166 95% 19%)", color: "hsl(45 49% 90%)" }}
      >
        <div className="mx-auto max-w-7xl px-6 py-20 md:px-10 md:py-28">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "hsl(42 53% 64%)" }}
          >
            The Collection
          </p>
          <h1 className="mt-3 font-display text-5xl leading-tight md:text-6xl">
            Every drop,
            <br />
            <span
              className="font-display-italic"
              style={{ color: "hsl(95 30% 78%)" }}
            >
              dialed in.
            </span>
          </h1>
          <p
            className="mt-6 max-w-xl text-base md:text-lg"
            style={{ color: "hsla(45,49%,90%,0.78)" }}
          >
            Hemp-derived, lab-verified, and small-batch made. Browse the
            full lineup and find your ritual.
          </p>
        </div>
      </section>

      <section
        className="bg-background"
        style={{ color: "hsl(166 95% 19%)" }}
      >
        <div className="mx-auto max-w-7xl px-6 py-16 md:px-10 md:py-24">
          {allTags.length > 0 ? (
            <div
              className="mb-10 flex flex-wrap items-center gap-2"
              data-testid="shop-tag-filter"
              aria-label="Filter products by tag"
            >
              <Link
                href={buildShopHref([])}
                className="inline-flex items-center rounded-full border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] transition-colors"
                style={
                  activeTags.length === 0
                    ? {
                        background: "hsl(166 95% 19%)",
                        color: "hsl(45 49% 90%)",
                        borderColor: "hsl(166 95% 19%)",
                      }
                    : {
                        background: "transparent",
                        color: "hsl(166 95% 19%)",
                        borderColor: "hsl(40 18% 80%)",
                      }
                }
                aria-pressed={activeTags.length === 0}
                data-testid="shop-tag-all"
              >
                All
              </Link>
              {allTags.map((t) => {
                const isActive = activeTags.includes(t);
                const nextTags = toggleTag(activeTags, t);
                return (
                  <Link
                    key={t}
                    href={buildShopHref(nextTags)}
                    className="inline-flex items-center rounded-full border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] transition-colors"
                    style={
                      isActive
                        ? {
                            background: "hsl(166 95% 19%)",
                            color: "hsl(45 49% 90%)",
                            borderColor: "hsl(166 95% 19%)",
                          }
                        : {
                            background: "transparent",
                            color: "hsl(166 95% 19%)",
                            borderColor: "hsl(40 18% 80%)",
                          }
                    }
                    aria-pressed={isActive}
                    data-testid={`shop-tag-${t}`}
                  >
                    {t}
                  </Link>
                );
              })}
            </div>
          ) : null}
          {isLoading ? (
            <div
              className="grid gap-8 md:grid-cols-3"
              data-testid="shop-loading"
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="aspect-[4/5] w-full animate-pulse rounded-3xl"
                  style={{ background: "hsl(40 30% 88%)" }}
                />
              ))}
            </div>
          ) : isError ? (
            <div
              role="alert"
              className="rounded-2xl border p-8 text-center"
              style={{
                borderColor: "hsl(40 18% 80%)",
                background: "hsl(45 50% 93%)",
              }}
              data-testid="shop-error"
            >
              <p className="font-display text-2xl">
                We couldn't load the shop.
              </p>
              <p className="mt-2 text-sm opacity-80">
                {error instanceof Error ? error.message : "Please try again."}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.22em]"
                style={{
                  background: "hsl(166 95% 19%)",
                  color: "hsl(45 49% 90%)",
                }}
              >
                Try again
              </button>
            </div>
          ) : data && data.length > 0 ? (
            <div
              className="grid gap-8 md:grid-cols-2 lg:grid-cols-3"
              data-testid="shop-grid"
            >
              {data.map((p) => (
                <Link
                  key={p.id}
                  href={`/products/${p.slug}`}
                  className="group flex flex-col overflow-hidden rounded-3xl border bg-card transition-shadow hover:shadow-lg"
                  style={{ borderColor: "hsl(40 18% 80%)" }}
                  data-testid={`product-card-${p.slug}`}
                >
                  <div
                    className="relative aspect-[4/5] w-full overflow-hidden"
                    style={{ background: "hsl(40 30% 88%)" }}
                  >
                    {p.images[0] && (
                      <Image
                        src={p.images[0]}
                        width={800}
                        height={1000}
                        alt={p.name}
                        sizes="(min-width: 768px) 30vw, 90vw"
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                        pictureClassName="block h-full w-full"
                      />
                    )}
                    {p.featured ? (
                      <span
                        className="absolute left-4 top-4 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]"
                        style={{
                          background: "hsl(42 53% 54%)",
                          color: "hsl(166 95% 19%)",
                        }}
                      >
                        Featured
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-6">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <h2 className="font-display text-2xl">{p.name}</h2>
                        <p
                          className="font-display text-xl"
                          style={{ color: "hsl(166 95% 19%)" }}
                        >
                          {formatMoney(p.priceCents, p.currency)}
                        </p>
                      </div>
                      {p.averageRating != null && (
                        <div className="flex items-center gap-2">
                          <Stars rating={p.averageRating} size={14} />
                        </div>
                      )}
                    </div>
                    {p.shortDescription ? (
                      <p
                        className="text-sm leading-relaxed"
                        style={{ color: "hsl(170 18% 32%)" }}
                      >
                        {p.shortDescription}
                      </p>
                    ) : null}
                    <span
                      className="mt-auto inline-flex items-center gap-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.22em]"
                      style={{ color: "hsl(42 53% 54%)" }}
                    >
                      View product <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p
              className="text-center font-display text-2xl"
              data-testid="shop-empty"
            >
              {activeTags.length > 0
                ? `No products match ${activeTags
                    .map((t) => `"${t}"`)
                    .join(" + ")} yet.`
                : "No products available yet — check back soon."}
            </p>
          )}
        </div>
      </section>
    </SiteShell>
  );
}
