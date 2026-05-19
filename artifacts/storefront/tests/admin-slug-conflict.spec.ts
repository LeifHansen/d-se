import { test, expect, type Page, type Route } from "@playwright/test";

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
    },
    {
      ...BASE_PRODUCT,
      id: 102,
      slug: "focus-gummies",
      name: "Focus Gummies",
    },
  ];
}

type ApiState = {
  products: Product[];
  createCalls: Array<Record<string, unknown>>;
};

async function installMocks(page: Page, state: ApiState): Promise<void> {
  await page.route("**/api/admin/stats**", async (route) => {
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
        totalProducts: state.products.length,
        webhookHealthy: true,
        webhookLastReceivedAt: "2026-05-14T09:00:00.000Z",
        recentOrders: [],
        marketing: {
          newsletterSubscribers: 0,
          rangeDays: 7,
          ordersInRange: 0,
          revenueCentsInRange: 0,
          ga4Url: "https://analytics.google.com/example",
          subscribersDaily: [],
          ordersDaily: [],
          revenueCentsDaily: [],
        },
      }),
    });
  });

  await page.route("**/api/admin/products", async (route: Route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.products),
      });
      return;
    }
    if (method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}");
      state.createCalls.push(body);
      // Mimic a server-side unique-slug rejection so that even if the
      // client somehow lets a colliding slug through, the request is
      // refused rather than silently succeeding.
      const slug = String(body.slug ?? "").toLowerCase();
      if (state.products.some((p) => p.slug === slug)) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: "Slug already in use" }),
        });
        return;
      }
      const created: Product = {
        ...BASE_PRODUCT,
        id: Math.max(0, ...state.products.map((p) => p.id)) + 1,
        slug,
        name: String(body.name ?? ""),
      };
      state.products.push(created);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(created),
      });
      return;
    }
    await route.fallback();
  });
}

test.describe("admin product slug conflict", () => {
  test("inline warning appears, blocks submit, and never fires when editing the slug's owner", async ({
    page,
  }) => {
    const state: ApiState = { products: makeProducts(), createCalls: [] };
    await installMocks(page, state);

    await page.goto("/admin/products");

    await expect(page.getByTestId("row-product-101")).toBeVisible();

    // Open the create dialog.
    await page.getByTestId("button-new-product").click();
    const nameInput = page.getByTestId("input-product-name");
    const slugInput = page.getByTestId("input-product-slug");
    const conflict = page.getByTestId("text-slug-conflict");
    await expect(nameInput).toBeVisible();

    // Type a name that auto-slugifies into a fresh slug — no conflict yet.
    await nameInput.fill("Brand New Thing");
    await expect(slugInput).toHaveValue("brand-new-thing");
    await expect(conflict).toHaveCount(0);

    // Type a slug that an existing product already owns — warning shows
    // and references the owning product by name.
    await slugInput.fill("calm-tincture");
    await expect(conflict).toBeVisible();
    await expect(conflict).toContainText("Calm Tincture");

    // Change the slug to something free — warning disappears.
    await slugInput.fill("calm-tincture-2");
    await expect(conflict).toHaveCount(0);

    // Put the colliding slug back and try to submit. The save button
    // should surface a slug-specific error (mentioning the slug AND the
    // colliding product's name), and no POST should reach the server.
    await slugInput.fill("calm-tincture");
    await page.getByTestId("input-product-description").fill("Some description");
    await page.getByTestId("input-product-price").fill("19.99");
    await page.getByTestId("button-save-product").click();

    const formError = page.getByTestId("product-editor-error");
    await expect(formError).toBeVisible();
    await expect(formError).toContainText("calm-tincture");
    await expect(formError).toContainText("Calm Tincture");
    // Sanity: this is the slug-collision message, not a generic server error.
    await expect(formError).not.toContainText(/server error|failed to fetch|500/i);

    // Give the request channel a moment in case the client mistakenly fired.
    await page.waitForTimeout(200);
    expect(state.createCalls).toHaveLength(0);
    expect(state.products).toHaveLength(2);

    // Cancel out of the create dialog.
    await page.keyboard.press("Escape");

    // Open the existing owner of the slug for edit. Its slug is already
    // "calm-tincture", but because it owns that slug, the warning must
    // NOT appear.
    await page.getByTestId("button-edit-101").click();
    await expect(slugInput).toHaveValue("calm-tincture");
    await expect(conflict).toHaveCount(0);

    // And typing in another product's slug from the editor view DOES flag.
    await slugInput.fill("focus-gummies");
    await expect(conflict).toBeVisible();
    await expect(conflict).toContainText("Focus Gummies");

    // Restoring its own slug clears the warning again.
    await slugInput.fill("calm-tincture");
    await expect(conflict).toHaveCount(0);
  });

  test("offers a one-click unique-slug suggestion next to the conflict warning", async ({
    page,
  }) => {
    const state: ApiState = {
      products: [
        ...makeProducts(),
        // Already-taken `-2` variant so the suggestion must skip to `-3`.
        {
          ...BASE_PRODUCT,
          id: 103,
          slug: "calm-tincture-2",
          name: "Calm Tincture v2",
        },
      ],
      createCalls: [],
    };
    await installMocks(page, state);

    await page.goto("/admin/products");
    await expect(page.getByTestId("row-product-101")).toBeVisible();

    await page.getByTestId("button-new-product").click();
    const nameInput = page.getByTestId("input-product-name");
    const slugInput = page.getByTestId("input-product-slug");
    const conflict = page.getByTestId("text-slug-conflict");
    const suggestion = page.getByTestId("button-use-slug-suggestion");

    await nameInput.fill("Brand New Thing");
    await expect(suggestion).toHaveCount(0);

    // Type a colliding slug — both the warning and suggestion appear.
    await slugInput.fill("calm-tincture");
    await expect(conflict).toBeVisible();
    await expect(suggestion).toBeVisible();
    // -2 is also taken, so the suggestion should be -3.
    await expect(suggestion).toHaveText(/calm-tincture-3/);

    // Clicking the suggestion fills the slug input and clears the warning.
    await suggestion.click();
    await expect(slugInput).toHaveValue("calm-tincture-3");
    await expect(conflict).toHaveCount(0);
    await expect(suggestion).toHaveCount(0);

    // Typing a slug that already ends in `-N` strips the suffix when
    // picking the next free numeric variant — not `calm-tincture-2-2`.
    await slugInput.fill("calm-tincture-2");
    await expect(conflict).toBeVisible();
    await expect(suggestion).toBeVisible();
    await expect(suggestion).toHaveText(/calm-tincture-3/);

    await suggestion.click();
    await expect(slugInput).toHaveValue("calm-tincture-3");
    await expect(conflict).toHaveCount(0);

    // And the suggested slug actually saves successfully — no 409.
    await page
      .getByTestId("input-product-description")
      .fill("Some description");
    await page.getByTestId("input-product-price").fill("19.99");
    await page.getByTestId("button-save-product").click();

    await expect
      .poll(() => state.createCalls.length, { timeout: 3000 })
      .toBe(1);
    expect(state.createCalls[0]).toMatchObject({ slug: "calm-tincture-3" });
  });
});
