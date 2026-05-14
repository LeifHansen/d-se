import { Link, useRoute } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useGetBlogPostBySlug } from "@workspace/api-client-react";
import { SiteShell } from "@/components/dose/SiteShell";
import { Seo } from "@/components/seo/Seo";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Minimal markdown -> HTML for headings, paragraphs, links, bold/italic, lists, code.
function renderMarkdown(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let buffer: string[] = [];

  const flushPara = () => {
    if (buffer.length === 0) return;
    out.push(`<p>${inline(buffer.join(" "))}</p>`);
    buffer = [];
  };
  const closeLists = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };
  const inline = (s: string): string =>
    escapeHtml(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" rel="noopener">$1</a>',
      );

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      closeLists();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      closeLists();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushPara();
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      flushPara();
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${inline(line.replace(/^\d+\.\s+/, ""))}</li>`);
      continue;
    }
    buffer.push(line);
  }
  flushPara();
  closeLists();
  return out.join("\n");
}

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

export default function BlogPost() {
  const [, params] = useRoute<{ slug: string }>("/blog/:slug");
  const slug = params?.slug ?? "";
  const { data: post, isLoading, isError } = useGetBlogPostBySlug(slug, {
    query: { enabled: !!slug } as never,
  });

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
      <div className="mx-auto max-w-3xl px-6 pt-8 md:px-10">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: "hsl(170 18% 32%)" }}
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
        <article
          className="mx-auto max-w-3xl px-6 py-12 md:px-10 md:py-16"
          data-testid="blog-post"
        >
          {post.tags && post.tags[0] ? (
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: "hsl(42 53% 54%)" }}
            >
              {post.tags[0]}
            </p>
          ) : null}
          <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">
            {post.title}
          </h1>
          <p
            className="mt-3 text-sm"
            style={{ color: "hsl(170 18% 32%)" }}
          >
            {[post.author, formatDate(post.publishedAt)]
              .filter(Boolean)
              .join(" · ")}
          </p>
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
            className="prose prose-neutral mt-10 max-w-none"
            data-testid="blog-post-content"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }}
          />
        </article>
      )}
    </SiteShell>
  );
}
