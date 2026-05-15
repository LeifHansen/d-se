import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clock,
  Facebook,
  Link as LinkIcon,
  Twitter,
} from "lucide-react";
import {
  useGetAdminBlogPostBySlug,
  useGetBlogPostBySlug,
  useListBlogPosts,
} from "@workspace/api-client-react";
import { SiteShell } from "@/components/dose/SiteShell";
import { Seo } from "@/components/seo/Seo";
import { useToast } from "@/hooks/use-toast";
import {
  BLOG_PROSE_CLASSES,
  BlogMarkdown,
  slugifyHeading,
} from "@/components/blog/BlogMarkdown";

const ACCENT = "hsl(42 53% 54%)";
const MUTED = "hsl(170 18% 32%)";
const RULE = "hsl(40 18% 80%)";

function formatDate(s?: string | null): string {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function readingTime(content: string): number {
  const words = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 225));
}

interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

function extractToc(md: string): TocEntry[] {
  const lines = md.split(/\r?\n/);
  const out: TocEntry[] = [];
  let inFence = false;
  for (const raw of lines) {
    if (/^```/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(raw);
    if (m) {
      const level = m[1].length as 2 | 3;
      const text = m[2].trim();
      out.push({ id: slugifyHeading(text), text, level });
    }
  }
  return out;
}

function ShareButtons({ title }: { title: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? window.location.href : "";
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const buttonStyle =
    "inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:bg-[hsl(40_30%_92%)]";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "Link copied", description: "Share away." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Couldn't copy link",
        description: "Try again or copy from the address bar.",
        variant: "destructive",
      });
    }
  }

  return (
    <div
      className="flex items-center gap-2"
      data-testid="blog-share"
      aria-label="Share this post"
    >
      <span
        className="mr-1 text-[10px] font-semibold uppercase tracking-[0.22em]"
        style={{ color: MUTED }}
      >
        Share
      </span>
      <a
        href={`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonStyle}
        style={{ borderColor: RULE, color: MUTED }}
        aria-label="Share on Twitter"
        data-testid="blog-share-twitter"
      >
        <Twitter className="h-4 w-4" />
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonStyle}
        style={{ borderColor: RULE, color: MUTED }}
        aria-label="Share on Facebook"
        data-testid="blog-share-facebook"
      >
        <Facebook className="h-4 w-4" />
      </a>
      <button
        type="button"
        onClick={copy}
        className={buttonStyle}
        style={{ borderColor: RULE, color: MUTED }}
        aria-label="Copy link"
        data-testid="blog-share-copy"
      >
        {copied ? (
          <Check className="h-4 w-4" />
        ) : (
          <LinkIcon className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

function RelatedPosts({
  tag,
  currentSlug,
}: {
  tag: string | undefined;
  currentSlug: string;
}) {
  const enabled = !!tag;
  const { data } = useListBlogPosts(
    { tag, limit: 4 } as never,
    { query: { enabled } as never },
  );
  const items = (data ?? [])
    .filter((p) => p.slug !== currentSlug)
    .slice(0, 3);
  if (items.length === 0) return null;
  return (
    <section
      className="mx-auto mt-16 max-w-5xl border-t px-6 py-16 md:px-10"
      style={{ borderColor: RULE }}
      data-testid="blog-related"
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: ACCENT }}
          >
            Keep reading
          </p>
          <h2 className="mt-2 font-display text-3xl">Related entries</h2>
        </div>
        <Link
          href="/blog"
          className="hidden text-xs font-semibold uppercase tracking-[0.22em] sm:inline-flex sm:items-center sm:gap-1"
          style={{ color: ACCENT }}
        >
          The Journal <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {items.map((p) => (
          <Link
            key={p.id}
            href={`/blog/${p.slug}`}
            className="group block overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md"
            style={{ borderColor: RULE }}
            data-testid={`blog-related-${p.slug}`}
          >
            {p.coverImage ? (
              <div
                className="aspect-[5/3] w-full overflow-hidden"
                style={{ background: "hsl(40 30% 88%)" }}
              >
                <img
                  src={p.coverImage}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                />
              </div>
            ) : null}
            <div className="p-5">
              {p.tags && p.tags[0] ? (
                <p
                  className="text-[10px] font-semibold uppercase tracking-[0.22em]"
                  style={{ color: ACCENT }}
                >
                  {p.tags[0]}
                </p>
              ) : null}
              <h3 className="mt-2 font-display text-lg leading-snug">
                {p.title}
              </h3>
              <p
                className="mt-2 text-sm leading-relaxed line-clamp-2"
                style={{ color: MUTED }}
              >
                {p.excerpt}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TableOfContents({ entries }: { entries: TocEntry[] }) {
  if (entries.length < 2) return null;
  return (
    <nav
      aria-label="Table of contents"
      className="not-prose mb-10 rounded-2xl border p-5"
      style={{ borderColor: RULE, background: "hsl(40 30% 96%)" }}
      data-testid="blog-toc"
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.22em]"
        style={{ color: ACCENT }}
      >
        In this entry
      </p>
      <ol className="mt-3 space-y-2 text-sm">
        {entries.map((e, i) => (
          <li
            key={`${e.id}-${i}`}
            className={e.level === 3 ? "ml-4" : undefined}
          >
            <a
              href={`#${e.id}`}
              className="underline-offset-4 hover:underline"
              style={{ color: e.level === 2 ? "inherit" : MUTED }}
            >
              <span
                className="mr-2 text-[10px] tabular-nums"
                style={{ color: ACCENT }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              {e.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default function BlogPost() {
  const [, params] = useRoute<{ slug: string }>("/blog/:slug");
  const slug = params?.slug ?? "";
  const {
    data: publicPost,
    isLoading: publicLoading,
    isError: publicError,
  } = useGetBlogPostBySlug(slug, {
    query: { enabled: !!slug, retry: false } as never,
  });
  // Admin preview fallback: when the public endpoint 404s (post is unpublished
  // or doesn't exist), try the admin endpoint. Clerk session cookies are sent
  // automatically — non-admins simply get 401/403 and we fall through to the
  // normal "Post not found" state.
  const {
    data: adminPost,
    isLoading: adminLoading,
    isError: adminError,
  } = useGetAdminBlogPostBySlug(slug, {
    query: { enabled: !!slug && publicError, retry: false } as never,
  });
  const post = publicPost ?? adminPost ?? null;
  const isDraftPreview = !publicPost && !!adminPost;
  const isLoading = publicLoading || (publicError && !adminError && !adminPost && adminLoading);
  const isError = !post && (publicError ? adminError || (!adminLoading && !adminPost) : false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0 });
    }
  }, [slug]);

  const toc = useMemo(() => (post ? extractToc(post.content) : []), [post]);
  const minutes = useMemo(
    () => (post ? readingTime(post.content) : 0),
    [post],
  );

  return (
    <SiteShell testId="page-blog-post">
      <Seo
        title={post?.seoTitle ?? post?.title ?? "Journal"}
        description={post?.seoDescription ?? post?.excerpt ?? undefined}
        type="article"
        image={post?.coverImage ?? undefined}
        publishedTime={post?.publishedAt ?? undefined}
        author={post?.author ?? undefined}
      />
      {isDraftPreview ? (
        <div
          className="border-b"
          style={{
            background: "hsl(42 53% 54%)",
            borderColor: "hsl(42 53% 44%)",
            color: "hsl(170 58% 14%)",
          }}
          data-testid="blog-draft-banner"
          role="status"
        >
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-3 text-xs md:px-10">
            <span className="font-semibold uppercase tracking-[0.22em]">
              Draft preview · Not visible to the public
            </span>
            <Link
              href="/admin"
              className="font-semibold uppercase tracking-[0.22em] underline-offset-4 hover:underline"
              data-testid="link-admin-from-draft-banner"
            >
              Back to admin
            </Link>
          </div>
        </div>
      ) : null}
      <div className="mx-auto max-w-3xl px-6 pt-8 md:px-10">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: MUTED }}
          data-testid="link-back-to-blog"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> The Journal
        </Link>
      </div>

      {isLoading ? (
        <div
          className="mx-auto max-w-3xl space-y-4 px-6 py-12 md:px-10"
          data-testid="blog-post-loading"
        >
          <div
            className="h-10 w-3/4 animate-pulse rounded"
            style={{ background: "hsl(40 30% 88%)" }}
          />
          <div
            className="h-4 w-1/3 animate-pulse rounded"
            style={{ background: "hsl(40 30% 88%)" }}
          />
        </div>
      ) : isError || !post ? (
        <div className="mx-auto max-w-3xl px-6 py-24 text-center md:px-10">
          <h1 className="font-display text-4xl">Post not found.</h1>
          <Link
            href="/blog"
            className="mt-4 inline-block underline-offset-4 hover:underline"
          >
            Read the journal
          </Link>
        </div>
      ) : (
        <>
          <article
            className="mx-auto max-w-3xl px-6 py-12 md:px-10 md:py-16"
            data-testid="blog-post"
          >
            {post.tags && post.tags[0] ? (
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: ACCENT }}
              >
                {post.tags[0]}
              </p>
            ) : null}
            <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">
              {post.title}
            </h1>
            <div
              className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
              style={{ color: MUTED }}
            >
              <span>
                {[post.author, formatDate(post.publishedAt)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span
                className="inline-flex items-center gap-1"
                data-testid="blog-reading-time"
              >
                <Clock className="h-3.5 w-3.5" />
                {minutes} min read
              </span>
            </div>
            {post.coverImage ? (
              <div
                className="mt-8 aspect-[16/9] w-full overflow-hidden rounded-3xl"
                style={{ background: "hsl(40 30% 88%)" }}
              >
                <img
                  src={post.coverImage}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}

            <div
              className={`${BLOG_PROSE_CLASSES} mt-10`}
              data-testid="blog-post-content"
            >
              <TableOfContents entries={toc} />
              <BlogMarkdown content={post.content} />
            </div>

            <div
              className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t pt-6"
              style={{ borderColor: RULE }}
            >
              {post.tags && post.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]"
                      style={{ borderColor: RULE, color: MUTED }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : (
                <span />
              )}
              <ShareButtons title={post.title} />
            </div>
          </article>

          <RelatedPosts tag={post.tags?.[0]} currentSlug={post.slug} />
        </>
      )}
    </SiteShell>
  );
}
