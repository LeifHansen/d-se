import { sql } from "drizzle-orm";
import {
  db,
  productsTable,
  stockEventsTable,
  type StockEventReason,
} from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type StockEventDb = Tx | typeof db;

/**
 * Atomically adjust a product's inventory and record a stock_events row
 * capturing the actual delta applied and the resulting inventory.
 *
 * Uses a CTE with `SELECT ... FOR UPDATE` so the old value read and the new
 * value written are consistent under concurrent webhook deliveries. The clamp
 * at zero is preserved for decrements; the recorded `delta` is the real
 * change (`newInventory - oldInventory`), not the requested change, so a
 * decrement that ran into the floor logs a smaller absolute delta.
 *
 * Pass the active transaction (`tx`) so the event is committed atomically
 * with the inventory mutation it describes.
 */
export async function applyInventoryDelta(
  exec: StockEventDb,
  args: {
    productId: number;
    delta: number;
    reason: StockEventReason;
    orderId?: number | null;
  },
): Promise<{ oldInventory: number; newInventory: number } | null> {
  const { productId, delta, reason, orderId = null } = args;
  const result = await exec.execute(sql`
    WITH locked AS (
      SELECT id, inventory AS old_inventory FROM ${productsTable}
       WHERE id = ${productId} FOR UPDATE
    ), updated AS (
      UPDATE ${productsTable}
         SET inventory = GREATEST(0, inventory + ${delta}),
             updated_at = NOW()
       WHERE id = ${productId}
       RETURNING inventory AS new_inventory
    )
    SELECT locked.old_inventory, updated.new_inventory
      FROM locked, updated
  `);
  const row = (result.rows ?? [])[0] as
    | { old_inventory: number; new_inventory: number }
    | undefined;
  if (!row) return null;
  const oldInventory = Number(row.old_inventory);
  const newInventory = Number(row.new_inventory);
  const actualDelta = newInventory - oldInventory;
  await exec.insert(stockEventsTable).values({
    productId,
    delta: actualDelta,
    newInventory,
    reason,
    orderId,
  });
  return { oldInventory, newInventory };
}

/**
 * Record a manual edit where the admin sets inventory to an absolute value
 * (rather than applying a delta). Reads the current value, writes the new
 * one, and inserts a stock_events row only if the value actually changed.
 */
export async function recordManualInventorySet(
  exec: StockEventDb,
  args: { productId: number; newInventory: number },
): Promise<void> {
  const { productId, newInventory } = args;
  const result = await exec.execute(sql`
    WITH locked AS (
      SELECT id, inventory AS old_inventory FROM ${productsTable}
       WHERE id = ${productId} FOR UPDATE
    )
    SELECT old_inventory FROM locked
  `);
  const row = (result.rows ?? [])[0] as
    | { old_inventory: number }
    | undefined;
  if (!row) return;
  const oldInventory = Number(row.old_inventory);
  if (oldInventory === newInventory) return;
  await exec.insert(stockEventsTable).values({
    productId,
    delta: newInventory - oldInventory,
    newInventory,
    reason: "manual_edit",
    orderId: null,
  });
}
