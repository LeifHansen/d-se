import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import {
  ListProductsQueryParams,
  ListProductsResponse,
  ListFeaturedProductsResponse,
  GetProductBySlugParams,
  GetProductBySlugResponse,
} from "@workspace/api-zod";
import {
  getProductRatingStats,
  getProductRatingStatsBatch,
} from "./reviews";
import { publicCache } from "../middlewares/cacheControl";

const router: IRouter = Router();

const productsCache = publicCache({ sMaxAge: 60, staleWhileRevalidate: 600 });
const productCache = publicCache({ sMaxAge: 300, staleWhileRevalidate: 86400 });

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

function serialize(
  p: typeof productsTable.$inferSelect,
  rating?: { averageRating: number | null; count: number },
) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    shortDescription: p.shortDescription,
    priceCents: p.priceCents,
    compareAtCents: p.compareAtCents,
    currency: p.currency,
    images: (p.images ?? []) as string[],
    inventory: p.inventory,
    lowStockThreshold: p.lowStockThreshold,
    weightOz: p.weightOz != null ? Number(p.weightOz) : null,
    tags: (p.tags ?? []) as string[],
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    featured: p.featured,
    published: p.published,
    averageRating: rating?.averageRating ?? null,
    reviewCount: rating?.count ?? 0,
    createdAt: p.createdAt,
  };
}

async function attachRatings(
  rows: Array<typeof productsTable.$inferSelect>,
) {
  const stats = await getProductRatingStatsBatch(rows.map((r) => r.id));
  return rows.map((r) =>
    serialize(r, stats.get(r.id) ?? { averageRating: null, count: 0 }),
  );
}

router.get("/products", productsCache, async (req, res): Promise<void> => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, tags, featured, limit } = parsed.data;
  const conditions = [eq(productsTable.published, true)];
  if (search) {
    conditions.push(
      or(
        ilike(productsTable.name, `%${search}%`),
        ilike(productsTable.description, `%${search}%`),
      )!,
    );
  }
  if (featured !== undefined) {
    conditions.push(eq(productsTable.featured, featured));
  }
  const tagList = parseTagList(tags, req.query.tag);
  for (const t of tagList) {
    conditions.push(
      sql`${productsTable.tags} @> jsonb_build_array(${t}::text)`,
    );
  }
  const rows = await db
    .select()
    .from(productsTable)
    .where(and(...conditions))
    .orderBy(desc(productsTable.createdAt))
    .limit(limit ?? 24);
  res.json(ListProductsResponse.parse(await attachRatings(rows)));
});

router.get("/products/featured", productsCache, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(productsTable)
    .where(
      and(eq(productsTable.published, true), eq(productsTable.featured, true)),
    )
    .orderBy(desc(productsTable.createdAt))
    .limit(8);
  res.json(ListFeaturedProductsResponse.parse(await attachRatings(rows)));
});

router.get("/products/:slug", productCache, async (req, res): Promise<void> => {
  const params = GetProductBySlugParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.slug, params.data.slug));
  if (!row || !row.published) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const stats = await getProductRatingStats(row.id);
  res.json(GetProductBySlugResponse.parse(serialize(row, stats)));
});

export default router;
