#!/usr/bin/env node
// Post-build prerender: bake per-route <head> meta into static HTML files
// so search bots and social previewers see per-route SEO without running JS.
//
// For each entry in STATIC_ROUTES, this rewrites the <head> of dist/public's
// built index.html and writes <route>/index.html. The body remains the SPA
// shell and react-helmet-async takes over once the bundle hydrates.
//
// Add a new entry here whenever a new public storefront page is implemented
// so crawlers see per-route meta in the initial HTML response. Dynamic
// routes (PDPs, blog posts) are handled at hydration today; a follow-up
// can extend this script to fetch slugs from the API and emit per-slug HTML.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist", "public");

const SITE_URL = (
  process.env.VITE_SITE_URL ||
  process.env.SITE_URL ||
  (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "") ||
  "https://dose.example.com"
).replace(/\/$/, "");

const SITE_NAME = "DŌSE";
const SITE_TAGLINE = "Liquid THC Wellness Elixir";
const SITE_DESCRIPTION =
  "DŌSE is a precisely formulated THC-infused beverage dropper. Add a drop to any drink for a calm, controlled lift. Wellness elixir, dialed in.";
const TWITTER_HANDLE = "@dosewellness";

const STATIC_ROUTES = [
  {
    path: "/",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    type: "website",
  },
];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function absoluteUrl(p) {
  if (!p) return SITE_URL;
  if (/^https?:\/\//.test(p)) return p;
  return `${SITE_URL}${p.startsWith("/") ? p : `/${p}`}`;
}

function buildHead(route) {
  const canonical = absoluteUrl(route.path);
  const image = absoluteUrl(route.image || "/opengraph.jpg");
  const robots = route.noindex
    ? "noindex,nofollow"
    : "index,follow,max-image-preview:large";
  const type = route.type || "website";
  const t = escapeHtml(route.title);
  const d = escapeHtml(route.description);
  return `    <title>${t}</title>
    <meta name="description" content="${d}" />
    <link rel="canonical" href="${canonical}" />
    <meta name="robots" content="${robots}" />

    <!-- Open Graph -->
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${t}" />
    <meta property="og:locale" content="en_US" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="${TWITTER_HANDLE}" />
    <meta name="twitter:creator" content="${TWITTER_HANDLE}" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${image}" />`;
}

function buildOrganizationJsonLd() {
  return {
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
  };
}

function buildWebSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/shop?search={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

function jsonLdScript(data) {
  return `    <script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

function injectHead(html, headBlock, jsonLdBlocks) {
  const headOpen = html.indexOf("<head>");
  const headClose = html.indexOf("</head>");
  if (headOpen === -1 || headClose === -1) {
    throw new Error("Could not locate <head>...</head> in built index.html");
  }

  const before = html.slice(0, headOpen + "<head>".length);
  const headInner = html.slice(headOpen + "<head>".length, headClose);
  const after = html.slice(headClose);

  const stripPatterns = [
    /<title>[\s\S]*?<\/title>\s*/gi,
    /<meta\s+name=["']description["'][^>]*>\s*/gi,
    /<meta\s+name=["']robots["'][^>]*>\s*/gi,
    /<link\s+rel=["']canonical["'][^>]*>\s*/gi,
    /<meta\s+property=["']og:[^"']+["'][^>]*>\s*/gi,
    /<meta\s+name=["']twitter:[^"']+["'][^>]*>\s*/gi,
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi,
  ];
  let cleaned = headInner;
  for (const re of stripPatterns) cleaned = cleaned.replace(re, "");

  return `${before}\n${headBlock}\n${jsonLdBlocks.join("\n")}\n${cleaned}${after}`;
}

async function main() {
  const indexPath = path.join(DIST, "index.html");
  const indexHtml = await fs.readFile(indexPath, "utf8");
  const orgJsonLd = jsonLdScript(buildOrganizationJsonLd());
  const siteJsonLd = jsonLdScript(buildWebSiteJsonLd());

  for (const route of STATIC_ROUTES) {
    const head = buildHead(route);
    const out = injectHead(indexHtml, head, [orgJsonLd, siteJsonLd]);
    const target =
      route.path === "/"
        ? indexPath
        : path.join(DIST, route.path.replace(/^\//, ""), "index.html");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, out, "utf8");
    console.log(`[prerender] wrote ${path.relative(ROOT, target)}`);
  }
}

main().catch((err) => {
  console.error("[prerender] failed:", err);
  process.exit(1);
});
