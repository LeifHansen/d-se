import { Router, type IRouter } from "express";
import {
  ValidateDiscountBody,
  ValidateDiscountResponse,
} from "@workspace/api-zod";
import { loadCart } from "./cart";
import { validateDiscount } from "../lib/discounts";

const router: IRouter = Router();

router.post("/discounts/validate", async (req, res): Promise<void> => {
  const parsed = ValidateDiscountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const cart = await loadCart(parsed.data.cartId);
  const result = await validateDiscount(parsed.data.code, cart.subtotalCents);
  if (!result.valid) {
    res.json(
      ValidateDiscountResponse.parse({
        valid: false,
        reason: result.reason,
        code: parsed.data.code,
        type: null,
        value: null,
        discountCents: 0,
        subtotalCents: cart.subtotalCents,
        totalCents: cart.subtotalCents,
      }),
    );
    return;
  }
  res.json(
    ValidateDiscountResponse.parse({
      valid: true,
      reason: null,
      code: result.code.code,
      type: result.code.type as "percent" | "fixed",
      value: result.code.value,
      discountCents: result.discountCents,
      subtotalCents: result.subtotalCents,
      totalCents: result.totalCents,
    }),
  );
});

export default router;
