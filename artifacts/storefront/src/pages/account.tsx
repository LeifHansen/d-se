import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMyOrders,
  useReorder,
  useGetMySavedAddress,
  useUpdateMySavedAddress,
  useDeleteMySavedAddress,
  getGetMySavedAddressQueryKey,
  getGetCartQueryKey,
  type AddressInput,
  type Order,
} from "@workspace/api-client-react";
import { SiteShell } from "@/components/dose/SiteShell";
import { OrderStatusBadge } from "@/components/dose/OrderStatusBadge";
import { Seo } from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatMoney,
  getStoredCartId,
  setStoredCartId,
  requestOpenCartDrawer,
} from "@/lib/cart";
import { useToast } from "@/hooks/use-toast";

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}

function GuestOrderLookup() {
  const [, setLocation] = useLocation();
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const id = orderId.trim().replace(/^#/, "");
    if (!/^\d+$/.test(id)) {
      setErr("Order number should be digits only.");
      return;
    }
    if (!email.trim()) {
      setErr("Enter the email used at checkout.");
      return;
    }
    setErr(null);
    // The order detail page will perform the lookup (and show an error there
    // if the email doesn't match).
    setLocation(`/orders/${id}?email=${encodeURIComponent(email.trim())}`);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="mt-8 rounded-2xl border bg-card p-6"
      style={{ borderColor: "hsl(40 18% 80%)" }}
      data-testid="guest-order-lookup"
    >
      <h2 className="font-display text-2xl">Check on a guest order</h2>
      <p className="mt-1 text-sm" style={{ color: "hsl(170 18% 32%)" }}>
        Enter the order number from your confirmation email and the email you
        used at checkout.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="lookup-order">Order number</Label>
          <Input
            id="lookup-order"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="1234"
            required
            data-testid="lookup-order-id"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="lookup-email">Email</Label>
          <Input
            id="lookup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            data-testid="lookup-order-email"
          />
        </div>
      </div>
      <Button
        type="submit"
        className="mt-4 rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
        style={{
          background: "hsl(170 58% 14%)",
          color: "hsl(45 49% 90%)",
        }}
        data-testid="lookup-order-submit"
      >
        Find my order
      </Button>
      {err ? (
        <p
          role="alert"
          className="mt-3 text-xs"
          style={{ color: "hsl(0 70% 35%)" }}
          data-testid="lookup-order-error"
        >
          {err}
        </p>
      ) : null}
    </form>
  );
}

function OrderRow({ order }: { order: Order }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const reorderMutation = useReorder();

  const handleReorder = () => {
    reorderMutation.mutate(
      { id: order.id, data: { cartId: getStoredCartId() } },
      {
        onSuccess: ({ cart, skipped }) => {
          if (cart?.id) setStoredCartId(cart.id);
          queryClient.invalidateQueries({
            queryKey: getGetCartQueryKey({ cartId: cart?.id }),
          });
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
          const added = order.items.length - skipped.length;
          if (added <= 0) {
            toast({
              title: "Nothing could be reordered",
              description:
                skipped.length > 0
                  ? `${skipped.map((s) => s.productName).join(", ")} ${skipped.length === 1 ? "is" : "are"} no longer available.`
                  : "This order has no items to reorder.",
              variant: "destructive",
            });
            return;
          }
          if (skipped.length > 0) {
            toast({
              title: "Some items were skipped",
              description: `${skipped.map((s) => `${s.productName} (${s.reason === "out_of_stock" ? "out of stock" : "unavailable"})`).join("; ")}.`,
            });
          } else {
            toast({
              title: "Added to cart",
              description: "Your past order is back in your cart.",
            });
          }
          requestOpenCartDrawer();
        },
        onError: () => {
          toast({
            title: "Couldn't reorder",
            description: "Please try again in a moment.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <li
      className="rounded-2xl border bg-card p-5 transition-colors hover:bg-card/80"
      style={{ borderColor: "hsl(40 18% 80%)" }}
      data-testid={`order-${order.id}`}
    >
      <Link
        href={`/account/orders/${order.id}`}
        className="block"
        data-testid={`link-order-${order.id}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-display text-xl">Order #{order.id}</p>
            <p
              className="text-xs uppercase tracking-[0.18em]"
              style={{ color: "hsl(170 18% 32%)" }}
            >
              {formatDate(String(order.createdAt))}
            </p>
            <div className="mt-2">
              <OrderStatusBadge
                status={order.status}
                testId={`order-${order.id}-status-badge`}
              />
            </div>
          </div>
          <p className="font-display text-lg">
            {formatMoney(order.totalCents, order.currency)}
          </p>
        </div>
        <ul
          className="mt-3 space-y-1 text-sm"
          style={{ color: "hsl(170 18% 28%)" }}
        >
          {order.items.map((it) => (
            <li key={it.id}>
              {it.productName}{" "}
              <span className="opacity-70">× {it.quantity}</span>
            </li>
          ))}
        </ul>
        {order.deliveredEmailSentAt ? (
          <p
            className="mt-2 text-xs"
            style={{ color: "hsl(170 18% 32%)" }}
            data-testid={`order-${order.id}-delivered-email-notice`}
          >
            Delivery confirmation emailed {formatDate(String(order.deliveredEmailSentAt))}
          </p>
        ) : null}
        {order.trackingCode ? (
          <p className="mt-2 text-sm">
            {order.carrier ? `${order.carrier}: ` : "Tracking: "}
            <code className="break-all">{order.trackingCode}</code>
            {order.trackingUrl ? (
              <>
                {" — "}
                <a
                  href={order.trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                  data-testid="account-order-tracking-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  Track package →
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/account/orders/${order.id}`}
          className="text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: "hsl(170 58% 14%)" }}
          data-testid={`link-order-details-${order.id}`}
        >
          View details →
        </Link>
        <Button
          type="button"
          onClick={handleReorder}
          disabled={reorderMutation.isPending || order.items.length === 0}
          className="rounded-full px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{
            background: "hsl(170 58% 14%)",
            color: "hsl(45 49% 90%)",
          }}
          data-testid={`button-reorder-${order.id}`}
        >
          {reorderMutation.isPending ? "Adding to cart…" : "Reorder"}
        </Button>
      </div>
    </li>
  );
}

const EMPTY_ADDRESS: AddressInput = {
  name: "",
  street1: "",
  street2: "",
  city: "",
  state: "",
  zip: "",
  country: "US",
  phone: "",
};

function SavedAddressCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetMySavedAddress({
    query: { retry: false } as never,
  });
  const update = useUpdateMySavedAddress();
  const remove = useDeleteMySavedAddress();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AddressInput>(EMPTY_ADDRESS);

  const saved = data?.address ?? null;

  const startEdit = () => {
    setDraft(saved ?? EMPTY_ADDRESS);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(EMPTY_ADDRESS);
  };

  const updateField =
    <K extends keyof AddressInput>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setDraft((a) => ({ ...a, [key]: e.target.value }));

  const onRemove = () => {
    if (!saved) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Remove your saved shipping address?")
    ) {
      return;
    }
    remove.mutate(undefined, {
      onSuccess: () => {
        queryClient.setQueryData(getGetMySavedAddressQueryKey(), {
          address: null,
        });
        setEditing(false);
        setDraft(EMPTY_ADDRESS);
        toast({
          title: "Address removed",
          description: "We won't pre-fill checkout from a saved address.",
        });
      },
      onError: () => {
        toast({
          title: "Couldn't remove address",
          description: "Please try again in a moment.",
          variant: "destructive",
        });
      },
    });
  };

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    update.mutate(
      { data: { address: draft } },
      {
        onSuccess: ({ address }) => {
          queryClient.setQueryData(getGetMySavedAddressQueryKey(), { address });
          setEditing(false);
          toast({
            title: "Address saved",
            description: "We'll use this for your next checkout.",
          });
        },
        onError: () => {
          toast({
            title: "Couldn't save address",
            description: "Please try again in a moment.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <section
      className="mb-10 rounded-2xl border bg-card p-6"
      style={{ borderColor: "hsl(40 18% 80%)" }}
      data-testid="saved-address"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">Saved shipping address</h2>
          <p
            className="mt-1 text-sm"
            style={{ color: "hsl(170 18% 32%)" }}
          >
            Used to pre-fill your next checkout.
          </p>
        </div>
        {!editing ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={startEdit}
              disabled={isLoading}
              className="rounded-full px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{
                background: "hsl(170 58% 14%)",
                color: "hsl(45 49% 90%)",
              }}
              data-testid="saved-address-edit"
            >
              {saved ? "Edit" : "Add address"}
            </Button>
            {saved ? (
              <button
                type="button"
                onClick={onRemove}
                disabled={remove.isPending}
                className="text-[11px] font-semibold uppercase tracking-[0.22em] underline underline-offset-4"
                style={{ color: "hsl(170 18% 32%)" }}
                data-testid="saved-address-remove"
              >
                {remove.isPending ? "Removing…" : "Remove"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {!editing ? (
        isLoading ? (
          <p className="mt-4 text-sm opacity-70" data-testid="saved-address-loading">
            Loading…
          </p>
        ) : saved ? (
          <address
            className="mt-4 not-italic text-sm leading-6"
            style={{ color: "hsl(170 18% 28%)" }}
            data-testid="saved-address-display"
          >
            <div>{saved.name}</div>
            <div>{saved.street1}</div>
            {saved.street2 ? <div>{saved.street2}</div> : null}
            <div>
              {saved.city}, {saved.state} {saved.zip}
            </div>
            <div>{saved.country}</div>
            {saved.phone ? <div>{saved.phone}</div> : null}
          </address>
        ) : (
          <p
            className="mt-4 text-sm"
            style={{ color: "hsl(170 18% 32%)" }}
            data-testid="saved-address-empty"
          >
            You don't have a saved address yet.
          </p>
        )
      ) : (
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={onSave}
          data-testid="saved-address-form"
        >
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="sa-name">Full name</Label>
            <Input
              id="sa-name"
              required
              autoComplete="name"
              value={draft.name}
              onChange={updateField("name")}
              data-testid="saved-address-name"
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="sa-street1">Address</Label>
            <Input
              id="sa-street1"
              required
              autoComplete="address-line1"
              value={draft.street1}
              onChange={updateField("street1")}
              data-testid="saved-address-street1"
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="sa-street2">Apt / Suite (optional)</Label>
            <Input
              id="sa-street2"
              autoComplete="address-line2"
              value={draft.street2 ?? ""}
              onChange={updateField("street2")}
              data-testid="saved-address-street2"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sa-city">City</Label>
            <Input
              id="sa-city"
              required
              autoComplete="address-level2"
              value={draft.city}
              onChange={updateField("city")}
              data-testid="saved-address-city"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sa-state">State</Label>
            <Input
              id="sa-state"
              required
              autoComplete="address-level1"
              value={draft.state}
              onChange={updateField("state")}
              data-testid="saved-address-state"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sa-zip">ZIP</Label>
            <Input
              id="sa-zip"
              required
              autoComplete="postal-code"
              value={draft.zip}
              onChange={updateField("zip")}
              data-testid="saved-address-zip"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sa-country">Country</Label>
            <Input
              id="sa-country"
              required
              autoComplete="country"
              value={draft.country}
              onChange={updateField("country")}
              data-testid="saved-address-country"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button
              type="submit"
              disabled={update.isPending}
              className="rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{
                background: "hsl(170 58% 14%)",
                color: "hsl(45 49% 90%)",
              }}
              data-testid="saved-address-save"
            >
              {update.isPending ? "Saving…" : "Save address"}
            </Button>
            <button
              type="button"
              onClick={cancel}
              disabled={update.isPending}
              className="text-[11px] font-semibold uppercase tracking-[0.22em] underline underline-offset-4"
              style={{ color: "hsl(170 18% 32%)" }}
              data-testid="saved-address-cancel"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export default function AccountPage() {
  const { data, isLoading, isError, error } = useListMyOrders({
    query: { retry: false } as never,
  });

  const unauthenticated =
    isError &&
    /401|403|unauth/i.test(error instanceof Error ? error.message : "");

  return (
    <SiteShell testId="page-account">
      <Seo title="Your account" noindex />
      <section
        style={{ background: "hsl(170 58% 14%)", color: "hsl(45 49% 90%)" }}
      >
        <div className="mx-auto max-w-4xl px-6 py-16 md:px-10 md:py-20">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "hsl(42 53% 64%)" }}
          >
            Account
          </p>
          <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">
            Your{" "}
            <span
              className="font-display-italic"
              style={{ color: "hsl(95 30% 78%)" }}
            >
              orders.
            </span>
          </h1>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12 md:px-10 md:py-16">
        {isLoading ? (
          <p className="opacity-70" data-testid="account-loading">
            Loading…
          </p>
        ) : unauthenticated ? (
          <div
            className="rounded-2xl border p-8 text-center"
            style={{
              borderColor: "hsl(40 18% 80%)",
              background: "hsl(45 50% 93%)",
            }}
            data-testid="account-signin"
          >
            <p className="font-display text-2xl">Sign in to see your orders.</p>
            <p
              className="mt-2 text-sm"
              style={{ color: "hsl(170 18% 32%)" }}
            >
              Order confirmations and tracking links also arrive in your email.
            </p>
            <Button
              asChild
              className="mt-5 rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{
                background: "hsl(170 58% 14%)",
                color: "hsl(45 49% 90%)",
              }}
            >
              <Link href="/contact">Need help?</Link>
            </Button>
          </div>
        ) : isError ? (
          <p
            role="alert"
            className="text-sm"
            style={{ color: "hsl(0 70% 35%)" }}
            data-testid="account-error"
          >
            {error instanceof Error ? error.message : "Couldn't load orders."}
          </p>
        ) : (
          <>
            <SavedAddressCard />
            {data && data.length > 0 ? (
              <ul className="space-y-4" data-testid="account-orders">
                {data.map((order) => (
                  <OrderRow key={order.id} order={order} />
                ))}
              </ul>
            ) : (
              <p
                className="text-center font-display text-2xl"
                data-testid="account-no-orders"
              >
                No orders yet.
              </p>
            )}
          </>
        )}

        <GuestOrderLookup />
      </section>
    </SiteShell>
  );
}
