import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { getCartId, setCartId } from "@/lib/cart-id";

export type CartProduct = {
  id: number;
  slug: string;
  name: string;
  priceCents: number;
  currency: string;
  images: string[];
  inventory: number;
};

export type CartItem = {
  id: number;
  productId: number;
  quantity: number;
  product: CartProduct;
  lineTotalCents: number;
};

export type Cart = {
  id: string;
  items: CartItem[];
  subtotalCents: number;
  currency: string;
  discountCode: string | null;
  discountCents: number;
  totalCents: number;
};

const CART_KEY = ["cart"] as const;

function normalize(raw: unknown): Cart {
  const c = raw as Partial<Cart> & { id: string };
  return {
    id: c.id,
    items: (c.items ?? []) as CartItem[],
    subtotalCents: c.subtotalCents ?? 0,
    currency: c.currency ?? "usd",
    discountCode: c.discountCode ?? null,
    discountCents: c.discountCents ?? 0,
    totalCents: c.totalCents ?? c.subtotalCents ?? 0,
  };
}

export function useCart(): UseQueryResult<Cart> {
  const qc = useQueryClient();
  const query = useQuery<Cart>({
    queryKey: CART_KEY,
    queryFn: async () => {
      const id = getCartId();
      const params = id ? `?cartId=${encodeURIComponent(id)}` : "";
      const data = await apiFetch<unknown>(`/cart${params}`);
      const cart = normalize(data);
      if (cart.id && cart.id !== id) setCartId(cart.id);
      return cart;
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (query.data?.id) setCartId(query.data.id);
  }, [query.data?.id]);

  // Surface to other hooks
  void qc;
  return query;
}

export function useAddToCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { productId: number; quantity?: number }) => {
      const cartId = getCartId();
      const data = await apiFetch<unknown>(`/cart/items`, {
        method: "POST",
        body: JSON.stringify({
          cartId: cartId ?? undefined,
          productId: vars.productId,
          quantity: vars.quantity ?? 1,
        }),
      });
      const cart = normalize(data);
      if (cart.id) setCartId(cart.id);
      return cart;
    },
    onSuccess: (cart) => {
      qc.setQueryData(CART_KEY, cart);
    },
  });
}

export function useUpdateCartItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { itemId: number; quantity: number }) => {
      const cartId = getCartId();
      if (!cartId) throw new Error("No cart");
      const data = await apiFetch<unknown>(`/cart/items/${vars.itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ cartId, quantity: vars.quantity }),
      });
      return normalize(data);
    },
    onSuccess: (cart) => qc.setQueryData(CART_KEY, cart),
  });
}

export function useRemoveCartItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { itemId: number }) => {
      const cartId = getCartId();
      if (!cartId) throw new Error("No cart");
      const data = await apiFetch<unknown>(
        `/cart/items/${vars.itemId}?cartId=${encodeURIComponent(cartId)}`,
        { method: "DELETE" },
      );
      return normalize(data);
    },
    onSuccess: (cart) => qc.setQueryData(CART_KEY, cart),
  });
}

export type ValidateResult = {
  valid: boolean;
  reason: string | null;
  code: string | null;
  type: "percent" | "fixed" | null;
  value: number | null;
  discountCents: number;
  subtotalCents: number;
  totalCents: number;
};

export function useValidateDiscount() {
  return useMutation({
    mutationFn: async (vars: { code: string; cartId: string }): Promise<ValidateResult> => {
      const data = await apiFetch<ValidateResult>(`/discounts/validate`, {
        method: "POST",
        body: JSON.stringify(vars),
      });
      return data;
    },
  });
}

export function useApplyDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { code: string }) => {
      const cartId = getCartId();
      if (!cartId) throw new Error("No cart");
      const data = await apiFetch<unknown>(`/cart/discount`, {
        method: "POST",
        body: JSON.stringify({ cartId, code: vars.code }),
      });
      return normalize(data);
    },
    onSuccess: (cart) => qc.setQueryData(CART_KEY, cart),
  });
}

export function useRemoveDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const cartId = getCartId();
      if (!cartId) throw new Error("No cart");
      const data = await apiFetch<unknown>(
        `/cart/discount?cartId=${encodeURIComponent(cartId)}`,
        { method: "DELETE" },
      );
      return normalize(data);
    },
    onSuccess: (cart) => qc.setQueryData(CART_KEY, cart),
  });
}

export async function resumeCartFromToken(
  cartId: string,
  token: string,
  qc: ReturnType<typeof useQueryClient>,
): Promise<Cart> {
  const data = await apiFetch<unknown>(
    `/cart/resume?cartId=${encodeURIComponent(cartId)}&token=${encodeURIComponent(token)}`,
  );
  const cart = normalize(data);
  setCartId(cart.id);
  qc.setQueryData(CART_KEY, cart);
  return cart;
}
