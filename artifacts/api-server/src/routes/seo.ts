import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, productsTable, blogPostsTable } from "@workspace/db";
import { SITE_URL } from "../lib/site-url";

const router: IRouter = Router();

// Only includes routes that are actually implemented in the storefront SPA.
// Add new entries here as customer-facing pages ship — keep this list strictly
// in sync with implemented public routes so the sitemap never advertises 404s.
const STATIC_PATHS: { path: string; changefreq: string; priority: string }[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(loc: string, lastmod?: Date | null, changefreq?: string, priority?: string): string {
  const parts = [`    <loc>${escapeXml(loc)}</loc>`];
  if (lastmod) parts.push(`    <lastmod>${lastmod.toISOString()}</lastmod>`);
  if (changefreq) parts.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) parts.push(`    <priority>${priority}</priority>`);
  return `  <url>\n${parts.join("\n")}\n  </url>`;
}

router.get("/sitemap.xml", async (_req, res): Promise<void> => {
  const [products, posts] = await Promise.all([
    db
      .select({
        slug: productsTable.slug,
        updatedAt: productsTable.updatedAt,
      })
      .from(productsTable)
      .where(eq(productsTable.published, true))
      .orderBy(desc(productsTable.updatedAt)),
    db
      .select({
        slug: blogPostsTable.slug,
        updatedAt: blogPostsTable.updatedAt,
        publishedAt: blogPostsTable.publishedAt,
      })
      .from(blogPostsTable)
      .where(eq(blogPostsTable.published, true))
      .orderBy(desc(blogPostsTable.publishedAt)),
  ]);

  const entries: string[] = [];

  for (const p of STATIC_PATHS) {
    entries.push(urlEntry(`${SITE_URL}${p.path}`, undefined, p.changefreq, p.priority));
  }

  for (const product of products) {
    entries.push(
      urlEntry(`${SITE_URL}/shop/${product.slug}`, product.updatedAt, "weekly", "0.8"),
    );
  }

  for (const post of posts) {
    entries.push(
      urlEntry(
        `${SITE_URL}/journal/${post.slug}`,
        post.updatedAt ?? post.publishedAt,
        "monthly",
        "0.6",
      ),
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(xml);
});

router.get("/robots.txt", (_req, res): void => {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /account",
    "Disallow: /cart",
    "Disallow: /checkout",
    "Disallow: /api/",
    "",
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    "",
  ].join("\n");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(body);
});

export default router;
