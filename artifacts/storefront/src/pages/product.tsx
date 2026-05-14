import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { PromoBanner } from "@/components/dose/PromoBanner";
import { Header } from "@/components/dose/Header";
import { Footer } from "@/components/dose/Footer";
import { CookieBanner } from "@/components/dose/CookieBanner";
import { AgeGate } from "@/components/dose/AgeGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Stars } from "@/components/dose/Stars";
import { Image } from "@/components/dose/Image";
import { ApiError, apiFetch, formatMoney } from "@/lib/api";
import { useAddToCart } from "@/hooks/useCart";
import NotFound from "@/pages/not-found";

type Product = {
  id: number;
  slug: string;
  name: string;
  description: string;
  shortDescription: string | null;
  priceCents: number;
  compareAtCents: number | null;
  currency: string;
  images: string[];
  inventory: number;
  averageRating: number | null;
  reviewCount: number;
};

type Review = {
  id: number;
  productId: number;
  rating: number;
  title: string;
  body: string;
  status: "pending" | "approved" | "rejected";
  verifiedPurchase: boolean;
  authorName: string | null;
  createdAt: string;
};

type ReviewsResponse = {
  items: Review[];
  averageRating: number | null;
  count: number;
};

function useProduct(slug: string) {
  return useQuery<Product, ApiError>({
    queryKey: ["product", slug],
    queryFn: () => apiFetch<Product>(`/products/${encodeURIComponent(slug)}`),
    retry: (failureCount, err) =>
      !(err instanceof ApiError && err.status === 404) && failureCount < 2,
  });
}

function useReviews(slug: string) {
  return useQuery<ReviewsResponse>({
    queryKey: ["reviews", slug],
    queryFn: () =>
      apiFetch<ReviewsResponse>(
        `/products/${encodeURIComponent(slug)}/reviews`,
      ),
  });
}

function ReviewForm({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "submitting" }
    | { state: "ok" }
    | { state: "error"; message: string }
  >({ state: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setStatus({ state: "error", message: "Add a title and a few words." });
      return;
    }
    setStatus({ state: "submitting" });
    try {
      await apiFetch(`/products/${encodeURIComponent(slug)}/reviews`, {
        method: "POST",
        body: JSON.stringify({ rating, title: title.trim(), body: body.trim() }),
      });
      setStatus({ state: "ok" });
      setTitle("");
      setBody("");
      setRating(5);
      qc.invalidateQueries({ queryKey: ["reviews", slug] });
      qc.invalidateQueries({ queryKey: ["product", slug] });
    } catch (err) {
      let message = "Couldn't submit your review.";
      if (err instanceof ApiError) {
        if (err.status === 401) {
          message = "Please sign in to leave a review.";
        } else if (err.status === 403) {
          message =
            err.message ||
            "Only verified buyers can review this product.";
        } else {
          message = err.message;
        }
      }
      setStatus({ state: "error", message });
    }
  }

  if (status.state === "ok") {
    return (
      <div
        className="rounded-2xl border p-6"
        style={{
          background: "hsla(170, 58%, 14%, 0.05)",
          borderColor: "hsla(170,58%,14%,0.1)",
        }}
        data-testid="review-success"
      >
        <p className="font-display text-lg">Thanks for your review.</p>
        <p
          className="mt-1 text-sm"
          style={{ color: "hsla(170,58%,14%,0.7)" }}
        >
          We'll publish it after a quick read by our team.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border bg-white/70 p-6"
      style={{ borderColor: "hsla(170,58%,14%,0.1)" }}
      data-testid="review-form"
    >
      <h3 className="font-display text-xl">Leave a review</h3>
      <p className="mt-1 text-xs" style={{ color: "hsla(170,58%,14%,0.6)" }}>
        Verified buyers only. We may take a day or two to publish.
      </p>
      <div className="mt-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em]">
          Rating
        </span>
        <div className="mt-2">
          <Stars
            rating={rating}
            interactive
            onChange={setRating}
            size={22}
          />
        </div>
      </div>
      <div className="mt-4">
        <label
          htmlFor="review-title"
          className="text-[11px] font-semibold uppercase tracking-[0.22em]"
        >
          Title
        </label>
        <Input
          id="review-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          className="mt-2 bg-white"
          data-testid="input-review-title"
          required
        />
      </div>
      <div className="mt-4">
        <label
          htmlFor="review-body"
          className="text-[11px] font-semibold uppercase tracking-[0.22em]"
        >
          Your review
        </label>
        <Textarea
          id="review-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          rows={4}
          className="mt-2 bg-white"
          data-testid="input-review-body"
          required
        />
      </div>
      {status.state === "error" && (
        <p
          className="mt-3 text-sm"
          style={{ color: "hsl(0 60% 35%)" }}
          data-testid="review-error"
        >
          {status.message}
        </p>
      )}
      <Button
        type="submit"
        disabled={status.state === "submitting"}
        className="mt-5 rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
        style={{
          background: "hsl(170 58% 14%)",
          color: "hsl(45 49% 90%)",
        }}
        data-testid="button-submit-review"
      >
        {status.state === "submitting" ? "Submitting…" : "Submit review"}
      </Button>
    </form>
  );
}

function formatDate(input: string | Date): string {
  try {
    return new Date(input).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export default function ProductPage() {
  const [, params] = useRoute<{ slug: string }>("/products/:slug");
  const slug = params?.slug ?? "";
  const productQuery = useProduct(slug);
  const reviewsQuery = useReviews(slug);
  const addToCart = useAddToCart();
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 2000);
    return () => clearTimeout(t);
  }, [added]);

  if (productQuery.isError && productQuery.error?.status === 404) {
    return <NotFound />;
  }

  const product = productQuery.data;

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "hsl(45 49% 90%)", color: "hsl(170 58% 14%)" }}
      data-testid="product-page"
    >
      <PromoBanner />
      <Header />
      <main id="main">
        <section className="mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-20">
          {productQuery.isLoading && (
            <p className="text-sm" data-testid="product-loading">
              Loading…
            </p>
          )}
          {product && (
            <div className="grid gap-10 md:grid-cols-2">
              <div
                className="overflow-hidden rounded-3xl"
                style={{ background: "hsla(170,58%,14%,0.05)" }}
              >
                {product.images[0] ? (
                  <Image
                    src={product.images[0]}
                    width={1200}
                    height={1500}
                    alt={product.name}
                    sizes="(min-width: 768px) 50vw, 100vw"
                    priority
                    className="h-full w-full object-cover"
                    pictureClassName="block h-full w-full"
                    data-testid="product-image"
                  />
                ) : (
                  <div className="aspect-[4/5] w-full" />
                )}
              </div>
              <div>
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                  style={{ color: "hsl(42 53% 54%)" }}
                >
                  The Drop
                </p>
                <h1
                  className="mt-3 font-display text-4xl leading-tight md:text-5xl"
                  data-testid="product-name"
                >
                  {product.name}
                </h1>
                <div className="mt-3 flex items-center gap-3">
                  <Stars rating={product.averageRating} />
                  <span
                    className="text-sm"
                    style={{ color: "hsla(170,58%,14%,0.7)" }}
                    data-testid="product-rating-summary"
                  >
                    {product.averageRating != null
                      ? `${product.averageRating.toFixed(1)} · ${product.reviewCount} review${
                          product.reviewCount === 1 ? "" : "s"
                        }`
                      : "No reviews yet"}
                  </span>
                </div>
                <p
                  className="mt-5 font-display text-3xl"
                  data-testid="product-price"
                >
                  {formatMoney(product.priceCents, product.currency)}
                </p>
                {product.shortDescription && (
                  <p className="mt-4 text-base leading-relaxed">
                    {product.shortDescription}
                  </p>
                )}
                <div className="mt-6 whitespace-pre-line text-sm leading-relaxed">
                  {product.description}
                </div>
                <Button
                  className="mt-8 w-full rounded-full py-5 text-[11px] font-semibold uppercase tracking-[0.22em] md:w-auto md:px-10"
                  style={{
                    background: "hsl(42 53% 54%)",
                    color: "hsl(170 58% 14%)",
                  }}
                  disabled={addToCart.isPending || product.inventory <= 0}
                  onClick={async () => {
                    await addToCart.mutateAsync({ productId: product.id });
                    setAdded(true);
                  }}
                  data-testid="button-add-to-cart"
                >
                  {product.inventory <= 0
                    ? "Sold out"
                    : addToCart.isPending
                      ? "Adding…"
                      : added
                        ? "Added ✓"
                        : "Add to bag"}
                </Button>
                {added && (
                  <p className="mt-3 text-sm" data-testid="added-to-cart">
                    <Link href="/cart" className="underline">
                      View bag →
                    </Link>
                  </p>
                )}
              </div>
            </div>
          )}

          <section className="mt-20" data-testid="reviews-section">
            <div className="flex items-end justify-between gap-4">
              <h2 className="font-display text-3xl md:text-4xl">Reviews</h2>
              {reviewsQuery.data && reviewsQuery.data.count > 0 && (
                <div className="flex items-center gap-3">
                  <Stars rating={reviewsQuery.data.averageRating} />
                  <span
                    className="text-sm"
                    style={{ color: "hsla(170,58%,14%,0.7)" }}
                    data-testid="reviews-summary"
                  >
                    {reviewsQuery.data.averageRating?.toFixed(1)} · {reviewsQuery.data.count} review
                    {reviewsQuery.data.count === 1 ? "" : "s"}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-8 grid gap-10 md:grid-cols-[2fr_1fr]">
              <div className="space-y-6" data-testid="reviews-list">
                {reviewsQuery.isLoading && (
                  <p className="text-sm">Loading reviews…</p>
                )}
                {reviewsQuery.data && reviewsQuery.data.items.length === 0 && (
                  <p className="text-sm" data-testid="reviews-empty">
                    No reviews yet — be the first to share your ritual.
                  </p>
                )}
                {reviewsQuery.data?.items.map((r) => (
                  <article
                    key={r.id}
                    className="rounded-2xl border bg-white/70 p-6"
                    style={{ borderColor: "hsla(170,58%,14%,0.1)" }}
                    data-testid={`review-${r.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Stars rating={r.rating} />
                      <h3 className="font-display text-lg">{r.title}</h3>
                    </div>
                    <p
                      className="mt-1 text-xs uppercase tracking-[0.18em]"
                      style={{ color: "hsla(170,58%,14%,0.6)" }}
                    >
                      {r.authorName ?? "Verified buyer"}
                      {r.verifiedPurchase ? " · Verified purchase" : ""} ·{" "}
                      {formatDate(r.createdAt)}
                    </p>
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">
                      {r.body}
                    </p>
                  </article>
                ))}
              </div>
              {slug && <ReviewForm slug={slug} />}
            </div>
          </section>
        </section>
      </main>
      <Footer />
      <CookieBanner />
      <AgeGate />
    </div>
  );
}
