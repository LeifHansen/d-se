import { Helmet } from "react-helmet-async";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
} from "@/lib/seo";

type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | JsonLdValue[]
  | { [key: string]: JsonLdValue | undefined };

export function JsonLd({ data }: { data: JsonLdValue }) {
  const json = JSON.stringify(data, (_k, v) => (v === undefined ? undefined : v));
  return (
    <Helmet>
      <script type="application/ld+json">{json}</script>
    </Helmet>
  );
}

export function OrganizationJsonLd() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL,
        logo: absoluteUrl("/favicon.svg"),
        description: SITE_DESCRIPTION,
        sameAs: [
          "https://www.instagram.com/dosewellness",
          "https://twitter.com/dosewellness",
        ],
      }}
    />
  );
}

export function WebSiteJsonLd() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: SITE_NAME,
        url: SITE_URL,
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE_URL}/shop?search={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      }}
    />
  );
}

export type BreadcrumbItem = { name: string; path: string };

export function BreadcrumbJsonLd({ items }: { items: BreadcrumbItem[] }) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, idx) => ({
          "@type": "ListItem",
          position: idx + 1,
          name: item.name,
          item: absoluteUrl(item.path),
        })),
      }}
    />
  );
}

export type ProductJsonLdProps = {
  name: string;
  slug: string;
  description?: string | null;
  images: string[];
  priceCents: number;
  currency: string;
  inventory: number;
  sku?: string;
  ratingValue?: number;
  reviewCount?: number;
};

export function ProductJsonLd(p: ProductJsonLdProps) {
  const price = (p.priceCents / 100).toFixed(2);
  const url = absoluteUrl(`/shop/${p.slug}`);
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.name,
        description: p.description ?? undefined,
        image: p.images.map((src) => absoluteUrl(src)),
        sku: p.sku ?? p.slug,
        brand: { "@type": "Brand", name: SITE_NAME },
        url,
        offers: {
          "@type": "Offer",
          url,
          priceCurrency: p.currency.toUpperCase(),
          price,
          availability:
            p.inventory > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          itemCondition: "https://schema.org/NewCondition",
        },
        aggregateRating:
          p.ratingValue && p.reviewCount
            ? {
                "@type": "AggregateRating",
                ratingValue: p.ratingValue,
                reviewCount: p.reviewCount,
              }
            : undefined,
      }}
    />
  );
}

export type ArticleJsonLdProps = {
  title: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  author?: string | null;
  publishedAt?: string | Date | null;
  modifiedAt?: string | Date | null;
};

function toIso(d: string | Date | null | undefined): string | undefined {
  if (!d) return undefined;
  return typeof d === "string" ? d : d.toISOString();
}

export function ArticleJsonLd(p: ArticleJsonLdProps) {
  const url = absoluteUrl(`/journal/${p.slug}`);
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "Article",
        headline: p.title,
        description: p.description ?? undefined,
        image: p.image ? [absoluteUrl(p.image)] : undefined,
        author: p.author
          ? { "@type": "Person", name: p.author }
          : { "@type": "Organization", name: SITE_NAME },
        publisher: {
          "@type": "Organization",
          name: SITE_NAME,
          logo: { "@type": "ImageObject", url: absoluteUrl("/favicon.svg") },
        },
        datePublished: toIso(p.publishedAt),
        dateModified: toIso(p.modifiedAt) ?? toIso(p.publishedAt),
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        url,
      }}
    />
  );
}

export type FaqItem = { question: string; answer: string };

export function FaqJsonLd({ items }: { items: FaqItem[] }) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      }}
    />
  );
}
