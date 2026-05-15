import { test, expect, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Coverage for the remaining admin pages that the existing admin specs
// (admin.spec.ts / admin-sections.spec.ts / bulk-labels.spec.ts /
// admin-product-images.spec.ts / blog-draft-preview.spec.ts) didn't already
// touch:
//   - the per-customer "Orders by email" page
//   - the "Blog formatting" configuration / reference page
//   - the SINGLE-order shipping label workflow on the order detail drawer
//     (bulk-labels.spec.ts only exercises the bulk button)
// ---------------------------------------------------------------------------

type ShippingAddress = {
  name: string;
  street1: string;
  street2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string | null;
};

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
  shippingAddress: ShippingAddress | null;
  trackingCode: string | null;
  labelUrl: string | null;
  createdAt: string;
};

const ADDRESS: ShippingAddress = {
  name: "Casey Buyer",
  street1: "100 Test Lane",
  street2: null,
  city: "Portland",
  state: "OR",
  zip: "97201",
  country: "US",
  phone: null,
};

function makeOrder(overrides: Partial<Order> & { id: number }): Order {
  return {
    status: "paid",
    email: `buyer${overrides.id}@example.com`,
    items: [
      {
        id: overrides.id * 10,
        productId: 101,
        productName: "Calm Tincture",
        productImage: null,
        quantity: 1,
        priceCents: 2500,
      },
    ],
    subtotalCents: 2500,
    shippingCents: 0,
    taxCents: 0,
    discountCents: 0,
    discountCode: null,
    totalCents: 2500,
    currency: "usd",
    shippingAddress: ADDRESS,
    trackingCode: null,
    labelUrl: null,
    createdAt: "2026-05-13T10:00:00.000Z",
    ...overrides,
  };
}

const RATES = [
  {
    id: "flat-express",
    carrier: "Express",
    service: "Express (2-3 days)",
    amountCents: 1595,
    currency: "usd",
    deliveryDays: 3,
  },
  {
    id: "flat-standard",
    carrier: "Standard",
    service: "Ground (5-7 days)",
    amountCents: 695,
    currency: "usd",
    deliveryDays: 6,
  },
];

// ---------------------------------------------------------------------------
// Single-label workflow on the order detail drawer
// ---------------------------------------------------------------------------

async function installAdminBaseMocks(page: Page): Promise<void> {
  await page.route("**/api/admin/stats**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        totalOrders: 0,
        ordersToday: 0,
        revenueCentsToday: 0,
        ordersThisMonth: 0,
        revenueCentsThisMonth: 0,
        pendingFulfillment: 0,
        lowStock: 0,
        totalProducts: 0,
        webhookHealthy: true,
        webhookLastReceivedAt: null,
        recentOrders: [],
        marketing: {
          newsletterSubscribers: 0,
          rangeDays: 7,
          ordersInRange: 0,
          revenueCentsInRange: 0,
          ga4Url: null,
          subscribersDaily: [],
          ordersDaily: [],
          revenueCentsDaily: [],
        },
      }),
    });
  });
}

test.describe("admin orders — single-order shipping label drawer", () => {
  test("get rates → pick a rate → buy label flips order to shipped with tracking", async ({
    page,
  }) => {
    const order = makeOrder({ id: 7001 });
    let ratesCalls = 0;
    let fulfillBody: Record<string, unknown> | null = null;

    await installAdminBaseMocks(page);

    await page.route("**/api/admin/orders*", async (route: Route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith("/api/admin/orders")) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([order]),
      });
    });

    await page.route(
      "**/api/admin/orders/*/shipping-rates",
      async (route: Route) => {
        ratesCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ shipmentId: "shp_7001", rates: RATES }),
        });
      },
    );

    await page.route(
      "**/api/admin/orders/*/fulfill",
      async (route: Route) => {
        fulfillBody = JSON.parse(route.request().postData() ?? "{}") as Record<
          string,
          unknown
        >;
        order.status = "shipped";
        order.trackingCode = "TRK-7001";
        order.labelUrl = "https://labels.test/order-7001.pdf";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(order),
        });
      },
    );

    await page.goto("/admin/orders");

    await page.getByTestId("row-order-7001").getByText("#7001").click();
    await expect(page.getByTestId("order-detail-drawer")).toBeVisible();

    // Initial state: no rates yet, just a "Get rates" button.
    await expect(page.getByTestId("button-get-rates")).toBeVisible();
    await expect(page.getByTestId("list-shipping-rates")).toHaveCount(0);

    await page.getByTestId("button-get-rates").click();

    // Rates list appears; cheapest is auto-selected (flat-standard at $6.95).
    await expect(page.getByTestId("list-shipping-rates")).toBeVisible();
    await expect(
      page
        .getByTestId("rate-option-flat-standard")
        .locator('input[type="radio"]'),
    ).toBeChecked();
    await expect(
      page
        .getByTestId("rate-option-flat-express")
        .locator('input[type="radio"]'),
    ).not.toBeChecked();

    // Switch to express, then buy label.
    await page.getByTestId("rate-option-flat-express").click();
    await expect(
      page
        .getByTestId("rate-option-flat-express")
        .locator('input[type="radio"]'),
    ).toBeChecked();

    await page.getByTestId("button-buy-label").click();

    // Drawer flips to the shipped state: status text, tracking code, label link.
    await expect(page.getByTestId("text-order-status")).toContainText("shipped");
    await expect(page.getByTestId("text-tracking-code")).toContainText(
      "TRK-7001",
    );
    await expect(page.getByTestId("link-label-url")).toHaveAttribute(
      "href",
      "https://labels.test/order-7001.pdf",
    );

    // The shipping-label section disappears once the order is shipped.
    await expect(page.getByTestId("button-get-rates")).toHaveCount(0);
    await expect(page.getByTestId("button-buy-label")).toHaveCount(0);

    // The fulfill request used the rate we picked + the shipmentId from rates.
    expect(ratesCalls).toBe(1);
    expect(fulfillBody).toMatchObject({
      shippingRateId: "flat-express",
      shipmentId: "shp_7001",
    });

    // The list row also reflects the new shipped status after invalidation.
    await expect(page.getByTestId("row-order-7001")).toContainText("shipped");
  });

  test("rates fetch failure surfaces an inline error and leaves the order unshipped", async ({
    page,
  }) => {
    const order = makeOrder({ id: 7101 });
    await installAdminBaseMocks(page);

    await page.route("**/api/admin/orders*", async (route: Route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith("/api/admin/orders")) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([order]),
      });
    });

    await page.route(
      "**/api/admin/orders/*/shipping-rates",
      async (route: Route) => {
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ error: "EasyPost is down for maintenance" }),
        });
      },
    );

    await page.goto("/admin/orders");
    await page.getByTestId("row-order-7101").getByText("#7101").click();
    await page.getByTestId("button-get-rates").click();

    await expect(page.getByTestId("text-fulfill-error")).toBeVisible();
    // We never advance to a rates list and never offer a Buy button.
    await expect(page.getByTestId("list-shipping-rates")).toHaveCount(0);
    await expect(page.getByTestId("button-buy-label")).toHaveCount(0);
    // The Get-rates button stays so the admin can retry.
    await expect(page.getByTestId("button-get-rates")).toBeVisible();
  });

  test("orders without a shipping address don't expose a shipping-label section at all", async ({
    page,
  }) => {
    const order = makeOrder({ id: 7201, shippingAddress: null });
    await installAdminBaseMocks(page);

    await page.route("**/api/admin/orders*", async (route: Route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith("/api/admin/orders")) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([order]),
      });
    });

    await page.goto("/admin/orders");
    await page.getByTestId("row-order-7201").getByText("#7201").click();

    await expect(page.getByTestId("order-detail-drawer")).toContainText(
      "No shipping address on this order",
    );
    await expect(page.getByTestId("button-get-rates")).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Per-customer "Orders by email" page
// ---------------------------------------------------------------------------

test.describe("admin orders by email", () => {
  test("renders every order placed under the email and links back to the list", async ({
    page,
  }) => {
    const email = "repeat@buyer.example";
    await installAdminBaseMocks(page);

    await page.route(
      "**/api/admin/orders/by-email/**",
      async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            email,
            orders: [
              makeOrder({ id: 8001, email, status: "paid" }),
              makeOrder({ id: 8002, email, status: "shipped" }),
            ],
          }),
        });
      },
    );

    await page.goto(`/admin/orders/by-email/${encodeURIComponent(email)}`);

    await expect(page.getByTestId("text-customer-email")).toContainText(email);
    await expect(page.getByTestId("row-order-8001")).toBeVisible();
    await expect(page.getByTestId("row-order-8002")).toContainText("shipped");
    await expect(page.getByTestId("link-back-to-orders")).toHaveAttribute(
      "href",
      "/admin/orders",
    );
  });

  test("shows the empty state when the customer has no other orders", async ({
    page,
  }) => {
    const email = "lonely@buyer.example";
    await installAdminBaseMocks(page);

    await page.route(
      "**/api/admin/orders/by-email/**",
      async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ email, orders: [] }),
        });
      },
    );

    await page.goto(`/admin/orders/by-email/${encodeURIComponent(email)}`);
    await expect(page.getByTestId("text-orders-empty")).toContainText(email);
  });
});

// ---------------------------------------------------------------------------
// Blog formatting reference / configuration page
// ---------------------------------------------------------------------------

test.describe("admin blog formatting reference", () => {
  test("renders all formatting examples with their copy-paste snippets", async ({
    page,
  }) => {
    await installAdminBaseMocks(page);

    await page.goto("/admin/blog-formatting");

    const root = page.getByTestId("admin-blog-formatting");
    await expect(root).toBeVisible();

    // Each documented snippet shows up as its own card.
    await expect(
      page.getByTestId("blog-formatting-example-headings-table-of-contents"),
    ).toBeVisible();
    await expect(
      page.getByTestId("blog-formatting-example-images-with-captions"),
    ).toBeVisible();
    await expect(
      page.getByTestId("blog-formatting-example-blockquotes"),
    ).toContainText("Slow brewing is the difference");
    await expect(
      page.getByTestId("blog-formatting-example-tables"),
    ).toContainText("Sencha");
    await expect(
      page.getByTestId("blog-formatting-example-task-lists"),
    ).toContainText("Warm the kyusu");
    await expect(
      page.getByTestId("blog-formatting-example-product-callout-shortcode"),
    ).toContainText("<product-callout");
  });
});
