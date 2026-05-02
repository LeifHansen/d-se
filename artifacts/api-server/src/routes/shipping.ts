import { Router, type IRouter } from "express";
import {
  GetShippingRatesBody,
  GetShippingRatesResponse,
} from "@workspace/api-zod";
import { loadCart, type LoadedCart } from "./cart";
import {
  getEasyPost,
  isEasyPostConfigured,
  FROM_ADDRESS,
} from "../lib/easypost";

const router: IRouter = Router();

export type ShippingRate = {
  id: string;
  carrier: string;
  service: string;
  amountCents: number;
  currency: string;
  deliveryDays: number | null;
};

export type ShippingAddress = {
  name: string;
  street1: string;
  street2?: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string | null;
};

export async function computeShippingRates(
  cart: LoadedCart,
  address: ShippingAddress,
): Promise<ShippingRate[]> {
  if (!isEasyPostConfigured()) {
    const itemCount = cart.items.reduce((s, i) => s + i.quantity, 0);
    return [
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
    ];
  }
  const ep = getEasyPost();
  const totalWeightOz = Math.max(
    4,
    cart.items.reduce(
      (s, i) => s + (i.product.weightOz ?? 8) * i.quantity,
      0,
    ),
  );
  const shipment = await ep.Shipment.create({
    to_address: {
      name: address.name,
      street1: address.street1,
      street2: address.street2 ?? undefined,
      city: address.city,
      state: address.state,
      zip: address.zip,
      country: address.country,
      phone: address.phone ?? undefined,
    },
    from_address: FROM_ADDRESS,
    parcel: { length: 9, width: 6, height: 3, weight: totalWeightOz },
  });
  return (shipment.rates ?? []).map(
    (r: {
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
}

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
  try {
    const rates = await computeShippingRates(cart, parsed.data.address);
    res.json(GetShippingRatesResponse.parse(rates));
  } catch (err) {
    req.log.error({ err }, "EasyPost rates failed");
    res.status(500).json({ error: "Failed to fetch shipping rates" });
  }
});

export default router;
