import { Helmet } from "react-helmet-async";
import { useLocation } from "wouter";
import {
  DEFAULT_OG_IMAGE,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  TWITTER_HANDLE,
  absoluteUrl,
  canonicalFor,
} from "@/lib/seo";

export type SeoProps = {
  title?: string;
  description?: string;
  canonical?: string;
  image?: string;
  imageAlt?: string;
  type?: "website" | "article" | "product";
  noindex?: boolean;
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
  children?: React.ReactNode;
};

export function Seo({
  title,
  description = SITE_DESCRIPTION,
  canonical,
  image = DEFAULT_OG_IMAGE,
  imageAlt = `${SITE_NAME} — ${SITE_TAGLINE}`,
  type = "website",
  noindex = false,
  publishedTime,
  modifiedTime,
  author,
  children,
}: SeoProps) {
  const [location] = useLocation();
  const fullTitle = title
    ? `${title} | ${SITE_NAME}`
    : `${SITE_NAME} — ${SITE_TAGLINE}`;
  const canonicalUrl = canonical ? absoluteUrl(canonical) : canonicalFor(location);
  const imageUrl = absoluteUrl(image);

  return (
    <Helmet prioritizeSeoTags>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />
      {noindex ? (
        <meta name="robots" content="noindex,nofollow" />
      ) : (
        <meta name="robots" content="index,follow,max-image-preview:large" />
      )}

      {/* Open Graph */}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:image:alt" content={imageAlt} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:locale" content="en_US" />
      {publishedTime ? (
        <meta property="article:published_time" content={publishedTime} />
      ) : null}
      {modifiedTime ? (
        <meta property="article:modified_time" content={modifiedTime} />
      ) : null}
      {author ? <meta property="article:author" content={author} /> : null}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={TWITTER_HANDLE} />
      <meta name="twitter:creator" content={TWITTER_HANDLE} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
      <meta name="twitter:image:alt" content={imageAlt} />

      {children}
    </Helmet>
  );
}
