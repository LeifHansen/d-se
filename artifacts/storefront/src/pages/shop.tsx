import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PromoBanner } from "@/components/dose/PromoBanner";
import { Header } from "@/components/dose/Header";
import { Footer } from "@/components/dose/Footer";
import { CookieBanner } from "@/components/dose/CookieBanner";
import { AgeGate } from "@/components/dose/AgeGate";
import { Stars } from "@/components/dose/Stars";
import { Image } from "@/components/dose/Image";
import { apiFetch, formatMoney } from "@/lib/api";

type ProductSummary = {
  id: number;
  slug: string;
  name: string;
  shortDescription: string | null;
  priceCents: number;
  currency: string;
  images: string[];
  inventory: number;
  averageRating: number | null;
  reviewCount: number;
};

export default function ShopPage() {
  const products = useQuery<ProductSummary[]>({
    queryKey: ["products"],
    queryFn: () => apiFetch<ProductSummary[]>(`/products`),
  });

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "hsl(45 49% 90%)", color: "hsl(170 58% 14%)" }}
      data-testid="shop-page"
    >
      <PromoBanner />
      <Header />
      <main id="main">
        <section className="mx-auto max-w-7xl px-6 py-16 md:px-10 md:py-20">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "hsl(42 53% 54%)" }}
          >
            The Drop
          </p>
          <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">
            Shop all
          </h1>

          {products.isLoading && (
            <p className="mt-10 text-sm" data-testid="shop-loading">
              Loading…
            </p>
          )}
          {products.isError && (
            <p
              className="mt-10 text-sm"
              style={{ color: "hsl(0 60% 35%)" }}
              data-testid="shop-error"
            >
              We couldn't load the shop right now.
            </p>
          )}

          {products.data && products.data.length === 0 && (
            <p className="mt-10 text-sm" data-testid="shop-empty">
              Nothing in the shop yet.
            </p>
          )}

          {products.data && products.data.length > 0 && (
            <ul className="mt-10 grid gap-8 md:grid-cols-3" data-testid="product-grid">
              {products.data.map((p) => (
                <li
                  key={p.id}
                  className="overflow-hidden rounded-3xl border bg-white/70"
                  style={{ borderColor: "hsla(170,58%,14%,0.1)" }}
                  data-testid={`product-card-${p.slug}`}
                >
                  <Link href={`/products/${p.slug}`}>
                    <div className="relative aspect-[4/5] w-full overflow-hidden bg-black/5">
                      {p.images[0] && (
                        <Image
                          src={p.images[0]}
                          width={800}
                          height={1000}
                          alt={p.name}
                          sizes="(min-width: 768px) 30vw, 90vw"
                          className="h-full w-full object-cover"
                          pictureClassName="block h-full w-full"
                        />
                      )}
                    </div>
                  </Link>
                  <div className="flex flex-col gap-2 p-5">
                    <Link
                      href={`/products/${p.slug}`}
                      className="font-display text-2xl hover:underline"
                    >
                      {p.name}
                    </Link>
                    <div className="flex items-center gap-2">
                      <Stars rating={p.averageRating} size={14} />
                      <span
                        className="text-xs"
                        style={{ color: "hsla(170,58%,14%,0.65)" }}
                        data-testid={`product-rating-${p.slug}`}
                      >
                        {p.averageRating != null
                          ? `${p.averageRating.toFixed(1)} (${p.reviewCount})`
                          : "No reviews yet"}
                      </span>
                    </div>
                    {p.shortDescription && (
                      <p
                        className="text-sm"
                        style={{ color: "hsla(170,58%,14%,0.75)" }}
                      >
                        {p.shortDescription}
                      </p>
                    )}
                    <p className="mt-2 font-display text-xl">
                      {formatMoney(p.priceCents, p.currency)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <Footer />
      <CookieBanner />
      <AgeGate />
    </div>
  );
}
