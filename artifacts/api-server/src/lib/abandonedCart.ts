import crypto from "crypto";
import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import {
  db,
  abandonedCartsTable,
  cartsTable,
  cartItemsTable,
  productsTable,
} from "@workspace/db";
import { sendAbandonedCartEmail } from "./email";
import { logger } from "./logger";

const FIRST_REMINDER_HOURS = Number(
  process.env.ABANDONED_CART_FIRST_HOURS ?? 4,
);
const SECOND_REMINDER_HOURS = Number(
  process.env.ABANDONED_CART_SECOND_HOURS ?? 24,
);
const POLL_INTERVAL_MS = Number(
  process.env.ABANDONED_CART_POLL_MS ?? 15 * 60 * 1000,
);

function getResumeSecret(): string {
  const secret =
    process.env.ABANDONED_CART_SECRET ?? process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "ABANDONED_CART_SECRET (or SESSION_SECRET) must be set to sign resume links",
    );
  }
  return secret;
}

const RESUME_TOKEN_TTL_MS = Number(
  process.env.ABANDONED_CART_RESUME_TTL_MS ?? 14 * 24 * 60 * 60 * 1000,
);

function macFor(cartId: string, issuedAt: number): string {
  return crypto
    .createHmac("sha256", getResumeSecret())
    .update(`${cartId}.${issuedAt}`)
    .digest("hex")
    .slice(0, 32);
}

export function signResumeToken(cartId: string, now: number = Date.now()): string {
  // Format: <issuedAtMs>.<hmac>. Including the timestamp allows TTL
  // enforcement at verify time so resume links can't be replayed forever.
  return `${now}.${macFor(cartId, now)}`;
}

export function verifyResumeToken(cartId: string, token: string): boolean {
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const issuedAtStr = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > RESUME_TOKEN_TTL_MS) return false;
  const expected = macFor(cartId, issuedAt);
  if (expected.length !== mac.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(mac));
}

export function buildResumeUrl(cartId: string): string {
  const baseUrl =
    process.env.PUBLIC_APP_URL ??
    `https://${process.env.REPLIT_DEV_DOMAIN ?? "localhost"}`;
  const token = signResumeToken(cartId);
  // Storefront /cart route is expected to read these params and exchange them
  // for cart contents via GET /api/cart/resume?cartId=...&token=... which
  // verifies the HMAC before returning the cart.
  return `${baseUrl}/cart?cartId=${encodeURIComponent(cartId)}&token=${token}`;
}

async function loadCartSnapshot(cartId: string) {
  const items = await db
    .select({
      quantity: cartItemsTable.quantity,
      productName: productsTable.name,
      priceCents: productsTable.priceCents,
      image: sql<string | null>`(${productsTable.images} ->> 0)`,
    })
    .from(cartItemsTable)
    .innerJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
    .where(eq(cartItemsTable.cartId, cartId));
  const subtotalCents = items.reduce(
    (s, i) => s + i.priceCents * i.quantity,
    0,
  );
  return { items, subtotalCents };
}

async function processFirstReminders(cutoff: Date): Promise<void> {
  // Atomic claim: pick rows whose linked cart hasn't checked out + has been
  // idle past the cutoff, and flip firstReminderSentAt in the same statement
  // so a parallel worker can never claim the same row.
  const eligibleCartIds = db
    .select({ id: abandonedCartsTable.id })
    .from(abandonedCartsTable)
    .innerJoin(cartsTable, eq(cartsTable.id, abandonedCartsTable.cartId))
    .where(
      and(
        isNull(abandonedCartsTable.firstReminderSentAt),
        isNull(abandonedCartsTable.recoveredAt),
        isNull(cartsTable.checkedOutAt),
        lt(abandonedCartsTable.updatedAt, cutoff),
        lt(cartsTable.updatedAt, cutoff),
      ),
    )
    .limit(50);
  const claimed = await db
    .update(abandonedCartsTable)
    .set({ firstReminderSentAt: new Date() })
    .where(inArray(abandonedCartsTable.id, eligibleCartIds))
    .returning({
      id: abandonedCartsTable.id,
      cartId: abandonedCartsTable.cartId,
      email: abandonedCartsTable.email,
    });

  for (const c of claimed) {
    const snap = await loadCartSnapshot(c.cartId);
    if (snap.items.length === 0) continue;
    try {
      await sendAbandonedCartEmail({
        to: c.email,
        cartId: c.cartId,
        resumeUrl: buildResumeUrl(c.cartId),
        items: snap.items.map((i) => ({
          name: i.productName,
          quantity: i.quantity,
          priceCents: i.priceCents,
        })),
        subtotalCents: snap.subtotalCents,
        reminderNumber: 1,
      });
    } catch (err) {
      logger.warn({ err, cartId: c.cartId }, "First reminder email failed");
    }
  }
}

async function processSecondReminders(cutoff: Date): Promise<void> {
  const eligibleCartIds = db
    .select({ id: abandonedCartsTable.id })
    .from(abandonedCartsTable)
    .innerJoin(cartsTable, eq(cartsTable.id, abandonedCartsTable.cartId))
    .where(
      and(
        isNotNull(abandonedCartsTable.firstReminderSentAt),
        isNull(abandonedCartsTable.secondReminderSentAt),
        isNull(abandonedCartsTable.recoveredAt),
        isNull(cartsTable.checkedOutAt),
        lt(abandonedCartsTable.firstReminderSentAt, cutoff),
      ),
    )
    .limit(50);
  const claimed = await db
    .update(abandonedCartsTable)
    .set({ secondReminderSentAt: new Date() })
    .where(inArray(abandonedCartsTable.id, eligibleCartIds))
    .returning({
      id: abandonedCartsTable.id,
      cartId: abandonedCartsTable.cartId,
      email: abandonedCartsTable.email,
    });

  for (const c of claimed) {
    const snap = await loadCartSnapshot(c.cartId);
    if (snap.items.length === 0) continue;
    try {
      await sendAbandonedCartEmail({
        to: c.email,
        cartId: c.cartId,
        resumeUrl: buildResumeUrl(c.cartId),
        items: snap.items.map((i) => ({
          name: i.productName,
          quantity: i.quantity,
          priceCents: i.priceCents,
        })),
        subtotalCents: snap.subtotalCents,
        reminderNumber: 2,
      });
    } catch (err) {
      logger.warn({ err, cartId: c.cartId }, "Second reminder email failed");
    }
  }
}

export async function runAbandonedCartCheck(): Promise<void> {
  const now = Date.now();
  const firstCutoff = new Date(now - FIRST_REMINDER_HOURS * 3600 * 1000);
  const secondCutoff = new Date(now - SECOND_REMINDER_HOURS * 3600 * 1000);
  try {
    await processFirstReminders(firstCutoff);
    await processSecondReminders(secondCutoff);
  } catch (err) {
    logger.error({ err }, "Abandoned cart job failed");
  }
}

export async function recordAbandonedCart(opts: {
  cartId: string;
  email: string;
  userId?: string | null;
}): Promise<void> {
  const [existing] = await db
    .select()
    .from(abandonedCartsTable)
    .where(eq(abandonedCartsTable.cartId, opts.cartId));
  if (existing) {
    await db
      .update(abandonedCartsTable)
      .set({
        email: opts.email,
        userId: opts.userId ?? existing.userId,
        updatedAt: new Date(),
      })
      .where(eq(abandonedCartsTable.id, existing.id));
    return;
  }
  await db.insert(abandonedCartsTable).values({
    cartId: opts.cartId,
    email: opts.email,
    userId: opts.userId ?? null,
  });
}

export async function markCartRecovered(
  cartId: string,
  orderId: number | string,
): Promise<void> {
  await db
    .update(abandonedCartsTable)
    .set({
      recoveredAt: new Date(),
      recoveredOrderId: String(orderId),
      updatedAt: new Date(),
    })
    .where(eq(abandonedCartsTable.cartId, cartId));
}

let timer: NodeJS.Timeout | null = null;

export function startAbandonedCartScheduler(): void {
  if (timer || process.env.DISABLE_ABANDONED_CART === "1") return;
  // Stagger initial run so we don't fire on every boot.
  setTimeout(() => {
    void runAbandonedCartCheck();
  }, 30_000);
  timer = setInterval(() => {
    void runAbandonedCartCheck();
  }, POLL_INTERVAL_MS);
  logger.info(
    { intervalMs: POLL_INTERVAL_MS },
    "Abandoned cart scheduler started",
  );
}
