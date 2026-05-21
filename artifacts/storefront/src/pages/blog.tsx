import { useMemo } from "react";
import { Link, useSearch } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { useListBlogPosts } from "@workspace/api-client-react";
import { SiteShell } from "@/components/dose/SiteShell";
import { Seo } from "@/components/seo/Seo";
import { parseTagsFromSearch, buildBlogHref, toggleTag } from "@/lib/tagFilter";

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

export default function BlogIndex() {
  const search = useSearch();
  const activeTags = useMemo(() => parseTagsFromSearch(search), [search]);

  const { data: allPosts } = useListBlogPosts();
  const { data, isLoading, isError } = useListBlogPosts(
    activeTags.length > 0 ? { tags: activeTags.join(",") } : undefined,
  );

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of allPosts ?? []) {
      for (const t of p.tags ?? []) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allPosts]);

  return (
    <SiteShell testId="page-blog">
      <Seo
        title="The Journal"
        description="Notes, recipes, and ritual ideas from the DŌSE team."
      />
      <section
        style={{ background: "hsl(166 95% 19%)", color: "hsl(45 49% 90%)" }}
      >
        <div className="mx-auto max-w-5xl px-6 py-16 md:px-10 md:py-24">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "hsl(42 53% 64%)" }}
          >
            The Journal
          </p>
          <h1 className="mt-3 font-display text-5xl leading-tight md:text-6xl">
            Notes from
            <br />
            <span
              className="font-display-italic"
              style={{ color: "hsl(95 30% 78%)" }}
            >
              the dropper.
            </span>
          </h1>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16 md:px-10 md:py-20">
        {allTags.length > 0 ? (
          <div
            className="mb-10 flex flex-wrap items-center gap-2"
            data-testid="blog-tag-filter"
            aria-label="Filter posts by tag"
          >
            <Link
              href={buildBlogHref([])}
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
              data-testid="blog-tag-all"
            >
              All
            </Link>
            {allTags.map((t) => {
              const isActive = activeTags.includes(t);
              const nextTags = toggleTag(activeTags, t);
              return (
                <Link
                  key={t}
                  href={buildBlogHref(nextTags)}
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
                  data-testid={`blog-tag-${t}`}
                >
                  {t}
                </Link>
              );
            })}
          </div>
        ) : null}
        {isLoading ? (
          <div
            className="grid gap-8 md:grid-cols-2"
            data-testid="blog-loading"
          >
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="aspect-[5/4] w-full animate-pulse rounded-3xl"
                style={{ background: "hsl(40 30% 88%)" }}
              />
            ))}
          </div>
        ) : isError ? (
          <p
            role="alert"
            className="text-sm"
            style={{ color: "hsl(0 70% 35%)" }}
            data-testid="blog-error"
          >
            Couldn't load posts. Please refresh.
          </p>
        ) : data && data.length > 0 ? (
          <div
            className="grid gap-8 md:grid-cols-2"
            data-testid="blog-grid"
          >
            {data.map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="group block overflow-hidden rounded-3xl border bg-card transition-shadow hover:shadow-lg"
                style={{ borderColor: "hsl(40 18% 80%)" }}
                data-testid={`blog-post-${post.slug}`}
              >
                {post.coverImage ? (
                  <div
                    className="aspect-[5/3] w-full overflow-hidden"
                    style={{ background: "hsl(40 30% 88%)" }}
                  >
                    <img
                      src={post.coverImage}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    />
                  </div>
                ) : null}
                <div className="p-6">
                  {post.tags && post.tags[0] ? (
                    <p
                      className="text-[10px] font-semibold uppercase tracking-[0.22em]"
                      style={{ color: "hsl(42 53% 54%)" }}
                    >
                      {post.tags[0]}
                    </p>
                  ) : null}
                  <h2 className="mt-2 font-display text-2xl leading-snug">
                    {post.title}
                  </h2>
                  <p
                    className="mt-2 text-sm leading-relaxed"
                    style={{ color: "hsl(170 18% 32%)" }}
                  >
                    {post.excerpt}
                  </p>
                  <div
                    className="mt-4 flex items-center justify-between text-xs"
                    style={{ color: "hsl(170 18% 32%)" }}
                  >
                    <span>{formatDate(post.publishedAt)}</span>
                    <span
                      className="inline-flex items-center gap-1 font-semibold uppercase tracking-[0.18em]"
                      style={{ color: "hsl(42 53% 54%)" }}
                    >
                      Read <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p
            className="text-center font-display text-2xl"
            data-testid="blog-empty"
          >
            {activeTags.length > 0
              ? `No posts tagged ${activeTags
                  .map((t) => `"${t}"`)
                  .join(" + ")} yet.`
              : "New journal entries coming soon."}
          </p>
        )}
      </section>
    </SiteShell>
  );
}
