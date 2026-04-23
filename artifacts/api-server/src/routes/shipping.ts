import { Router, type IRouter } from "express";
import {
  GetShippingRatesBody,
  GetShippingRatesResponse,
} from "@workspace/api-zod";
import { loadCart } from "./cart";
import {
  getEasyPost,
  isEasyPostConfigured,
  FROM_ADDRESS,
} from "../lib/easypost";

const router: IRouter = Router();

router.post("/shipping/rates", async (req, res): Promise<void> => {
  const parsed = GetShippingRatesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const cart = await loadCart(parsed.data.cartId);
  if (cart.items.length === 0) {
    res.status(400).json({ error: "Cart is empty" });
    return;
  }

  if (!isEasyPostConfigured()) {
    // Fallback flat-rate options when EasyPost not yet configured.
    const itemCount = cart.items.reduce((s, i) => s + i.quantity, 0);
    res.json(
      GetShippingRatesResponse.parse([
        {
          id: "flat-standard",
          carrier: "Standard",
          service: "Ground (5-7 days)",
          amountCents: 595 + itemCount * 100,
          currency: "usd",
          deliveryDays: 6,
        },
        {
          id: "flat-express",
          carrier: "Express",
          service: "Express (2-3 days)",
          amountCents: 1495 + itemCount * 150,
          currency: "usd",
          deliveryDays: 3,
        },
      ]),
    );
    return;
  }

  try {
    const ep = getEasyPost();
    const totalWeightOz = Math.max(
      4,
      cart.items.reduce(
        (s, i) =>
          s + (i.product.weightOz ?? 8) * i.quantity,
        0,
      ),
    );
    const a = parsed.data.address;
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
      parcel: {
        length: 9,
        width: 6,
        height: 3,
        weight: totalWeightOz,
      },
    });
    const rates = (shipment.rates ?? []).map((r: {
      id: string;
      carrier: string;
      service: string;
      rate: string;
      currency?: string;
      delivery_days?: number | null;
    }) => ({
        id: r.id,
        carrier: r.carrier,
        service: r.service,
        amountCents: Math.round(parseFloat(r.rate) * 100),
        currency: r.currency?.toLowerCase() ?? "usd",
        deliveryDays: r.delivery_days ?? null,
      }),
    );
    res.json(GetShippingRatesResponse.parse(rates));
  } catch (err) {
    req.log.error({ err }, "EasyPost rates failed");
    res.status(500).json({ error: "Failed to fetch shipping rates" });
  }
});

export default router;
