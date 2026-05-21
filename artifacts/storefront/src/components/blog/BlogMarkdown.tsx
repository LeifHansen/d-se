import { useMemo, type ComponentPropsWithoutRef } from "react";
import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { toString as hastToString } from "hast-util-to-string";
import type { Element as HastElement } from "hast";
import { useGetProductBySlug } from "@workspace/api-client-react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "product-callout": ComponentPropsWithoutRef<"div"> & { slug?: string };
    }
  }
}

const ACCENT = "hsl(42 53% 54%)";
const MUTED = "hsl(170 18% 32%)";
const RULE = "hsl(40 18% 80%)";

export const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "product-callout"],
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    "product-callout": ["slug"],
    a: [
      ...((defaultSchema.attributes?.a as unknown[]) ?? []),
      ["target", "_blank", "_self"],
      ["rel", "noopener", "noreferrer"],
    ],
  },
};

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function formatPrice(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

function ProductCallout({ slug }: { slug?: string }) {
  const safe = (slug ?? "").trim();
  const { data: product } = useGetProductBySlug(safe, {
    query: { enabled: !!safe } as never,
  });
  if (!safe) return null;
  if (!product) {
    return (
      <div
        className="my-8 h-32 w-full animate-pulse rounded-2xl"
        style={{ background: "hsl(40 30% 92%)" }}
        aria-hidden="true"
      />
    );
  }
  const img = product.images?.[0];
  return (
    <aside
      className="not-prose my-10 overflow-hidden rounded-3xl border"
      style={{ borderColor: RULE, background: "hsl(40 30% 96%)" }}
      data-testid={`blog-product-callout-${product.slug}`}
    >
      <div className="grid gap-0 sm:grid-cols-[160px_1fr]">
        <div
          className="aspect-square w-full overflow-hidden sm:aspect-auto"
          style={{ background: "hsl(165 58% 25%)" }}
        >
          {img ? (
            <img
              src={img}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div className="flex flex-col justify-between gap-4 p-5 sm:p-6">
          <div>
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: ACCENT }}
            >
              From the shop
            </p>
            <h3 className="mt-1 font-display text-xl leading-snug">
              {product.name}
            </h3>
            {product.shortDescription ? (
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: MUTED }}
              >
                {product.shortDescription}
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="font-display text-lg">
              {formatPrice(product.priceCents, product.currency)}
            </span>
            <Link
              href={`/products/${product.slug}`}
              className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.22em]"
              style={{ color: ACCENT }}
              data-testid={`blog-product-callout-link-${product.slug}`}
            >
              Shop <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}

export const BLOG_PROSE_CLASSES =
  "prose prose-neutral max-w-none prose-headings:font-display prose-headings:tracking-tight prose-h2:mt-12 prose-h2:text-3xl prose-h3:text-2xl prose-a:text-[hsl(170_58%_24%)] prose-a:underline-offset-4 hover:prose-a:underline prose-img:rounded-2xl prose-blockquote:border-l-4 prose-blockquote:border-[hsl(42_53%_54%)] prose-blockquote:bg-[hsl(40_30%_96%)] prose-blockquote:px-5 prose-blockquote:py-2 prose-blockquote:not-italic prose-blockquote:font-display prose-blockquote:text-xl prose-hr:border-[hsl(40_18%_80%)]";

export interface BlogMarkdownProps {
  content: string;
}

export function BlogMarkdown({ content }: BlogMarkdownProps) {
  const components: Components = useMemo(() => {
    const headingIdFromNode = (node: unknown): string => {
      try {
        return slugifyHeading(hastToString(node as HastElement));
      } catch {
        return "";
      }
    };
    return {
      h2: ({ node, children, ...rest }) => (
        <h2 id={headingIdFromNode(node)} {...rest}>
          {children}
        </h2>
      ),
      h3: ({ node, children, ...rest }) => (
        <h3 id={headingIdFromNode(node)} {...rest}>
          {children}
        </h3>
      ),
      img: ({ src, alt, title }) =>
        src ? (
          <figure className="not-prose my-8">
            <img
              src={typeof src === "string" ? src : ""}
              alt={alt ?? ""}
              loading="lazy"
              decoding="async"
              className="w-full rounded-2xl"
            />
            {alt || title ? (
              <figcaption
                className="mt-2 text-center text-xs"
                style={{ color: MUTED }}
              >
                {title || alt}
              </figcaption>
            ) : null}
          </figure>
        ) : null,
      a: ({ href, children, ...rest }) => {
        const isExternal =
          typeof href === "string" && /^https?:\/\//.test(href);
        return (
          <a
            href={href}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            {...rest}
          >
            {children}
          </a>
        );
      },
      "product-callout": ({ slug: pslug }) => <ProductCallout slug={pslug} />,
    };
  }, []);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
}
