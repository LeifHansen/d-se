import { test, expect, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Friendly OrderStatusBadge — covers the three surfaces it renders on:
//   1. /account                  → orders list row (`order-{id}-status-badge`)
//   2. /account/orders/:id       → detail tracking section (`order-status-badge`)
//   3. /orders/:id (guest)       → hero (`order-status-badge-hero`) + tracking
//
// Task #165 introduced the shared component with friendlier copy
// ("Preparing", "On its way", "Delivered"). The account-order "Preparing"
// case is already covered by tests/account.spec.ts; this spec locks in the
// shipped/delivered states and the badge presence on the orders list and the
// guest order page so future copy/color tweaks don't silently regress.
// ---------------------------------------------------------------------------

type OrderItem = {
  id: number;
  productId: number;
  productName: string;
  productImage: string | null;
  quantity: number;
  priceCents: number;
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
  shippingAddress?: {
    name: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  trackingCode: string | null;
  labelUrl: string | null;
  createdAt: string;
};

const BASE_ITEM: OrderItem = {
  id: 1,
  productId: 401,
  productName: "Calm Tincture",
  productImage: null,
  quantity: 1,
  priceCents: 4500,
};

const BASE_ADDRESS = {
  name: "Casey Buyer",
  street1: "100 Test Lane",
  city: "Portland",
  state: "OR",
  zip: "97201",
  country: "US",
};

function makeOrder(id: number, status: string, overrides: Partial<Order> = {}): Order {
  return {
    id,
    status,
    email: "shopper@example.com",
    items: [{ ...BASE_ITEM, id: id + 1 }],
    subtotalCents: 4500,
    shippingCents: 599,
    taxCents: 0,
    discountCents: 0,
    discountCode: null,
    totalCents: 5099,
    currency: "usd",
    shippingAddress: BASE_ADDRESS,
    trackingCode: null,
    labelUrl: null,
    createdAt: "2026-05-01T12:00:00.000Z",
    ...overrides,
  };
}

async function dismissOverlays(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("dose-age-confirmed", "yes");
      window.localStorage.setItem("dose-cookies-decision", "accept");
    } catch {
      /* ignore */
    }
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

// ---------------------------------------------------------------------------
// 1. /account orders list
// ---------------------------------------------------------------------------

test.describe("OrderStatusBadge on /account orders list", () => {
  test("renders friendly copy for shipped and delivered rows", async ({
    page,
  }) => {
    const SHIPPED = makeOrder(6101, "shipped", {
      trackingCode: "1Z999AA10123456784",
    });
    const DELIVERED = makeOrder(6102, "delivered", {
      trackingCode: "1Z999AA10123456785",
    });

    await dismissOverlays(page);
    await mockSignedIn(page, [SHIPPED, DELIVERED]);

    await page.goto("/account");

    await expect(page.getByTestId("account-orders")).toBeVisible();

    const shippedBadge = page.getByTestId(`order-${SHIPPED.id}-status-badge`);
    await expect(shippedBadge).toBeVisible();
    await expect(shippedBadge).toHaveText("On its way");
    await expect(shippedBadge).toHaveAttribute("data-status", "shipped");

    const deliveredBadge = page.getByTestId(
      `order-${DELIVERED.id}-status-badge`,
    );
    await expect(deliveredBadge).toBeVisible();
    await expect(deliveredBadge).toHaveText("Delivered");
    await expect(deliveredBadge).toHaveAttribute("data-status", "delivered");
  });
});

// ---------------------------------------------------------------------------
// 2. /account/orders/:id detail page
// ---------------------------------------------------------------------------

test.describe("OrderStatusBadge on /account/orders/:id", () => {
  test("shows 'On its way' for a shipped order", async ({ page }) => {
    const SHIPPED = makeOrder(6201, "shipped", {
      trackingCode: "1Z999AA10123456784",
      labelUrl: "https://labels.example.com/orders/6201/label.pdf",
    });

    await dismissOverlays(page);
    await mockSignedIn(page, [SHIPPED]);

    await page.goto(`/account/orders/${SHIPPED.id}`);

    await expect(page.getByTestId("page-account-order")).toBeVisible();
    const badge = page.getByTestId("order-status-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("On its way");
    await expect(badge).toHaveAttribute("data-status", "shipped");
  });

  test("shows 'Delivered' for a delivered order", async ({ page }) => {
    const DELIVERED = makeOrder(6202, "delivered", {
      trackingCode: "1Z999AA10123456785",
    });

    await dismissOverlays(page);
    await mockSignedIn(page, [DELIVERED]);

    await page.goto(`/account/orders/${DELIVERED.id}`);

    await expect(page.getByTestId("page-account-order")).toBeVisible();
    const badge = page.getByTestId("order-status-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("Delivered");
    await expect(badge).toHaveAttribute("data-status", "delivered");
  });
});

// ---------------------------------------------------------------------------
// 3. /orders/:id guest order detail page
// ---------------------------------------------------------------------------

async function mockGuestLookup(page: Page, order: Order): Promise<void> {
  await page.route("**/api/orders/lookup", async (route: Route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = JSON.parse(route.request().postData() ?? "{}") as {
      orderId?: number;
      email?: string;
    };
    if (body.orderId !== order.id) {
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

test.describe("OrderStatusBadge on /orders/:id (guest)", () => {
  test("renders friendly copy in the hero and tracking sections for a shipped order", async ({
    page,
  }) => {
    const SHIPPED = makeOrder(6301, "shipped", {
      trackingCode: "1Z999AA10123456784",
      labelUrl: "https://labels.example.com/orders/6301/label.pdf",
    });

    await dismissOverlays(page);
    // Auto-lookup with the email used at checkout (no token in URL).
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem(
          "dose-last-order-email",
          "shopper@example.com",
        );
      } catch {
        /* ignore */
      }
    });
    await mockGuestLookup(page, SHIPPED);

    await page.goto(`/orders/${SHIPPED.id}`);

    await expect(page.getByTestId("page-order-detail")).toBeVisible();
    await expect(page.getByTestId("order-summary")).toBeVisible();

    const hero = page.getByTestId("order-status-badge-hero");
    await expect(hero).toBeVisible();
    await expect(hero).toHaveText("On its way");
    await expect(hero).toHaveAttribute("data-status", "shipped");

    const tracking = page.getByTestId("order-status-badge");
    await expect(tracking).toBeVisible();
    await expect(tracking).toHaveText("On its way");
    await expect(tracking).toHaveAttribute("data-status", "shipped");
  });

  test("renders 'Delivered' in the hero and tracking sections for a delivered order", async ({
    page,
  }) => {
    const DELIVERED = makeOrder(6302, "delivered", {
      trackingCode: "1Z999AA10123456785",
    });

    await dismissOverlays(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem(
          "dose-last-order-email",
          "shopper@example.com",
        );
      } catch {
        /* ignore */
      }
    });
    await mockGuestLookup(page, DELIVERED);

    await page.goto(`/orders/${DELIVERED.id}`);

    await expect(page.getByTestId("page-order-detail")).toBeVisible();
    await expect(page.getByTestId("order-summary")).toBeVisible();

    const hero = page.getByTestId("order-status-badge-hero");
    await expect(hero).toBeVisible();
    await expect(hero).toHaveText("Delivered");
    await expect(hero).toHaveAttribute("data-status", "delivered");

    const tracking = page.getByTestId("order-status-badge");
    await expect(tracking).toBeVisible();
    await expect(tracking).toHaveText("Delivered");
    await expect(tracking).toHaveAttribute("data-status", "delivered");
  });
});
