import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, resetDb } from "./testDb";
import { abandonedCartsTable, cartsTable } from "@workspace/db";
import { seedCart, seedProduct } from "./helpers";

const emailMock = vi.hoisted(() => ({
  sendAbandonedCartEmail: vi.fn(async (_arg: unknown) => {}),
}));

vi.mock("../lib/email", () => ({
  sendAbandonedCartEmail: emailMock.sendAbandonedCartEmail,
  sendOrderConfirmation: vi.fn(async () => {}),
  sendLowStockDigest: vi.fn(async () => {}),
  sendWelcomeEmail: vi.fn(async () => {}),
  STORE_NAME: "Test",
}));

const {
  runAbandonedCartCheck,
  recordAbandonedCart,
  markCartRecovered,
} = await import("../lib/abandonedCart");

async function ageCart(cartId: string, hoursAgo: number): Promise<void> {
  const past = new Date(Date.now() - hoursAgo * 3600 * 1000);
  await db
    .update(cartsTable)
    .set({ updatedAt: past })
    .where(eq(cartsTable.id, cartId));
  await db.execute(
    sql`UPDATE abandoned_carts SET updated_at = ${past} WHERE cart_id = ${cartId}`,
  );
}

async function ageFirstReminder(
  cartId: string,
  hoursAgo: number,
): Promise<void> {
  const past = new Date(Date.now() - hoursAgo * 3600 * 1000);
  await db
    .update(abandonedCartsTable)
    .set({ firstReminderSentAt: past })
    .where(eq(abandonedCartsTable.cartId, cartId));
}

describe("abandoned cart scheduler", () => {
  beforeEach(async () => {
    await resetDb();
    emailMock.sendAbandonedCartEmail.mockClear();
  });

  it("sends a first reminder for a stale cart, then a second after the next interval, but only once per stage", async () => {
    const product = await seedProduct({ priceCents: 2_500 });
    const cartId = "cart-aban-1";
    await seedCart({
      cartId,
      productId: product.id,
      quantity: 2,
      email: "shopper@example.com",
    });
    await recordAbandonedCart({
      cartId,
      email: "shopper@example.com",
    });
    // Make the cart 6h old → eligible for first reminder (default 4h).
    await ageCart(cartId, 6);

    await runAbandonedCartCheck();

    expect(emailMock.sendAbandonedCartEmail).toHaveBeenCalledTimes(1);
    const firstCallArg = emailMock.sendAbandonedCartEmail.mock.calls[0]![0] as {
      to: string;
      reminderNumber: number;
      subtotalCents: number;
      resumeUrl: string;
    };
    expect(firstCallArg.to).toBe("shopper@example.com");
    expect(firstCallArg.reminderNumber).toBe(1);
    expect(firstCallArg.subtotalCents).toBe(5_000);
    expect(firstCallArg.resumeUrl).toContain("token=");

    // Run again immediately — should NOT re-send first reminder.
    await runAbandonedCartCheck();
    expect(emailMock.sendAbandonedCartEmail).toHaveBeenCalledTimes(1);

    // Age the first reminder past the second-reminder cutoff (default 24h).
    await ageFirstReminder(cartId, 30);
    await runAbandonedCartCheck();
    expect(emailMock.sendAbandonedCartEmail).toHaveBeenCalledTimes(2);
    const secondCallArg = emailMock.sendAbandonedCartEmail.mock.calls[1]![0] as {
      reminderNumber: number;
    };
    expect(secondCallArg.reminderNumber).toBe(2);

    // Running again should not produce a third email.
    await runAbandonedCartCheck();
    expect(emailMock.sendAbandonedCartEmail).toHaveBeenCalledTimes(2);
  });

  it("skips carts that have already checked out", async () => {
    const product = await seedProduct({ priceCents: 1_000 });
    const cartId = "cart-aban-checkedout";
    await seedCart({
      cartId,
      productId: product.id,
      email: "x@example.com",
    });
    await recordAbandonedCart({ cartId, email: "x@example.com" });
    await ageCart(cartId, 10);
    await db
      .update(cartsTable)
      .set({ checkedOutAt: new Date() })
      .where(eq(cartsTable.id, cartId));

    await runAbandonedCartCheck();
    expect(emailMock.sendAbandonedCartEmail).not.toHaveBeenCalled();
  });

  it("markCartRecovered records the order id and timestamp", async () => {
    const product = await seedProduct({ priceCents: 1_000 });
    const cartId = "cart-aban-recover";
    await seedCart({
      cartId,
      productId: product.id,
      email: "y@example.com",
    });
    await recordAbandonedCart({ cartId, email: "y@example.com" });

    await markCartRecovered(cartId, 42);

    const [row] = await db
      .select()
      .from(abandonedCartsTable)
      .where(eq(abandonedCartsTable.cartId, cartId));
    expect(row.recoveredAt).not.toBeNull();
    expect(row.recoveredOrderId).toBe("42");
  });
});
