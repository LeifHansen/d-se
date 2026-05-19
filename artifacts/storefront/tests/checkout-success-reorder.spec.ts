import { test, expect, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type OrderItem = {
  id: number;
  productId: number;
  productName: string;
  productImage: string | null;
  quantity: number;
  priceCents: number;
  available?: boolean;
  unavailableReason?: "unavailable" | "out_of_stock" | null;
};

type OrderAddress = {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

type Order = {
  id: number;
  status: string;
  email: string | null;
  items: OrderItem[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  discountCode: string | null;
  totalCents: number;
  currency: string;
  shippingAddress?: OrderAddress;
  trackingCode: string | null;
  labelUrl: string | null;
  createdAt: string;
};

const ORDER_ONE: Order = {
  id: 7301,
  status: "paid",
  email: "shopper@example.com",
  items: [
    {
      id: 1,
      productId: 401,
      productName: "Calm Tincture",
      productImage: null,
      quantity: 2,
      priceCents: 4500,
    },
  ],
  subtotalCents: 9000,
  shippingCents: 599,
  taxCents: 0,
  discountCents: 0,
  discountCode: null,
  totalCents: 9599,
  currency: "usd",
  shippingAddress: {
    name: "Casey Buyer",
    street1: "100 Test Lane",
    city: "Portland",
    state: "OR",
    zip: "97201",
    country: "US",
  },
  trackingCode: null,
  labelUrl: null,
  createdAt: "2026-05-01T12:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function dismissOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      window.localStorage.setItem("dose-age-confirmed", "yes");
      window.localStorage.setItem("dose-cookies-decision", "accept");
    } catch {
      /* ignore */
    }
  });
}

async function mockOrderFetch(page: Page, order: Order): Promise<void> {
  await page.route(/\/api\/orders\/\d+(\?|$)/, async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const idStr = url.pathname.split("/").pop() ?? "";
    const id = Number(idStr);
    if (id !== order.id) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Order not found" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(order),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("/checkout/success Reorder", () => {
  test("Reorder button on the confirmation page adds items, opens the cart drawer, and shows the success toast", async ({
    page,
  }) => {
    await mockOrderFetch(page, ORDER_ONE);

    const reorderCalls: Array<{ id: number; body: unknown }> = [];

    let cartItems: Array<{
      id: number;
      quantity: number;
      product: {
        id: number;
        name: string;
        slug: string;
        priceCents: number;
        currency: string;
        images: string[];
        inventory: number;
        lowStockThreshold: number;
      };
    }> = [];

    const cartFor = () => ({
      id: "cart-success-001",
      currency: "usd",
      items: cartItems,
      subtotalCents: cartItems.reduce(
        (sum, it) => sum + it.quantity * it.product.priceCents,
        0,
      ),
      discountCents: 0,
      discountCode: null,
      totalCents: cartItems.reduce(
        (sum, it) => sum + it.quantity * it.product.priceCents,
        0,
      ),
    });

    await page.route("**/api/cart*", async (route: Route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(cartFor()),
      });
    });

    await page.route(/\/api\/orders\/\d+\/reorder$/, async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      const url = new URL(route.request().url());
      const idStr = url.pathname.split("/").slice(-2, -1)[0] ?? "";
      const id = Number(idStr);
      const body = JSON.parse(route.request().postData() ?? "{}");
      reorderCalls.push({ id, body });
      cartItems = ORDER_ONE.items.map((it) => ({
        id: 9000 + it.id,
        quantity: it.quantity,
        product: {
          id: it.productId,
          name: it.productName,
          slug: `product-${it.productId}`,
          priceCents: it.priceCents,
          currency: "usd",
          images: [],
          inventory: 50,
          lowStockThreshold: 0,
        },
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ cart: cartFor(), skipped: [] }),
      });
    });

    await page.goto(`/checkout/success?orderId=${ORDER_ONE.id}`);
    await dismissOverlays(page);
    await page.reload();

    await expect(page.getByTestId("checkout-success-page")).toBeVisible();
    await expect(page.getByTestId("success-order-summary")).toBeVisible();

    const reorderButton = page.getByTestId("button-reorder");
    await expect(reorderButton).toBeVisible();
    await reorderButton.click();

    const drawer = page.getByTestId("cart-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("cart-drawer-items")).toBeVisible();
    await expect(drawer).toContainText("Calm Tincture");
    await expect(
      drawer.getByTestId(`cart-drawer-qty-${cartItems[0].id}`),
    ).toHaveText("2");

    await expect(page.getByText("Added to cart").first()).toBeVisible();
    await expect(
      page.getByText("Your past order is back in your cart.").first(),
    ).toBeVisible();

    expect(reorderCalls).toHaveLength(1);
    expect(reorderCalls[0].id).toBe(ORDER_ONE.id);
  });

  test("Reorder button on the confirmation page shows the partial-skipped toast when an item is out of stock", async ({
    page,
  }) => {
    const PARTIAL_ORDER: Order = {
      ...ORDER_ONE,
      id: 7304,
      items: [
        {
          id: 11,
          productId: 501,
          productName: "Calm Tincture",
          productImage: null,
          quantity: 1,
          priceCents: 4500,
        },
        {
          id: 12,
          productId: 502,
          productName: "Sleep Drops",
          productImage: null,
          quantity: 1,
          priceCents: 3800,
        },
      ],
    };

    await mockOrderFetch(page, PARTIAL_ORDER);

    let cartItems: Array<{
      id: number;
      quantity: number;
      product: {
        id: number;
        name: string;
        slug: string;
        priceCents: number;
        currency: string;
        images: string[];
        inventory: number;
        lowStockThreshold: number;
      };
    }> = [];

    const cartFor = () => ({
      id: "cart-success-002",
      currency: "usd",
      items: cartItems,
      subtotalCents: cartItems.reduce(
        (s, it) => s + it.quantity * it.product.priceCents,
        0,
      ),
      discountCents: 0,
      discountCode: null,
      totalCents: cartItems.reduce(
        (s, it) => s + it.quantity * it.product.priceCents,
        0,
      ),
    });

    await page.route("**/api/cart*", async (route: Route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(cartFor()),
      });
    });

    await page.route(/\/api\/orders\/\d+\/reorder$/, async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      cartItems = [
        {
          id: 9101,
          quantity: 1,
          product: {
            id: 501,
            name: "Calm Tincture",
            slug: "calm-tincture",
            priceCents: 4500,
            currency: "usd",
            images: [],
            inventory: 25,
            lowStockThreshold: 0,
          },
        },
      ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          cart: cartFor(),
          skipped: [
            {
              productId: 502,
              productName: "Sleep Drops",
              quantity: 1,
              reason: "out_of_stock",
            },
          ],
        }),
      });
    });

    await page.goto(`/checkout/success?orderId=${PARTIAL_ORDER.id}`);
    await dismissOverlays(page);
    await page.reload();

    await page.getByTestId("button-reorder").click();

    const drawer = page.getByTestId("cart-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Calm Tincture");
    await expect(drawer).not.toContainText("Sleep Drops");

    await expect(
      page.getByText("Some items were skipped").first(),
    ).toBeVisible();
    await expect(
      page.getByText(/Sleep Drops \(out of stock\)/).first(),
    ).toBeVisible();
  });
});
