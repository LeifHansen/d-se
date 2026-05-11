import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  productsTable,
  productReviewsTable,
  ordersTable,
  orderItemsTable,
} from "@workspace/db";
import {
  ListProductReviewsParams,
  ListProductReviewsResponse,
  SubmitProductReviewParams,
  SubmitProductReviewBody,
} from "@workspace/api-zod";
import { getUserId, requireAuth } from "../lib/auth";

const router: IRouter = Router();

function serializeReview(
  r: typeof productReviewsTable.$inferSelect,
  product?: { slug: string; name: string } | null,
) {
  return {
    id: r.id,
    productId: r.productId,
    productSlug: product?.slug ?? null,
    productName: product?.name ?? null,
    rating: r.rating,
    title: r.title,
    body: r.body,
    status: r.status as "pending" | "approved" | "rejected",
    verifiedPurchase: r.verifiedPurchase,
    authorName: r.authorName,
    createdAt: r.createdAt,
  };
}

export async function getProductRatingStats(productId: number): Promise<{
  averageRating: number | null;
  count: number;
}> {
  const [row] = await db
    .select({
      avg: sql<string | null>`AVG(${productReviewsTable.rating})::text`,
      count: sql<string>`COUNT(*)::text`,
    })
    .from(productReviewsTable)
    .where(
      and(
        eq(productReviewsTable.productId, productId),
        eq(productReviewsTable.status, "approved"),
      ),
    );
  const count = Number(row?.count ?? 0);
  const avg = row?.avg ? Number(row.avg) : null;
  return {
    averageRating: avg != null ? Math.round(avg * 10) / 10 : null,
    count,
  };
}

export async function getProductRatingStatsBatch(
  productIds: number[],
): Promise<Map<number, { averageRating: number | null; count: number }>> {
  const map = new Map<
    number,
    { averageRating: number | null; count: number }
  >();
  if (productIds.length === 0) return map;
  const rows = await db
    .select({
      productId: productReviewsTable.productId,
      avg: sql<string | null>`AVG(${productReviewsTable.rating})::text`,
      count: sql<string>`COUNT(*)::text`,
    })
    .from(productReviewsTable)
    .where(
      and(
        eq(productReviewsTable.status, "approved"),
        sql`${productReviewsTable.productId} = ANY(${productIds})`,
      ),
    )
    .groupBy(productReviewsTable.productId);
  for (const r of rows) {
    const avg = r.avg ? Number(r.avg) : null;
    map.set(r.productId, {
      averageRating: avg != null ? Math.round(avg * 10) / 10 : null,
      count: Number(r.count),
    });
  }
  return map;
}

router.get("/products/:slug/reviews", async (req, res): Promise<void> => {
  const params = ListProductReviewsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.slug, params.data.slug));
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const rows = await db
    .select()
    .from(productReviewsTable)
    .where(
      and(
        eq(productReviewsTable.productId, product.id),
        eq(productReviewsTable.status, "approved"),
      ),
    )
    .orderBy(desc(productReviewsTable.createdAt));
  const stats = await getProductRatingStats(product.id);
  res.json(
    ListProductReviewsResponse.parse({
      items: rows.map((r) =>
        serializeReview(r, { slug: product.slug, name: product.name }),
      ),
      averageRating: stats.averageRating,
      count: stats.count,
    }),
  );
});

router.post(
  "/products/:slug/reviews",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = SubmitProductReviewParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = SubmitProductReviewBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const userId = getUserId(req)!;
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.slug, params.data.slug));
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    // Verified-purchase check: did this user actually buy this product?
    const [purchase] = await db
      .select({ orderId: ordersTable.id })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(ordersTable.id, orderItemsTable.orderId))
      .where(
        and(
          eq(orderItemsTable.productId, product.id),
          eq(ordersTable.userId, userId),
          sql`${ordersTable.status} IN ('paid','shipped','delivered','fulfilled')`,
        ),
      )
      .limit(1);
    if (!purchase) {
      res.status(403).json({
        error: "Only verified buyers can review this product",
      });
      return;
    }

    // Optional Clerk lookup for author display name (best-effort).
    let authorName: string | null = null;
    try {
      const { clerkClient } = await import("@clerk/express");
      const user = await clerkClient.users.getUser(userId);
      authorName =
        [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
        user.username ||
        null;
    } catch {
      authorName = null;
    }

    const [row] = await db
      .insert(productReviewsTable)
      .values({
        productId: product.id,
        userId,
        orderId: purchase.orderId,
        rating: body.data.rating,
        title: body.data.title,
        body: body.data.body,
        status: "pending",
        verifiedPurchase: true,
        authorName,
      })
      .returning();

    res
      .status(201)
      .json(serializeReview(row, { slug: product.slug, name: product.name }));
  },
);

export default router;
export { serializeReview };
