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

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

test.describe("admin product images", () => {
  test("uploads, reorders, removes, and persists product images", async ({
    page,
  }) => {
    const product: Product = {
      id: 201,
      slug: "image-flow",
      name: "Image Flow",
      description: "A product to exercise the image manager.",
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

    let uploadCounter = 0;
    const objectPaths: string[] = [];
    const publishedFor: string[] = [];
    const putUrls: string[] = [];
    const updates: Array<{ id: number; data: Partial<Product> }> = [];

    function publishedUrl(objectPath: string): string {
      // Mirror the api-server's publishUploadedImage behavior: object entity
      // paths get rewritten to /api/storage<path> so the ACL-protected file
      // is reachable through the storage proxy.
      return `/api/storage${objectPath}`;
    }

    await page.route(
      "**/api/storage/uploads/request-url",
      async (route: Route) => {
        if (route.request().method() !== "POST") {
          await route.fallback();
          return;
        }
        uploadCounter += 1;
        const objectPath = `/objects/uploads/upload-${uploadCounter}`;
        const uploadURL = `https://fake-upload.example.com/object-${uploadCounter}`;
        objectPaths.push(objectPath);
        const payload = JSON.parse(route.request().postData() ?? "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            uploadURL,
            objectPath,
            metadata: {
              name: payload.name,
              size: payload.size,
              contentType: payload.contentType,
            },
          }),
        });
      },
    );

    // PUT to the presigned upload URL — succeed without doing anything.
    await page.route(
      "https://fake-upload.example.com/**",
      async (route: Route) => {
        if (route.request().method() !== "PUT") {
          await route.fallback();
          return;
        }
        putUrls.push(route.request().url());
        await route.fulfill({ status: 200, body: "" });
      },
    );

    await page.route(
      "**/api/admin/uploads/publish-image",
      async (route: Route) => {
        const body = JSON.parse(route.request().postData() ?? "{}");
        publishedFor.push(body.objectPath);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: publishedUrl(body.objectPath) }),
        });
      },
    );

    // Admin stats — keep the dashboard quiet if anything probes it.
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

    // Storefront-side mocks for the verification step at the end.
    await page.route("**/api/products/image-flow", async (route: Route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(product),
      });
    });
    await page.route(
      "**/api/products/image-flow/reviews*",
      async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [],
            averageRating: null,
            count: 0,
          }),
        });
      },
    );

    // ------------------------------------------------------------------
    // Open the admin product editor and exercise the image manager.
    // ------------------------------------------------------------------
    await page.goto("/admin/products");
    await expect(page.getByTestId("row-product-201")).toBeVisible();

    await page.getByTestId("button-edit-201").click();
    await expect(page.getByTestId("product-image-manager")).toBeVisible();
    // Editor opens with no images yet.
    await expect(page.getByTestId("product-image-thumb-0")).toHaveCount(0);

    // Upload three image files at once.
    const fileInput = page.getByTestId("input-product-image-file");
    await fileInput.setInputFiles([
      { name: "first.png", mimeType: "image/png", buffer: PNG_BYTES },
      { name: "second.png", mimeType: "image/png", buffer: PNG_BYTES },
      { name: "third.png", mimeType: "image/png", buffer: PNG_BYTES },
    ]);

    // Thumbnails appear in upload order, with the first as the cover.
    await expect(page.getByTestId("product-image-thumb-0")).toBeVisible();
    await expect(page.getByTestId("product-image-thumb-1")).toBeVisible();
    await expect(page.getByTestId("product-image-thumb-2")).toBeVisible();

    expect(objectPaths).toHaveLength(3);
    expect(putUrls).toHaveLength(3);
    expect(publishedFor).toEqual(objectPaths);

    const firstSrc = await page
      .getByTestId("product-image-thumb-0")
      .locator("img")
      .getAttribute("src");
    expect(firstSrc).toBe(publishedUrl(objectPaths[0]));

    // Reorder: promote the second image to be the cover.
    await page.getByTestId("button-image-up-1").click();
    const newCoverSrc = await page
      .getByTestId("product-image-thumb-0")
      .locator("img")
      .getAttribute("src");
    expect(newCoverSrc).toBe(publishedUrl(objectPaths[1]));

    // Remove the (now last) image.
    await page.getByTestId("button-image-remove-2").click();
    await expect(page.getByTestId("product-image-thumb-2")).toHaveCount(0);
    await expect(page.getByTestId("product-image-thumb-1")).toBeVisible();

    // Save the product and verify the persisted images payload.
    await page.getByTestId("button-save-product").click();

    await expect.poll(() => updates.length).toBeGreaterThan(0);
    const lastUpdate = updates.at(-1)!;
    expect(lastUpdate.id).toBe(201);
    expect(lastUpdate.data.images).toEqual([
      publishedUrl(objectPaths[1]),
      publishedUrl(objectPaths[0]),
    ]);

    // Editor closes after a successful save.
    await expect(page.getByTestId("product-image-manager")).toHaveCount(0);

    // ------------------------------------------------------------------
    // Visit the public storefront product page and confirm the persisted
    // images render in the new order.
    // ------------------------------------------------------------------
    await page.goto("/products/image-flow");
    await expect(page.getByTestId("product-detail")).toBeVisible();

    const mainSrc = await page
      .getByTestId("product-image-main")
      .getAttribute("src");
    expect(mainSrc).toBe(publishedUrl(objectPaths[1]));

    // Two images persisted -> two thumbnails, no third.
    await expect(page.getByTestId("product-thumb-0")).toBeVisible();
    await expect(page.getByTestId("product-thumb-1")).toBeVisible();
    await expect(page.getByTestId("product-thumb-2")).toHaveCount(0);
  });
});
