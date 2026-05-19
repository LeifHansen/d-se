import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, blogPostsTable } from "@workspace/db";
import {
  ListBlogPostsQueryParams,
  ListBlogPostsResponse,
  GetBlogPostBySlugParams,
  GetBlogPostBySlugResponse,
} from "@workspace/api-zod";
import { publicCache } from "../middlewares/cacheControl";

const router: IRouter = Router();

const blogIndexCache = publicCache({ sMaxAge: 300, staleWhileRevalidate: 3600 });
const blogPostCache = publicCache({ sMaxAge: 600, staleWhileRevalidate: 86400 });

function parseTagList(
  tagsParam: string | undefined,
  legacyTagParam: unknown,
): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v !== "string") return;
    for (const part of v.split(",")) {
      const trimmed = part.trim();
      if (trimmed && !out.includes(trimmed)) out.push(trimmed);
    }
  };
  push(tagsParam);
  if (Array.isArray(legacyTagParam)) {
    for (const v of legacyTagParam) push(v);
  } else {
    push(legacyTagParam);
  }
  return out;
}

function serialize(p: typeof blogPostsTable.$inferSelect) {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    content: p.content,
    coverImage: p.coverImage,
    author: p.author,
    tags: (p.tags ?? []) as string[],
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    published: p.published,
    publishedAt: p.publishedAt,
    createdAt: p.createdAt,
  };
}

router.get("/blog/posts", blogIndexCache, async (req, res): Promise<void> => {
  const parsed = ListBlogPostsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const conditions = [eq(blogPostsTable.published, true)];
  const tagList = parseTagList(parsed.data.tags, req.query.tag);
  for (const t of tagList) {
    conditions.push(
      sql`${blogPostsTable.tags} @> jsonb_build_array(${t}::text)`,
    );
  }
  const rows = await db
    .select()
    .from(blogPostsTable)
    .where(and(...conditions))
    .orderBy(desc(blogPostsTable.publishedAt))
    .limit(parsed.data.limit ?? 20);
  res.json(ListBlogPostsResponse.parse(rows.map(serialize)));
});

router.get("/blog/posts/:slug", blogPostCache, async (req, res): Promise<void> => {
  const params = GetBlogPostBySlugParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(blogPostsTable)
    .where(eq(blogPostsTable.slug, params.data.slug));
  if (!row || !row.published) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(GetBlogPostBySlugResponse.parse(serialize(row)));
});

export default router;
