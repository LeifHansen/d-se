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
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  trackingCode: string | null;
  labelUrl: string | null;
  createdAt: string;
};

const ORDER: Order = {
  id: 8421,
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
    {
      id: 2,
      productId: 402,
      productName: "Sleep Drops",
      productImage: null,
      quantity: 1,
      priceCents: 3800,
    },
  ],
  subtotalCents: 12800,
  shippingCents: 599,
  taxCents: 0,
  discountCents: 0,
  discountCode: null,
  totalCents: 13399,
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
  createdAt: "2026-05-15T18:00:00.000Z",
};

const TOTAL_ITEM_COUNT = ORDER.items.reduce((n, it) => n + it.quantity, 0);

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

// Compute the expected short date using the same toLocaleDateString call the
// page code uses, evaluated inside the browser so the result honors the same
// runtime locale/timezone as the page under test.
async function shortDateInBrowser(page: Page, iso: string): Promise<string> {
  return await page.evaluate(
    (s) =>
      new Date(s).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    iso,
  );
}

async function mockOrderById(page: Page, order: Order): Promise<void> {
  await page.route(/\/api\/orders\/\d+(\?|$)/, async (route: Route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const url = new URL(route.request().url());
    const idStr = url.pathname.split("/").pop() ?? "";
    if (Number(idStr) !== order.id) {
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

async function mockOrderLookup(page: Page, order: Order): Promise<void> {
  await page.route("**/api/orders/lookup", async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    if (Number(body.orderId) !== order.id) {
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

async function assertTitleHas(
  page: Page,
  parts: string[],
): Promise<void> {
  await expect
    .poll(async () => await page.title(), { timeout: 10_000 })
    .toMatch(
      new RegExp(
        parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*"),
      ),
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("order tab titles include id, date, and item count", () => {
  test("/checkout/success sets the tab title from the loaded order", async ({
    page,
  }) => {
    await mockOrderById(page, ORDER);

    await page.goto(`/checkout/success?orderId=${ORDER.id}`);
    await dismissOverlays(page);
    await page.reload();

    await expect(page.getByTestId("success-order-summary")).toBeVisible();

    const shortDate = await shortDateInBrowser(page, ORDER.createdAt);
    await assertTitleHas(page, [
      `Order #${ORDER.id}`,
      shortDate,
      `${TOTAL_ITEM_COUNT} items confirmed`,
    ]);
  });

  test("/account/orders/:id sets the tab title from the loaded order", async ({
    page,
  }) => {
    await mockOrderById(page, ORDER);

    await page.goto(`/account/orders/${ORDER.id}`);
    await dismissOverlays(page);
    await page.reload();

    await expect(page.getByTestId("order-summary")).toBeVisible();

    const shortDate = await shortDateInBrowser(page, ORDER.createdAt);
    await assertTitleHas(page, [
      `Order #${ORDER.id}`,
      shortDate,
      `${TOTAL_ITEM_COUNT} items`,
    ]);
  });

  test("/orders/:id sets the tab title from the looked-up order", async ({
    page,
  }) => {
    await mockOrderLookup(page, ORDER);

    await page.goto(
      `/orders/${ORDER.id}?email=${encodeURIComponent(ORDER.email ?? "")}`,
    );
    await dismissOverlays(page);
    await page.reload();

    await expect(page.getByTestId("order-summary")).toBeVisible();

    const shortDate = await shortDateInBrowser(page, ORDER.createdAt);
    await assertTitleHas(page, [
      `Order #${ORDER.id}`,
      shortDate,
      `${TOTAL_ITEM_COUNT} items confirmed`,
    ]);
  });
});
