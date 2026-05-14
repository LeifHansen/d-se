import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Check, FileText, Star } from "lucide-react";
import {
  useGetProductBySlug,
  useAddCartItem,
  useListProductReviews,
  useSubmitProductReview,
  getGetCartQueryKey,
  getListProductReviewsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { SiteShell } from "@/components/dose/SiteShell";
import { Seo } from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Stars } from "@/components/dose/Stars";
import { track } from "@/lib/analytics";
import { Image } from "@/components/dose/Image";
import {
  getStoredCartId,
  setStoredCartId,
  formatMoney,
} from "@/lib/cart";

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

function ReviewForm({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const submit = useSubmitProductReview();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "ok" }
    | { state: "error"; message: string }
  >({ state: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setStatus({ state: "error", message: "Add a title and a few words." });
      return;
    }
    try {
      await submit.mutateAsync({
        slug,
        data: { rating, title: title.trim(), body: body.trim() },
      });
      setStatus({ state: "ok" });
      setTitle("");
      setBody("");
      setRating(5);
      qc.invalidateQueries({ queryKey: getListProductReviewsQueryKey(slug) });
    } catch (err) {
      const e = err as { status?: number; message?: string };
      let message = e?.message ?? "Couldn't submit your review.";
      if (e?.status === 401) message = "Please sign in to leave a review.";
      else if (e?.status === 403)
        message = e.message || "Only verified buyers can review this product.";
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
        disabled={submit.isPending}
        className="mt-5 rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
        style={{
          background: "hsl(170 58% 14%)",
          color: "hsl(45 49% 90%)",
        }}
        data-testid="button-submit-review"
      >
        {submit.isPending ? "Submitting…" : "Submit review"}
      </Button>
    </form>
  );
}

export default function ProductPage() {
  const [, params] = useRoute<{ slug: string }>("/products/:slug");
  const slug = params?.slug ?? "";
  const { data: product, isLoading, isError } = useGetProductBySlug(slug, {
    query: { enabled: !!slug } as never,
  });
  const reviewsQuery = useListProductReviews(slug, {
    query: { enabled: !!slug } as never,
  });
  const queryClient = useQueryClient();
  const addItem = useAddCartItem();

  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!product) return;
    track("view_item", {
      currency: (product.currency ?? "usd").toUpperCase(),
      value: product.priceCents / 100,
      items: [
        {
          item_id: String(product.id),
          item_name: product.name,
          price: product.priceCents / 100,
          quantity: 1,
        },
      ],
    });
  }, [product]);

  const handleAdd = async () => {
    if (!product) return;
    setAdding(true);
    setErrorMsg(null);
    try {
      const result = await addItem.mutateAsync({
        data: {
          cartId: getStoredCartId() ?? undefined,
          productId: product.id,
          quantity,
        },
      });
      if (result?.id) setStoredCartId(result.id);
      await queryClient.invalidateQueries({
        queryKey: getGetCartQueryKey({ cartId: result?.id }),
      });
      track("add_to_cart", {
        currency: (product.currency ?? "usd").toUpperCase(),
        value: (product.priceCents / 100) * quantity,
        items: [
          {
            item_id: String(product.id),
            item_name: product.name,
            price: product.priceCents / 100,
            quantity,
          },
        ],
      });
      setAdded(true);
      setTimeout(() => setAdded(false), 2200);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Couldn't add to cart.",
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <SiteShell testId="page-product">
      <Seo
        title={product?.seoTitle ?? product?.name ?? "Product"}
        description={
          product?.seoDescription ?? product?.shortDescription ?? undefined
        }
        type="product"
        image={product?.images?.[0] ?? undefined}
      />
      <div className="mx-auto max-w-7xl px-6 pt-8 md:px-10">
        <Link
          href="/shop"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: "hsl(170 18% 32%)" }}
          data-testid="link-back-to-shop"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to shop
        </Link>
      </div>

      {isLoading ? (
        <div
          className="mx-auto grid max-w-7xl gap-12 px-6 py-12 md:grid-cols-2 md:px-10 md:py-16"
          data-testid="product-loading"
        >
          <div
            className="aspect-square w-full animate-pulse rounded-3xl"
            style={{ background: "hsl(40 30% 88%)" }}
          />
          <div className="space-y-4">
            <div
              className="h-8 w-3/4 animate-pulse rounded"
              style={{ background: "hsl(40 30% 88%)" }}
            />
            <div
              className="h-4 w-1/2 animate-pulse rounded"
              style={{ background: "hsl(40 30% 88%)" }}
            />
          </div>
        </div>
      ) : isError || !product ? (
        <div
          className="mx-auto max-w-3xl px-6 py-24 text-center md:px-10"
          data-testid="product-error"
        >
          <h1 className="font-display text-4xl">Product not found.</h1>
          <p className="mt-3 text-sm" style={{ color: "hsl(170 18% 32%)" }}>
            That dropper has evaporated. Browse the full collection instead.
          </p>
          <Button
            asChild
            className="mt-6 rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{
              background: "hsl(170 58% 14%)",
              color: "hsl(45 49% 90%)",
            }}
          >
            <Link href="/shop">Visit the shop</Link>
          </Button>
        </div>
      ) : (
        <>
          <section
            className="mx-auto grid max-w-7xl gap-12 px-6 py-12 md:grid-cols-2 md:gap-16 md:px-10 md:py-16"
            data-testid="product-detail"
          >
            <div className="space-y-4">
              <div
                className="aspect-square w-full overflow-hidden rounded-3xl border"
                style={{
                  background: "hsl(40 30% 88%)",
                  borderColor: "hsl(40 18% 80%)",
                }}
              >
                {product.images[activeImage] ? (
                  <Image
                    src={product.images[activeImage]}
                    width={1200}
                    height={1500}
                    alt={product.name}
                    sizes="(min-width: 768px) 50vw, 100vw"
                    priority
                    className="h-full w-full object-cover"
                    pictureClassName="block h-full w-full"
                    data-testid="product-image-main"
                  />
                ) : null}
              </div>
              {product.images.length > 1 ? (
                <div className="grid grid-cols-4 gap-3">
                  {product.images.map((src, i) => (
                    <button
                      key={src + i}
                      type="button"
                      onClick={() => setActiveImage(i)}
                      className="aspect-square overflow-hidden rounded-xl border"
                      style={{
                        borderColor:
                          activeImage === i
                            ? "hsl(42 53% 54%)"
                            : "hsl(40 18% 80%)",
                        background: "hsl(40 30% 88%)",
                      }}
                      data-testid={`product-thumb-${i}`}
                      aria-label={`View image ${i + 1}`}
                    >
                      <Image
                        src={src}
                        width={200}
                        height={250}
                        alt=""
                        sizes="25vw"
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              {product.featured ? (
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                  style={{ color: "hsl(42 53% 54%)" }}
                >
                  Featured
                </p>
              ) : null}
              <h1
                className="mt-2 font-display text-4xl leading-tight md:text-5xl"
                data-testid="product-name"
              >
                {product.name}
              </h1>
              {product.averageRating ? (
                <div
                  className="mt-3 flex items-center gap-2 text-sm"
                  style={{ color: "hsl(170 18% 32%)" }}
                  data-testid="product-rating-summary"
                >
                  <Star
                    className="h-4 w-4 fill-current"
                    style={{ color: "hsl(42 53% 54%)" }}
                  />
                  <span>
                    {product.averageRating.toFixed(1)} ·{" "}
                    {product.reviewCount ?? 0} reviews
                  </span>
                </div>
              ) : null}
              <p
                className="mt-4 font-display text-3xl"
                style={{ color: "hsl(170 58% 14%)" }}
                data-testid="product-price"
              >
                {formatMoney(product.priceCents, product.currency)}
                {product.compareAtCents &&
                product.compareAtCents > product.priceCents ? (
                  <span
                    className="ml-3 text-base line-through opacity-60"
                    style={{ color: "hsl(170 18% 32%)" }}
                  >
                    {formatMoney(product.compareAtCents, product.currency)}
                  </span>
                ) : null}
              </p>

              {product.shortDescription ? (
                <p
                  className="mt-6 text-base leading-relaxed"
                  style={{ color: "hsl(170 18% 28%)" }}
                >
                  {product.shortDescription}
                </p>
              ) : null}

              <div
                className="mt-8 prose prose-neutral max-w-none"
                data-testid="product-description"
              >
                {product.description.split(/\n\n+/).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <div
                  className="inline-flex items-center overflow-hidden rounded-full border"
                  style={{ borderColor: "hsl(40 18% 80%)" }}
                >
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="px-4 py-2 text-lg"
                    aria-label="Decrease quantity"
                    data-testid="qty-decrease"
                  >
                    −
                  </button>
                  <span
                    className="min-w-[3rem] px-2 text-center font-medium"
                    data-testid="qty-value"
                  >
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    className="px-4 py-2 text-lg"
                    aria-label="Increase quantity"
                    data-testid="qty-increase"
                  >
                    +
                  </button>
                </div>
                <Button
                  onClick={handleAdd}
                  disabled={adding || product.inventory < 1}
                  className="rounded-full px-8 py-6 text-[11px] font-semibold uppercase tracking-[0.22em]"
                  style={{
                    background: "hsl(42 53% 54%)",
                    color: "hsl(170 58% 14%)",
                    borderColor: "hsl(42 53% 46%)",
                  }}
                  data-testid="button-add-to-cart"
                >
                  {adding
                    ? "Adding…"
                    : added
                      ? "Added ✓"
                      : product.inventory < 1
                        ? "Out of stock"
                        : "Add to Cart"}
                </Button>
              </div>
              {errorMsg ? (
                <p
                  role="alert"
                  className="mt-3 text-sm"
                  style={{ color: "hsl(0 70% 35%)" }}
                  data-testid="product-error-msg"
                >
                  {errorMsg}
                </p>
              ) : null}

              <ul
                className="mt-10 grid gap-3 border-t pt-6 text-sm"
                style={{ borderColor: "hsl(40 18% 80%)" }}
              >
                {product.tags?.map((t) => (
                  <li
                    key={t}
                    className="flex items-start gap-2"
                    style={{ color: "hsl(170 18% 28%)" }}
                  >
                    <Check
                      className="mt-0.5 h-4 w-4 flex-shrink-0"
                      style={{ color: "hsl(95 30% 50%)" }}
                    />
                    <span>{t}</span>
                  </li>
                ))}
                <li
                  className="flex items-start gap-2 pt-2"
                  style={{ color: "hsl(170 18% 28%)" }}
                >
                  <FileText
                    className="mt-0.5 h-4 w-4 flex-shrink-0"
                    style={{ color: "hsl(42 53% 54%)" }}
                  />
                  <a
                    href={`/lab-reports/${product.slug}.pdf`}
                    className="underline-offset-4 hover:underline"
                    data-testid="link-lab-report"
                  >
                    View third-party lab report
                  </a>
                </li>
              </ul>
            </div>
          </section>

          <section
            className="mx-auto max-w-7xl px-6 pb-20 md:px-10"
            data-testid="reviews-section"
          >
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
                    {reviewsQuery.data.averageRating?.toFixed(1)} ·{" "}
                    {reviewsQuery.data.count} review
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
        </>
      )}
    </SiteShell>
  );
}
