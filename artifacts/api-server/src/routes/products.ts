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

const router: IRouter = Router();

function serialize(p: typeof productsTable.$inferSelect) {
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
    weightOz: p.weightOz != null ? Number(p.weightOz) : null,
    tags: (p.tags ?? []) as string[],
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    featured: p.featured,
    published: p.published,
    createdAt: p.createdAt,
  };
}

router.get("/products", async (req, res): Promise<void> => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, tag, featured, limit } = parsed.data;
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
  if (tag) {
    conditions.push(sql`${productsTable.tags} ?? ${tag}`);
  }
  const rows = await db
    .select()
    .from(productsTable)
    .where(and(...conditions))
    .orderBy(desc(productsTable.createdAt))
    .limit(limit ?? 24);
  res.json(ListProductsResponse.parse(rows.map(serialize)));
});

router.get("/products/featured", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(productsTable)
    .where(
      and(eq(productsTable.published, true), eq(productsTable.featured, true)),
    )
    .orderBy(desc(productsTable.createdAt))
    .limit(8);
  res.json(ListFeaturedProductsResponse.parse(rows.map(serialize)));
});

router.get("/products/:slug", async (req, res): Promise<void> => {
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
  res.json(GetProductBySlugResponse.parse(serialize(row)));
});

export default router;
