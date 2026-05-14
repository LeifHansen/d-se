import { test, expect, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Product = {
  id: number;
  slug: string;
  name: string;
  description: string;
  shortDescription: string | null;
  priceCents: number;
  compareAtCents: number | null;
  currency: string;
  images: string[];
  inventory: number;
  lowStockThreshold: number;
  weightOz: number | null;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  featured: boolean;
  published: boolean;
  averageRating: number | null;
  reviewCount: number;
  createdAt: string;
};

type Order = {
  id: number;
  status: string;
  email: string | null;
  items: Array<{
    productId: number;
    name: string;
    quantity: number;
    unitPriceCents: number;
  }>;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  createdAt: string;
};

const BASE_PRODUCT: Omit<Product, "id" | "slug" | "name"> = {
  description: "Sample description",
  shortDescription: null,
  priceCents: 2500,
  compareAtCents: null,
  currency: "usd",
  images: [],
  inventory: 12,
  lowStockThreshold: 4,
  weightOz: null,
  tags: [],
  seoTitle: null,
  seoDescription: null,
  featured: false,
  published: true,
  averageRating: null,
  reviewCount: 0,
  createdAt: "2026-05-01T12:00:00.000Z",
};

function makeProducts(): Product[] {
  return [
    {
      ...BASE_PRODUCT,
      id: 101,
      slug: "calm-tincture",
      name: "Calm Tincture",
      inventory: 25,
      lowStockThreshold: 5,
    },
    {
      ...BASE_PRODUCT,
      id: 102,
      slug: "focus-gummies",
      name: "Focus Gummies",
      priceCents: 3200,
      inventory: 2,
      lowStockThreshold: 5,
    },
  ];
}

function makeOrders(): Order[] {
  return [
    {
      id: 9001,
      status: "paid",
      email: "jane@example.com",
      items: [
        {
          productId: 101,
          name: "Calm Tincture",
          quantity: 2,
          unitPriceCents: 2500,
        },
      ],
      subtotalCents: 5000,
      shippingCents: 500,
      taxCents: 0,
      totalCents: 5500,
      currency: "usd",
      createdAt: "2026-05-13T10:00:00.000Z",
    },
    {
      id: 9002,
      status: "pending",
      email: "ops@example.com",
      items: [
        {
          productId: 102,
          name: "Focus Gummies",
          quantity: 1,
          unitPriceCents: 3200,
        },
      ],
      subtotalCents: 3200,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 3200,
      currency: "usd",
      createdAt: "2026-05-12T08:00:00.000Z",
    },
    {
      id: 9003,
      status: "shipped",
      email: "ship@example.com",
      items: [
        {
          productId: 101,
          name: "Calm Tincture",
          quantity: 1,
          unitPriceCents: 2500,
        },
      ],
      subtotalCents: 2500,
      shippingCents: 500,
      taxCents: 0,
      totalCents: 3000,
      currency: "usd",
      createdAt: "2026-05-10T08:00:00.000Z",
    },
  ];
}

// ---------------------------------------------------------------------------
// Mock state shared across a single test
// ---------------------------------------------------------------------------

class AdminApi {
  products = makeProducts();
  orders = makeOrders();
  bulkCalls: Array<{
    updates: Array<{ id: number; inventory: number; lowStockThreshold?: number }>;
  }> = [];
  productUpdates: Array<{ id: number; data: Partial<Product> }> = [];
  ordersRequests: string[] = [];
  csvDownloads = 0;
  webhookHealthy = true;
  webhookLastReceivedAt: string | null = "2026-05-14T09:00:00.000Z";

  filterOrders(url: URL): Order[] {
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    return this.orders.filter((o) => {
      if (status && o.status !== status) return false;
      if (search) {
        const needle = search.toLowerCase();
        const matchesEmail = (o.email ?? "").toLowerCase().includes(needle);
        const matchesId = String(o.id).includes(needle);
        if (!matchesEmail && !matchesId) return false;
      }
      if (from && new Date(o.createdAt) < new Date(from)) return false;
      if (to && new Date(o.createdAt) > new Date(`${to}T23:59:59.999Z`)) {
        return false;
      }
      return true;
    });
  }
}

async function installAdminMocks(page: Page, api: AdminApi): Promise<void> {
  await page.route("**/api/admin/stats**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        totalOrders: 142,
        ordersToday: 3,
        revenueCentsToday: 9900,
        ordersThisMonth: 27,
        revenueCentsThisMonth: 142500,
        pendingFulfillment: 2,
        lowStock: 1,
        totalProducts: api.products.length,
        webhookHealthy: api.webhookHealthy,
        webhookLastReceivedAt: api.webhookLastReceivedAt,
        recentOrders: api.orders.slice(0, 2),
        marketing: {
          newsletterSubscribers: 1280,
          rangeDays: 7,
          ordersInRange: 12,
          revenueCentsInRange: 64500,
          ga4Url: "https://analytics.google.com/example",
          subscribersDaily: [],
          ordersDaily: [],
          revenueCentsDaily: [],
        },
      }),
    });
  });

  await page.route("**/api/admin/orders*", async (route: Route) => {
    const url = new URL(route.request().url());
    api.ordersRequests.push(url.search);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(api.filterOrders(url)),
    });
  });

  await page.route(
    "**/api/admin/products/inventory/bulk",
    async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      const payload = JSON.parse(route.request().postData() ?? "{}");
      api.bulkCalls.push(payload);
      for (const u of payload.updates ?? []) {
        const p = api.products.find((x) => x.id === u.id);
        if (!p) continue;
        if (typeof u.inventory === "number") p.inventory = u.inventory;
        if (typeof u.lowStockThreshold === "number")
          p.lowStockThreshold = u.lowStockThreshold;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ updated: payload.updates?.length ?? 0 }),
      });
    },
  );

  await page.route(
    "**/api/admin/products/export.csv",
    async (route: Route) => {
      api.csvDownloads += 1;
      const header = "id,slug,name,priceCents,inventory";
      const rows = api.products
        .map(
          (p) => `${p.id},${p.slug},${p.name},${p.priceCents},${p.inventory}`,
        )
        .join("\n");
      await route.fulfill({
        status: 200,
        contentType: "text/csv; charset=utf-8",
        body: `${header}\n${rows}\n`,
      });
    },
  );

  await page.route("**/api/admin/products/*", async (route: Route) => {
    const url = new URL(route.request().url());
    const idMatch = /\/api\/admin\/products\/(\d+)$/.exec(url.pathname);
    if (!idMatch) {
      await route.fallback();
      return;
    }
    const id = Number(idMatch[1]);
    const method = route.request().method();
    if (method === "PUT" || method === "PATCH") {
      const body = JSON.parse(route.request().postData() ?? "{}");
      api.productUpdates.push({ id, data: body });
      const p = api.products.find((x) => x.id === id);
      if (p) Object.assign(p, body);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(p ?? { id, ...body }),
      });
      return;
    }
    await route.fallback();
  });

  await page.route("**/api/admin/products", async (route: Route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(api.products),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("admin dashboard", () => {
  test("renders today banner, stale-webhook warning, and recent orders", async ({
    page,
  }) => {
    const api = new AdminApi();
    api.webhookHealthy = false;
    api.webhookLastReceivedAt = "2026-05-10T09:00:00.000Z";
    await installAdminMocks(page, api);

    await page.goto("/admin");
    // Wait for the admin shell to render so we know the page itself is up,
    // then give the stats query (which gates banner-today behind isLoading)
    // a generous timeout. On cold vite compile the first /admin render can
    // take noticeably longer than the default 5s expect timeout.
    await expect(page.getByTestId("admin-shell")).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByTestId("banner-today")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("banner-today")).toContainText("3");
    await expect(page.getByTestId("banner-today")).toContainText("$99.00");

    await expect(page.getByTestId("banner-stale-webhook")).toBeVisible();
    await expect(page.getByTestId("banner-stale-webhook")).toContainText(
      /webhook looks stale/i,
    );

    await expect(page.getByTestId("stat-month")).toContainText("27");
    await expect(page.getByTestId("stat-pending")).toContainText("2");
    await expect(page.getByTestId("stat-low-stock")).toContainText("1");
    await expect(page.getByTestId("stat-total-orders")).toContainText("142");

    await expect(page.getByTestId("marketing-subscribers")).toHaveText("1,280");
    await expect(page.getByTestId("marketing-orders-range")).toHaveText("12");

    await expect(page.getByTestId("row-recent-order-9001")).toBeVisible();
    await expect(page.getByTestId("row-recent-order-9001")).toContainText(
      "jane@example.com",
    );
    await expect(page.getByTestId("row-recent-order-9002")).toBeVisible();
  });

  test("hides stale-webhook warning when webhook is healthy", async ({
    page,
  }) => {
    const api = new AdminApi();
    await installAdminMocks(page, api);

    await page.goto("/admin");

    await expect(page.getByTestId("banner-today")).toBeVisible();
    await expect(page.getByTestId("banner-stale-webhook")).toHaveCount(0);
  });
});

test.describe("admin orders", () => {
  test("applies status, search, from, and to filters", async ({ page }) => {
    const api = new AdminApi();
    await installAdminMocks(page, api);

    await page.goto("/admin/orders");

    // All three orders visible initially
    await expect(page.getByTestId("row-order-9001")).toBeVisible();
    await expect(page.getByTestId("row-order-9002")).toBeVisible();
    await expect(page.getByTestId("row-order-9003")).toBeVisible();

    // Status filter -> paid
    await page.getByTestId("select-status").selectOption("paid");
    await page.getByTestId("button-apply-filters").click();
    await expect(page.getByTestId("row-order-9001")).toBeVisible();
    await expect(page.getByTestId("row-order-9002")).toHaveCount(0);
    await expect(page.getByTestId("row-order-9003")).toHaveCount(0);

    // Reset and try search by email
    await page.getByTestId("button-reset-filters").click();
    await page.getByTestId("input-search").fill("ops@example.com");
    await page.getByTestId("button-apply-filters").click();
    await expect(page.getByTestId("row-order-9002")).toBeVisible();
    await expect(page.getByTestId("row-order-9001")).toHaveCount(0);

    // Reset and use from/to date range
    await page.getByTestId("button-reset-filters").click();
    await page.getByTestId("input-from").fill("2026-05-13");
    await page.getByTestId("input-to").fill("2026-05-13");
    await page.getByTestId("button-apply-filters").click();
    await expect(page.getByTestId("row-order-9001")).toBeVisible();
    await expect(page.getByTestId("row-order-9002")).toHaveCount(0);
    await expect(page.getByTestId("row-order-9003")).toHaveCount(0);

    // Empty result state
    await page.getByTestId("button-reset-filters").click();
    await page.getByTestId("input-search").fill("nobody@nowhere.test");
    await page.getByTestId("button-apply-filters").click();
    await expect(page.getByTestId("text-orders-empty")).toBeVisible();

    // Confirm the API actually received filter params at some point
    expect(
      api.ordersRequests.some(
        (q) => q.includes("status=paid") || q.includes("search="),
      ),
    ).toBe(true);
  });
});

test.describe("admin products", () => {
  test("edits inventory inline and saves a single row", async ({ page }) => {
    const api = new AdminApi();
    await installAdminMocks(page, api);

    await page.goto("/admin/products");

    const row = page.getByTestId("row-product-101");
    await expect(row).toBeVisible();

    const inv = page.getByTestId("input-inventory-101");
    await inv.fill("99");

    const save = page.getByTestId("button-save-101");
    await expect(save).toBeEnabled();
    await save.click();

    await expect.poll(() => api.productUpdates.length).toBeGreaterThan(0);
    const last = api.productUpdates.at(-1)!;
    expect(last.id).toBe(101);
    expect(last.data.inventory).toBe(99);
  });

  test("runs a bulk inventory update across selected products", async ({
    page,
  }) => {
    const api = new AdminApi();
    await installAdminMocks(page, api);

    await page.goto("/admin/products");

    await page.getByTestId("checkbox-product-101").check();
    await page.getByTestId("checkbox-product-102").check();

    await expect(page.getByTestId("bulk-bar")).toContainText("2");

    await page.getByTestId("input-bulk-inventory").fill("50");
    await page.getByTestId("button-apply-bulk-inventory").click();

    await expect.poll(() => api.bulkCalls.length).toBeGreaterThan(0);
    const call = api.bulkCalls.at(-1)!;
    expect(call.updates).toHaveLength(2);
    expect(new Set(call.updates.map((u) => u.id))).toEqual(
      new Set([101, 102]),
    );
    expect(call.updates.every((u) => u.inventory === 50)).toBe(true);
  });

  test("downloads the products CSV", async ({ page }) => {
    const api = new AdminApi();
    await installAdminMocks(page, api);

    await page.goto("/admin/products");

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("button-download-csv").click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^products-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(api.csvDownloads).toBeGreaterThan(0);
  });
});
