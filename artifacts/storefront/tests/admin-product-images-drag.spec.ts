import { test, expect, type Route } from "@playwright/test";

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

test.describe("admin product images — drag and drop", () => {
  test("admins can drag thumbnails to reorder images and persist the new order", async ({
    page,
  }) => {
    const initialImages = [
      "/api/storage/objects/uploads/drag-a",
      "/api/storage/objects/uploads/drag-b",
      "/api/storage/objects/uploads/drag-c",
    ];

    const product: Product = {
      id: 314,
      slug: "drag-flow",
      name: "Drag Flow",
      description: "A product to exercise drag-and-drop image reordering.",
      shortDescription: null,
      priceCents: 1800,
      compareAtCents: null,
      currency: "usd",
      images: initialImages.slice(),
      inventory: 9,
      lowStockThreshold: 2,
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

    const updates: Array<{ id: number; data: Partial<Product> }> = [];

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
          totalProducts: 1,
          webhookHealthy: true,
          webhookLastReceivedAt: "2026-05-14T09:00:00.000Z",
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

    await page.route("**/api/admin/products", async (route: Route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([product]),
      });
    });

    await page.route("**/api/admin/products/*", async (route: Route) => {
      const url = new URL(route.request().url());
      const m = /\/api\/admin\/products\/(\d+)$/.exec(url.pathname);
      if (!m) {
        await route.fallback();
        return;
      }
      const id = Number(m[1]);
      const method = route.request().method();
      if (method === "PUT" || method === "PATCH") {
        const body = JSON.parse(route.request().postData() ?? "{}");
        updates.push({ id, data: body });
        Object.assign(product, body);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(product),
        });
        return;
      }
      await route.fallback();
    });

    // ------------------------------------------------------------------
    // Open the editor and drag the last thumbnail onto the first one.
    // ------------------------------------------------------------------
    await page.goto("/admin/products");
    await expect(page.getByTestId("row-product-314")).toBeVisible();

    await page.getByTestId("button-edit-314").click();
    await expect(page.getByTestId("product-image-manager")).toBeVisible();

    // Sanity check: thumbnails render in the persisted order.
    for (let i = 0; i < initialImages.length; i++) {
      await expect(
        page.getByTestId(`product-image-thumb-${i}`).locator("img"),
      ).toHaveAttribute("src", initialImages[i]);
    }

    // Drag the third thumbnail (index 2) onto the first (index 0).
    // The ImageManager's onDrop calls move(dragIndex, dropIndex) which
    // splices the dragged item out and re-inserts it at the drop index,
    // so [a, b, c] should become [c, a, b].
    await page.dragAndDrop(
      '[data-testid="product-image-thumb-2"]',
      '[data-testid="product-image-thumb-0"]',
    );

    const expectedOrder = [
      initialImages[2],
      initialImages[0],
      initialImages[1],
    ];

    for (let i = 0; i < expectedOrder.length; i++) {
      await expect(
        page.getByTestId(`product-image-thumb-${i}`).locator("img"),
      ).toHaveAttribute("src", expectedOrder[i]);
    }

    // Save and confirm the PATCH payload reflects the dragged order.
    await page.getByTestId("button-save-product").click();

    await expect.poll(() => updates.length).toBeGreaterThan(0);
    const lastUpdate = updates.at(-1)!;
    expect(lastUpdate.id).toBe(314);
    expect(lastUpdate.data.images).toEqual(expectedOrder);

    await expect(page.getByTestId("product-image-manager")).toHaveCount(0);
  });
});
