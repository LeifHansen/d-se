import { Router, type IRouter } from "express";
import { and, count, desc, eq, gte, inArray, lte, sql, sum } from "drizzle-orm";
import {
  db,
  productsTable,
  ordersTable,
  blogPostsTable,
  discountCodesTable,
  productReviewsTable,
  abandonedCartsTable,
  cartItemsTable,
} from "@workspace/db";
import {
  CreateProductBody,
  UpdateProductParams,
  UpdateProductBody,
  UpdateProductResponse,
  DeleteProductParams,
  ListAdminOrdersQueryParams,
  ListAdminOrdersResponse,
  ListAdminProductsResponse,
  GetAdminStatsResponse,
  ListAdminBlogPostsResponse,
  CreateBlogPostBody,
  UpdateBlogPostParams,
  UpdateBlogPostBody,
  UpdateBlogPostResponse,
  DeleteBlogPostParams,
  FulfillOrderParams,
  FulfillOrderBody,
  FulfillOrderResponse,
  ListAdminDiscountCodesResponse,
  CreateDiscountCodeBody,
  UpdateDiscountCodeParams,
  UpdateDiscountCodeBody,
  UpdateDiscountCodeResponse,
  DeleteDiscountCodeParams,
  ListAdminReviewsQueryParams,
  ListAdminReviewsResponse,
  ModerateReviewParams,
  ModerateReviewBody,
  ModerateReviewResponse,
  DeleteReviewParams,
  ListAdminAbandonedCartsResponse,
  GetAdminTaxSummaryResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth";
import { buildOrderResponse } from "./orders";
import {
  getEasyPost,
  isEasyPostConfigured,
  FROM_ADDRESS,
} from "../lib/easypost";
import { sendShipmentEmail } from "../lib/email";

const router: IRouter = Router();

router.use("/admin", requireAdmin);

function serializeProduct(p: typeof productsTable.$inferSelect) {
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
    averageRating: null as number | null,
    reviewCount: 0,
    createdAt: p.createdAt,
  };
}

function serializeBlog(p: typeof blogPostsTable.$inferSelect) {
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

router.get("/admin/stats", async (_req, res): Promise<void> => {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [{ totalOrders }] = await db
    .select({ totalOrders: count() })
    .from(ordersTable);
  const [{ totalProducts }] = await db
    .select({ totalProducts: count() })
    .from(productsTable);
  const [{ ordersThisMonth, revenueCentsThisMonth }] = await db
    .select({
      ordersThisMonth: count(),
      revenueCentsThisMonth: sum(ordersTable.totalCents),
    })
    .from(ordersTable)
    .where(
      and(
        gte(ordersTable.createdAt, monthStart),
        eq(ordersTable.status, "paid"),
      ),
    );
  const [{ pendingFulfillment }] = await db
    .select({ pendingFulfillment: count() })
    .from(ordersTable)
    .where(eq(ordersTable.status, "paid"));
  const [{ lowStock }] = await db
    .select({ lowStock: count() })
    .from(productsTable)
    .where(lte(productsTable.inventory, 5));

  const recentOrdersRows = await db
    .select()
    .from(ordersTable)
    .orderBy(desc(ordersTable.createdAt))
    .limit(5);
  const recentOrders = await Promise.all(
    recentOrdersRows.map(async (o) => (await buildOrderResponse(o.id))!),
  );

  res.json(
    GetAdminStatsResponse.parse({
      totalOrders,
      ordersThisMonth,
      revenueCentsThisMonth: Number(revenueCentsThisMonth ?? 0),
      pendingFulfillment,
      lowStock,
      totalProducts,
      recentOrders,
    }),
  );
});

router.get("/admin/products", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(productsTable)
    .orderBy(desc(productsTable.createdAt));
  res.json(ListAdminProductsResponse.parse(rows.map(serializeProduct)));
});

router.post("/admin/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(productsTable)
    .values({
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description,
      shortDescription: parsed.data.shortDescription ?? null,
      priceCents: parsed.data.priceCents,
      compareAtCents: parsed.data.compareAtCents ?? null,
      currency: parsed.data.currency ?? "usd",
      images: parsed.data.images ?? [],
      inventory: parsed.data.inventory,
      weightOz:
        parsed.data.weightOz != null ? String(parsed.data.weightOz) : null,
      tags: parsed.data.tags ?? [],
      seoTitle: parsed.data.seoTitle ?? null,
      seoDescription: parsed.data.seoDescription ?? null,
      featured: parsed.data.featured ?? false,
      published: parsed.data.published ?? true,
    })
    .returning();
  res.status(201).json(serializeProduct(row));
});

router.patch("/admin/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateProductBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [row] = await db
    .update(productsTable)
    .set({
      slug: body.data.slug,
      name: body.data.name,
      description: body.data.description,
      shortDescription: body.data.shortDescription ?? null,
      priceCents: body.data.priceCents,
      compareAtCents: body.data.compareAtCents ?? null,
      currency: body.data.currency ?? "usd",
      images: body.data.images ?? [],
      inventory: body.data.inventory,
      weightOz:
        body.data.weightOz != null ? String(body.data.weightOz) : null,
      tags: body.data.tags ?? [],
      seoTitle: body.data.seoTitle ?? null,
      seoDescription: body.data.seoDescription ?? null,
      featured: body.data.featured ?? false,
      published: body.data.published ?? true,
      updatedAt: new Date(),
    })
    .where(eq(productsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(UpdateProductResponse.parse(serializeProduct(row)));
});

router.delete("/admin/products/:id", async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(productsTable).where(eq(productsTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/admin/orders", async (req, res): Promise<void> => {
  const parsed = ListAdminOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = parsed.data.status
    ? await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.status, parsed.data.status))
        .orderBy(desc(ordersTable.createdAt))
    : await db
        .select()
        .from(ordersTable)
        .orderBy(desc(ordersTable.createdAt));
  const enriched = await Promise.all(
    rows.map(async (o) => (await buildOrderResponse(o.id))!),
  );
  res.json(ListAdminOrdersResponse.parse(enriched));
});

router.post(
  "/admin/orders/:id/fulfill",
  async (req, res): Promise<void> => {
    const params = FulfillOrderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = FulfillOrderBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, params.data.id));
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    let trackingCode: string | null = null;
    let labelUrl: string | null = null;
    let shipmentId: string | null = null;

    if (isEasyPostConfigured() && order.shippingAddress) {
      try {
        const ep = getEasyPost();
        const a = order.shippingAddress;
        const shipment = await ep.Shipment.create({
          to_address: {
            name: a.name,
            street1: a.street1,
            street2: a.street2 ?? undefined,
            city: a.city,
            state: a.state,
            zip: a.zip,
            country: a.country,
            phone: a.phone ?? undefined,
          },
          from_address: FROM_ADDRESS,
          parcel: { length: 9, width: 6, height: 3, weight: 16 },
        });
        const bought = await ep.Shipment.buy(shipment.id, body.data.shippingRateId);
        trackingCode = bought.tracking_code ?? null;
        labelUrl = bought.postage_label?.label_url ?? null;
        shipmentId = bought.id ?? null;
      } catch (err) {
        req.log.error({ err }, "EasyPost label purchase failed");
      }
    } else {
      trackingCode = `MOCK-${Date.now()}`;
    }

    await db
      .update(ordersTable)
      .set({
        status: "shipped",
        trackingCode,
        labelUrl,
        shipmentId,
        updatedAt: new Date(),
      })
      .where(eq(ordersTable.id, params.data.id));

    if (order.email && trackingCode) {
      try {
        await sendShipmentEmail({
          to: order.email,
          orderId: order.id,
          trackingCode,
          carrier: "Carrier",
        });
      } catch (err) {
        req.log.warn({ err }, "Shipment email failed");
      }
    }

    const updated = await buildOrderResponse(params.data.id);
    res.json(FulfillOrderResponse.parse(updated));
  },
);

router.get("/admin/blog/posts", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(blogPostsTable)
    .orderBy(desc(blogPostsTable.createdAt));
  res.json(ListAdminBlogPostsResponse.parse(rows.map(serializeBlog)));
});

router.post("/admin/blog/posts", async (req, res): Promise<void> => {
  const parsed = CreateBlogPostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(blogPostsTable)
    .values({
      slug: parsed.data.slug,
      title: parsed.data.title,
      excerpt: parsed.data.excerpt,
      content: parsed.data.content,
      coverImage: parsed.data.coverImage ?? null,
      author: parsed.data.author ?? null,
      tags: parsed.data.tags ?? [],
      seoTitle: parsed.data.seoTitle ?? null,
      seoDescription: parsed.data.seoDescription ?? null,
      published: parsed.data.published ?? false,
      publishedAt: parsed.data.published ? new Date() : null,
    })
    .returning();
  res.status(201).json(serializeBlog(row));
});

router.patch("/admin/blog/posts/:id", async (req, res): Promise<void> => {
  const params = UpdateBlogPostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateBlogPostBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(blogPostsTable)
    .where(eq(blogPostsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const willPublish = body.data.published ?? false;
  const [row] = await db
    .update(blogPostsTable)
    .set({
      slug: body.data.slug,
      title: body.data.title,
      excerpt: body.data.excerpt,
      content: body.data.content,
      coverImage: body.data.coverImage ?? null,
      author: body.data.author ?? null,
      tags: body.data.tags ?? [],
      seoTitle: body.data.seoTitle ?? null,
      seoDescription: body.data.seoDescription ?? null,
      published: willPublish,
      publishedAt:
        willPublish && !existing.published
          ? new Date()
          : existing.publishedAt,
      updatedAt: new Date(),
    })
    .where(eq(blogPostsTable.id, params.data.id))
    .returning();
  res.json(UpdateBlogPostResponse.parse(serializeBlog(row)));
});

router.delete("/admin/blog/posts/:id", async (req, res): Promise<void> => {
  const params = DeleteBlogPostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(blogPostsTable)
    .where(eq(blogPostsTable.id, params.data.id));
  res.sendStatus(204);
});

// ---------- Discount codes ----------

function serializeDiscount(d: typeof discountCodesTable.$inferSelect) {
  return {
    id: d.id,
    code: d.code,
    type: d.type as "percent" | "fixed",
    value: d.value,
    minSubtotalCents: d.minSubtotalCents,
    maxRedemptions: d.maxRedemptions,
    redemptionsCount: d.redemptionsCount,
    expiresAt: d.expiresAt,
    active: d.active,
    createdAt: d.createdAt,
  };
}

router.get("/admin/discount-codes", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(discountCodesTable)
    .orderBy(desc(discountCodesTable.createdAt));
  res.json(ListAdminDiscountCodesResponse.parse(rows.map(serializeDiscount)));
});

function validateDiscountInput(input: {
  type: string;
  value: number;
}): string | null {
  if (!Number.isInteger(input.value) || input.value <= 0) {
    return "value must be a positive integer";
  }
  if (input.type === "percent" && input.value > 100) {
    return "percent discount value must be between 1 and 100";
  }
  return null;
}

router.post("/admin/discount-codes", async (req, res): Promise<void> => {
  const body = CreateDiscountCodeBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const invalid = validateDiscountInput(body.data);
  if (invalid) {
    res.status(400).json({ error: invalid });
    return;
  }
  const [row] = await db
    .insert(discountCodesTable)
    .values({
      code: body.data.code.trim().toUpperCase(),
      type: body.data.type,
      value: body.data.value,
      minSubtotalCents: body.data.minSubtotalCents ?? null,
      maxRedemptions: body.data.maxRedemptions ?? null,
      expiresAt: body.data.expiresAt ?? null,
      active: body.data.active ?? true,
    })
    .returning();
  res.status(201).json(serializeDiscount(row));
});

router.patch("/admin/discount-codes/:id", async (req, res): Promise<void> => {
  const params = UpdateDiscountCodeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateDiscountCodeBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const invalid = validateDiscountInput(body.data);
  if (invalid) {
    res.status(400).json({ error: invalid });
    return;
  }
  const [row] = await db
    .update(discountCodesTable)
    .set({
      code: body.data.code.trim().toUpperCase(),
      type: body.data.type,
      value: body.data.value,
      minSubtotalCents: body.data.minSubtotalCents ?? null,
      maxRedemptions: body.data.maxRedemptions ?? null,
      expiresAt: body.data.expiresAt ?? null,
      active: body.data.active ?? true,
      // Invalidate cached Stripe coupon/promo when fields change.
      stripeCouponId: null,
      stripePromotionCodeId: null,
      updatedAt: new Date(),
    })
    .where(eq(discountCodesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Discount code not found" });
    return;
  }
  res.json(UpdateDiscountCodeResponse.parse(serializeDiscount(row)));
});

router.delete(
  "/admin/discount-codes/:id",
  async (req, res): Promise<void> => {
    const params = DeleteDiscountCodeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    await db
      .delete(discountCodesTable)
      .where(eq(discountCodesTable.id, params.data.id));
    res.sendStatus(204);
  },
);

// ---------- Reviews moderation ----------

function serializeAdminReview(
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

router.get("/admin/reviews", async (req, res): Promise<void> => {
  const parsed = ListAdminReviewsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = parsed.data.status
    ? await db
        .select({
          review: productReviewsTable,
          product: { slug: productsTable.slug, name: productsTable.name },
        })
        .from(productReviewsTable)
        .innerJoin(
          productsTable,
          eq(productsTable.id, productReviewsTable.productId),
        )
        .where(eq(productReviewsTable.status, parsed.data.status))
        .orderBy(desc(productReviewsTable.createdAt))
    : await db
        .select({
          review: productReviewsTable,
          product: { slug: productsTable.slug, name: productsTable.name },
        })
        .from(productReviewsTable)
        .innerJoin(
          productsTable,
          eq(productsTable.id, productReviewsTable.productId),
        )
        .orderBy(desc(productReviewsTable.createdAt));
  res.json(
    ListAdminReviewsResponse.parse(
      rows.map((r) => serializeAdminReview(r.review, r.product)),
    ),
  );
});

router.patch("/admin/reviews/:id", async (req, res): Promise<void> => {
  const params = ModerateReviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = ModerateReviewBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [row] = await db
    .update(productReviewsTable)
    .set({ status: body.data.status, updatedAt: new Date() })
    .where(eq(productReviewsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Review not found" });
    return;
  }
  const [product] = await db
    .select({ slug: productsTable.slug, name: productsTable.name })
    .from(productsTable)
    .where(eq(productsTable.id, row.productId));
  res.json(
    ModerateReviewResponse.parse(serializeAdminReview(row, product ?? null)),
  );
});

router.delete("/admin/reviews/:id", async (req, res): Promise<void> => {
  const params = DeleteReviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(productReviewsTable)
    .where(eq(productReviewsTable.id, params.data.id));
  res.sendStatus(204);
});

// ---------- Abandoned carts ----------

router.get("/admin/abandoned-carts", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: abandonedCartsTable.id,
      cartId: abandonedCartsTable.cartId,
      email: abandonedCartsTable.email,
      userId: abandonedCartsTable.userId,
      firstReminderSentAt: abandonedCartsTable.firstReminderSentAt,
      secondReminderSentAt: abandonedCartsTable.secondReminderSentAt,
      recoveredAt: abandonedCartsTable.recoveredAt,
      recoveredOrderId: abandonedCartsTable.recoveredOrderId,
      createdAt: abandonedCartsTable.createdAt,
    })
    .from(abandonedCartsTable)
    .orderBy(desc(abandonedCartsTable.createdAt))
    .limit(200);

  const enriched = await Promise.all(
    rows.map(async (r) => {
      const items = await db
        .select({
          quantity: cartItemsTable.quantity,
          priceCents: productsTable.priceCents,
        })
        .from(cartItemsTable)
        .innerJoin(
          productsTable,
          eq(productsTable.id, cartItemsTable.productId),
        )
        .where(eq(cartItemsTable.cartId, r.cartId));
      const subtotalCents = items.reduce(
        (s, i) => s + i.priceCents * i.quantity,
        0,
      );
      const itemCount = items.reduce((s, i) => s + i.quantity, 0);
      return { ...r, subtotalCents, itemCount };
    }),
  );
  res.json(ListAdminAbandonedCartsResponse.parse(enriched));
});

// ---------- Tax summary ----------

router.get("/admin/tax-summary", async (_req, res): Promise<void> => {
  // Aggregate across all revenue-recognized states so totals don't drop out
  // when an order transitions from `paid` to `shipped`/`fulfilled`.
  const REVENUE_STATUSES = ["paid", "shipped", "delivered", "fulfilled"];
  const [row] = await db
    .select({
      taxCollectedCents: sum(ordersTable.taxCents),
      taxableOrders: count(),
    })
    .from(ordersTable)
    .where(inArray(ordersTable.status, REVENUE_STATUSES));
  const stripeTaxEnabled = process.env.STRIPE_TAX_ENABLED === "1";
  res.json(
    GetAdminTaxSummaryResponse.parse({
      taxCollectedCents: Number(row?.taxCollectedCents ?? 0),
      taxableOrders: Number(row?.taxableOrders ?? 0),
      currency: "usd",
      stripeTaxEnabled,
      warning: stripeTaxEnabled
        ? null
        : "Stripe Tax is disabled. Set STRIPE_TAX_ENABLED=1 once tax is configured in your Stripe dashboard.",
    }),
  );
});

export default router;
