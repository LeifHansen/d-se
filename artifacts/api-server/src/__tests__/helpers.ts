import express, { type Express } from "express";
import { db } from "./testDb";
import {
  productsTable,
  cartsTable,
  cartItemsTable,
  discountCodesTable,
} from "@workspace/db";

export function makeApp(
  mount: (router: express.Router) => void,
): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { log: { error: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; info: (...a: unknown[]) => void } }).log = {
      error: () => {},
      warn: () => {},
      info: () => {},
    };
    next();
  });
  const r = express.Router();
  mount(r);
  app.use("/api", r);
  return app;
}

export async function seedProduct(opts?: {
  slug?: string;
  name?: string;
  priceCents?: number;
  inventory?: number;
}): Promise<{ id: number; slug: string }> {
  const [row] = await db
    .insert(productsTable)
    .values({
      slug: opts?.slug ?? "test-product",
      name: opts?.name ?? "Test Product",
      priceCents: opts?.priceCents ?? 5_000,
      inventory: opts?.inventory ?? 10,
    })
    .returning();
  return { id: row.id, slug: row.slug };
}

export async function seedCart(opts: {
  cartId: string;
  productId: number;
  quantity?: number;
  discountCode?: string | null;
  discountCodeId?: number | null;
  email?: string | null;
}): Promise<void> {
  await db.insert(cartsTable).values({
    id: opts.cartId,
    email: opts.email ?? null,
    discountCode: opts.discountCode ?? null,
    discountCodeId: opts.discountCodeId ?? null,
  });
  await db.insert(cartItemsTable).values({
    cartId: opts.cartId,
    productId: opts.productId,
    quantity: opts.quantity ?? 1,
  });
}

export async function seedDiscount(opts: {
  code: string;
  type?: "percent" | "fixed";
  value?: number;
  active?: boolean;
  expiresAt?: Date | null;
  maxRedemptions?: number | null;
  redemptionsCount?: number;
  minSubtotalCents?: number | null;
}): Promise<{ id: number }> {
  const [row] = await db
    .insert(discountCodesTable)
    .values({
      code: opts.code,
      type: opts.type ?? "percent",
      value: opts.value ?? 10,
      active: opts.active ?? true,
      expiresAt: opts.expiresAt ?? null,
      maxRedemptions: opts.maxRedemptions ?? null,
      redemptionsCount: opts.redemptionsCount ?? 0,
      minSubtotalCents: opts.minSubtotalCents ?? null,
    })
    .returning();
  return { id: row.id };
}
