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
  id: 5101,
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

const ORDER_TWO: Order = {
  id: 5102,
  status: "paid",
  email: "shopper@example.com",
  items: [
    {
      id: 2,
      productId: 402,
      productName: "Focus Elixir",
      productImage: null,
      quantity: 1,
      priceCents: 5200,
    },
  ],
  subtotalCents: 5200,
  shippingCents: 0,
  taxCents: 0,
  discountCents: 0,
  discountCode: null,
  totalCents: 5200,
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
  createdAt: "2026-05-03T12:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

async function mockUnauthenticated(page: Page): Promise<void> {
  await page.route("**/api/orders/me", async (route: Route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unauthenticated" }),
    });
  });
}

async function mockSignedIn(page: Page, orders: Order[]): Promise<void> {
  await page.route("**/api/orders/me", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(orders),
    });
  });

  // Match GET /api/orders/:id (digits only) — keep the legacy lookup endpoints
  // (/api/orders/lookup, /api/orders/by-token) on their own routes.
  await page.route(/\/api\/orders\/\d+(\?|$)/, async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const idStr = url.pathname.split("/").pop() ?? "";
    const id = Number(idStr);
    const order = orders.find((o) => o.id === id);
    if (!order) {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("/account and /account/orders/:id", () => {
  test("signed-out visitor sees the sign-in prompt on /account", async ({
    page,
  }) => {
    await mockUnauthenticated(page);

    await page.goto("/account");
    await dismissOverlays(page);
    await page.reload();

    await expect(page.getByTestId("page-account")).toBeVisible();
    await expect(page.getByTestId("account-signin")).toBeVisible();
    await expect(page.getByTestId("account-signin")).toContainText(
      "Sign in to see your orders.",
    );
    // The list of orders should NOT be rendered when unauthenticated.
    await expect(page.getByTestId("account-orders")).toHaveCount(0);
  });

  test("signed-in shopper sees their orders and can click into a detail page", async ({
    page,
  }) => {
    await mockSignedIn(page, [ORDER_TWO, ORDER_ONE]);

    await page.goto("/account");
    await dismissOverlays(page);
    await page.reload();

    const list = page.getByTestId("account-orders");
    await expect(list).toBeVisible();
    await expect(page.getByTestId(`order-${ORDER_ONE.id}`)).toContainText(
      "Calm Tincture",
    );
    await expect(page.getByTestId(`order-${ORDER_TWO.id}`)).toContainText(
      "Focus Elixir",
    );
    // Sign-in prompt must NOT be shown when authenticated.
    await expect(page.getByTestId("account-signin")).toHaveCount(0);

    await page.getByTestId(`link-order-${ORDER_ONE.id}`).click();
    await expect(page).toHaveURL(
      new RegExp(`/account/orders/${ORDER_ONE.id}$`),
    );

    await expect(page.getByTestId("page-account-order")).toBeVisible();
    await expect(page.getByTestId("order-summary")).toBeVisible();
    await expect(page.getByTestId("order-status-badge")).toContainText(
      "Preparing",
    );
    await expect(page.getByTestId("order-total")).toContainText("$95.99");
    await expect(page.getByTestId("order-shipping-address")).toContainText(
      "Casey Buyer",
    );
    await expect(page.getByTestId("order-shipping-address")).toContainText(
      "100 Test Lane",
    );
    // No tracking code on the fixture → placeholder is shown, not the value.
    await expect(page.getByTestId("order-tracking-pending")).toBeVisible();
    await expect(page.getByTestId("order-tracking")).toHaveCount(0);
  });

  test("signed-in shopper sees tracking number and label link when shipment is set", async ({
    page,
  }) => {
    const SHIPPED_ORDER: Order = {
      ...ORDER_ONE,
      id: 5103,
      status: "shipped",
      trackingCode: "1Z999AA10123456784",
      labelUrl: "https://labels.example.com/orders/5103/label.pdf",
    };

    await mockSignedIn(page, [SHIPPED_ORDER]);

    await page.goto(`/account/orders/${SHIPPED_ORDER.id}`);
    await dismissOverlays(page);
    await page.reload();

    await expect(page.getByTestId("page-account-order")).toBeVisible();
    await expect(page.getByTestId("order-summary")).toBeVisible();

    const tracking = page.getByTestId("order-tracking");
    await expect(tracking).toBeVisible();
    await expect(tracking).toContainText(SHIPPED_ORDER.trackingCode!);

    const labelLink = page.getByTestId("order-label-link");
    await expect(labelLink).toBeVisible();
    await expect(labelLink).toHaveAttribute("href", SHIPPED_ORDER.labelUrl!);

    await expect(page.getByTestId("order-tracking-pending")).toHaveCount(0);
  });

  test("past order shows an availability badge next to an unavailable line item", async ({
    page,
  }) => {
    const MIXED_ORDER: Order = {
      ...ORDER_ONE,
      id: 5201,
      items: [
        {
          id: 11,
          productId: 401,
          productName: "Calm Tincture",
          productImage: null,
          quantity: 2,
          priceCents: 4500,
          available: true,
          unavailableReason: null,
        },
        {
          id: 12,
          productId: 402,
          productName: "Focus Elixir",
          productImage: null,
          quantity: 1,
          priceCents: 5200,
          available: false,
          unavailableReason: "out_of_stock",
        },
      ],
      subtotalCents: 14200,
      totalCents: 14799,
    };

    await mockSignedIn(page, [MIXED_ORDER]);

    await page.goto(`/account/orders/${MIXED_ORDER.id}`);
    await dismissOverlays(page);
    await page.reload();

    await expect(page.getByTestId("page-account-order")).toBeVisible();
    await expect(page.getByTestId("order-summary")).toBeVisible();

    // The available item should NOT carry a badge.
    await expect(
      page.getByTestId("order-item-11-availability"),
    ).toHaveCount(0);

    // The out-of-stock item shows the inline badge with the right copy.
    const badge = page.getByTestId("order-item-12-availability");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("Out of stock");

    // Reorder is still enabled because at least one item is purchasable, and
    // the hint shows the default "adds the same items" copy.
    await expect(page.getByTestId("button-reorder")).toBeEnabled();
    await expect(page.getByTestId("reorder-hint")).toContainText(
      "Adds the same items to your current cart.",
    );
  });

  test("past order with no purchasable items disables Reorder and shows the hint", async ({
    page,
  }) => {
    const ALL_GONE_ORDER: Order = {
      ...ORDER_ONE,
      id: 5202,
      items: [
        {
          id: 21,
          productId: 401,
          productName: "Calm Tincture",
          productImage: null,
          quantity: 2,
          priceCents: 4500,
          available: false,
          unavailableReason: "unavailable",
        },
        {
          id: 22,
          productId: 402,
          productName: "Focus Elixir",
          productImage: null,
          quantity: 1,
          priceCents: 5200,
          available: false,
          unavailableReason: "out_of_stock",
        },
      ],
      subtotalCents: 14200,
      totalCents: 14799,
    };

    await mockSignedIn(page, [ALL_GONE_ORDER]);

    await page.goto(`/account/orders/${ALL_GONE_ORDER.id}`);
    await dismissOverlays(page);
    await page.reload();

    await expect(page.getByTestId("page-account-order")).toBeVisible();
    await expect(page.getByTestId("order-summary")).toBeVisible();

    // Both items show their respective badges.
    const unavailableBadge = page.getByTestId("order-item-21-availability");
    await expect(unavailableBadge).toBeVisible();
    await expect(unavailableBadge).toContainText("Unavailable");

    const outOfStockBadge = page.getByTestId("order-item-22-availability");
    await expect(outOfStockBadge).toBeVisible();
    await expect(outOfStockBadge).toContainText("Out of stock");

    // Reorder is disabled and the hint switches to the "nothing available" copy.
    await expect(page.getByTestId("button-reorder")).toBeDisabled();
    await expect(page.getByTestId("reorder-hint")).toContainText(
      "None of these items are available right now.",
    );
  });

  test("signed-in shopper requesting another user's order id sees a not-found state", async ({
    page,
  }) => {
    // Only ORDER_ONE belongs to the signed-in user; the API will 404 anything
    // else (mirroring the server's "don't leak existence" behaviour).
    await mockSignedIn(page, [ORDER_ONE]);

    await page.goto("/account/orders/99999");
    await dismissOverlays(page);
    await page.reload();

    await expect(page.getByTestId("page-account-order")).toBeVisible();
    await expect(page.getByTestId("account-order-not-found")).toBeVisible();
    await expect(page.getByTestId("account-order-not-found")).toContainText(
      "Order not found",
    );
    // The summary must not render for an order the shopper can't see.
    await expect(page.getByTestId("order-summary")).toHaveCount(0);
  });
});
