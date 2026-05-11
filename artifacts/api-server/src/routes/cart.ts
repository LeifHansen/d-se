import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  db,
  cartsTable,
  cartItemsTable,
  productsTable,
} from "@workspace/db";
import {
  GetCartQueryParams,
  GetCartResponse,
  AddCartItemBody,
  AddCartItemResponse,
  UpdateCartItemParams,
  UpdateCartItemBody,
  UpdateCartItemResponse,
  RemoveCartItemParams,
  RemoveCartItemQueryParams,
  RemoveCartItemResponse,
} from "@workspace/api-zod";
import { validateDiscount } from "../lib/discounts";
import { getUserId, getUserEmail } from "../lib/auth";
import { recordAbandonedCart, verifyResumeToken } from "../lib/abandonedCart";

const router: IRouter = Router();

async function trackAbandonedCart(
  req: Parameters<typeof getUserEmail>[0],
  cartId: string,
): Promise<void> {
  try {
    const userId = getUserId(req);
    if (!userId) return;
    const email = await getUserEmail(req);
    if (!email) return;
    await recordAbandonedCart({ cartId, email, userId });
  } catch (err) {
    req.log.warn({ err, cartId }, "Failed to record abandoned cart");
  }
}

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

async function loadCart(cartId: string) {
  const [cart] = await db
    .select()
    .from(cartsTable)
    .where(eq(cartsTable.id, cartId));
  if (!cart) {
    return {
      id: cartId,
      items: [],
      subtotalCents: 0,
      currency: "usd",
      discountCode: null as string | null,
      discountCents: 0,
      totalCents: 0,
    };
  }
  const items = await db
    .select()
    .from(cartItemsTable)
    .where(eq(cartItemsTable.cartId, cartId));
  if (items.length === 0) {
    return {
      id: cart.id,
      items: [],
      subtotalCents: 0,
      currency: "usd",
      discountCode: cart.discountCode,
      discountCents: 0,
      totalCents: 0,
    };
  }
  const products = await db
    .select()
    .from(productsTable)
    .where(
      inArray(
        productsTable.id,
        items.map((i) => i.productId),
      ),
    );
  const byId = new Map(products.map((p) => [p.id, p]));
  const enrichedItems = items
    .map((it) => {
      const product = byId.get(it.productId);
      if (!product) return null;
      return {
        id: it.id,
        productId: it.productId,
        quantity: it.quantity,
        product: serializeProduct(product),
        lineTotalCents: product.priceCents * it.quantity,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const subtotalCents = enrichedItems.reduce(
    (s, i) => s + i.lineTotalCents,
    0,
  );

  let discountCents = 0;
  let discountCode = cart.discountCode;
  if (discountCode) {
    const validation = await validateDiscount(discountCode, subtotalCents);
    if (validation.valid) {
      discountCents = validation.discountCents;
    } else {
      // Code became invalid (expired, redemption cap, etc.) — clear silently.
      await db
        .update(cartsTable)
        .set({
          discountCode: null,
          discountCodeId: null,
          updatedAt: new Date(),
        })
        .where(eq(cartsTable.id, cart.id));
      discountCode = null;
    }
  }

  return {
    id: cart.id,
    items: enrichedItems,
    subtotalCents,
    currency: enrichedItems[0]?.product.currency ?? "usd",
    discountCode,
    discountCents,
    totalCents: Math.max(0, subtotalCents - discountCents),
  };
}

async function ensureCart(cartId?: string | null): Promise<string> {
  if (cartId) {
    const [existing] = await db
      .select()
      .from(cartsTable)
      .where(eq(cartsTable.id, cartId));
    if (existing) return existing.id;
  }
  const id = cartId ?? nanoid(16);
  await db.insert(cartsTable).values({ id }).onConflictDoNothing();
  return id;
}

router.get("/cart", async (req, res): Promise<void> => {
  const parsed = GetCartQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = parsed.data.cartId ?? nanoid(16);
  const cart = await loadCart(id);
  res.json(GetCartResponse.parse(cart));
});

router.post("/cart/items", async (req, res): Promise<void> => {
  const parsed = AddCartItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const cartId = await ensureCart(parsed.data.cartId);
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, parsed.data.productId));
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const [existing] = await db
    .select()
    .from(cartItemsTable)
    .where(
      and(
        eq(cartItemsTable.cartId, cartId),
        eq(cartItemsTable.productId, parsed.data.productId),
      ),
    );
  if (existing) {
    await db
      .update(cartItemsTable)
      .set({ quantity: existing.quantity + parsed.data.quantity })
      .where(eq(cartItemsTable.id, existing.id));
  } else {
    await db.insert(cartItemsTable).values({
      cartId,
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
    });
  }
  await trackAbandonedCart(req, cartId);
  const cart = await loadCart(cartId);
  res.json(AddCartItemResponse.parse(cart));
});

router.patch("/cart/items/:itemId", async (req, res): Promise<void> => {
  const params = UpdateCartItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateCartItemBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (body.data.quantity <= 0) {
    await db
      .delete(cartItemsTable)
      .where(eq(cartItemsTable.id, params.data.itemId));
  } else {
    await db
      .update(cartItemsTable)
      .set({ quantity: body.data.quantity })
      .where(eq(cartItemsTable.id, params.data.itemId));
  }
  await trackAbandonedCart(req, body.data.cartId);
  const cart = await loadCart(body.data.cartId);
  res.json(UpdateCartItemResponse.parse(cart));
});

router.delete("/cart/items/:itemId", async (req, res): Promise<void> => {
  const params = RemoveCartItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const query = RemoveCartItemQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  await db
    .delete(cartItemsTable)
    .where(eq(cartItemsTable.id, params.data.itemId));
  const cart = await loadCart(query.data.cartId);
  res.json(RemoveCartItemResponse.parse(cart));
});

router.post("/cart/discount", async (req, res): Promise<void> => {
  const cartId =
    typeof req.body?.cartId === "string" ? req.body.cartId : null;
  const code =
    typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";
  if (!cartId || !code) {
    res.status(400).json({ error: "cartId and code are required" });
    return;
  }
  await ensureCart(cartId);
  // Compute current subtotal to validate min-subtotal rules.
  const currentCart = await loadCart(cartId);
  const validation = await validateDiscount(code, currentCart.subtotalCents);
  if (!validation.valid) {
    res.status(400).json({ error: validation.reason, valid: false });
    return;
  }
  await db
    .update(cartsTable)
    .set({
      discountCode: code,
      discountCodeId: validation.code.id,
      updatedAt: new Date(),
    })
    .where(eq(cartsTable.id, cartId));
  const cart = await loadCart(cartId);
  res.json(GetCartResponse.parse(cart));
});

router.delete("/cart/discount", async (req, res): Promise<void> => {
  const cartId =
    typeof req.query.cartId === "string" ? req.query.cartId : null;
  if (!cartId) {
    res.status(400).json({ error: "cartId is required" });
    return;
  }
  await db
    .update(cartsTable)
    .set({ discountCode: null, discountCodeId: null, updatedAt: new Date() })
    .where(eq(cartsTable.id, cartId));
  const cart = await loadCart(cartId);
  res.json(GetCartResponse.parse(cart));
});

router.get("/cart/resume", async (req, res): Promise<void> => {
  const cartId = typeof req.query.cartId === "string" ? req.query.cartId : "";
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!cartId || !token) {
    res.status(400).json({ error: "cartId and token are required" });
    return;
  }
  if (!verifyResumeToken(cartId, token)) {
    res.status(403).json({ error: "Invalid or expired resume link" });
    return;
  }
  const cart = await loadCart(cartId);
  res.json(GetCartResponse.parse(cart));
});

export default router;
export { loadCart };
export type LoadedCart = Awaited<ReturnType<typeof loadCart>>;
