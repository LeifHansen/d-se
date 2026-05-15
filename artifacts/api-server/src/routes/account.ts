import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  userProfilesTable,
  type OrderAddress,
} from "@workspace/db";
import { UpdateMySavedAddressBody } from "@workspace/api-zod";
import { getUserId, requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/me/saved-address", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req)!;
  const [row] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId));
  res.json({ address: row?.savedAddress ?? null });
});

router.put("/me/saved-address", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateMySavedAddressBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = getUserId(req)!;
  const address = parsed.data.address as OrderAddress;
  const now = new Date();
  await db
    .insert(userProfilesTable)
    .values({ userId, savedAddress: address, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: userProfilesTable.userId,
      set: { savedAddress: address, updatedAt: now },
    });
  res.json({ address });
});

router.delete("/me/saved-address", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req)!;
  await db
    .update(userProfilesTable)
    .set({ savedAddress: null, updatedAt: new Date() })
    .where(eq(userProfilesTable.userId, userId));
  res.json({ address: null });
});

export default router;
