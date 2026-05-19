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

type BlogPost = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string | null;
  tags: string[];
  author: string | null;
  publishedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

const baseProduct = (
  over: Partial<Product> & Pick<Product, "id" | "slug" | "name" | "tags">,
): Product => ({
  description: "Test product.",
  shortDescription: null,
  priceCents: 4500,
  compareAtCents: null,
  currency: "usd",
  images: [],
  inventory: 10,
  lowStockThreshold: 2,
  weightOz: null,
  seoTitle: null,
  seoDescription: null,
  featured: false,
  published: true,
  averageRating: null,
  reviewCount: 0,
  createdAt: "2026-04-01T12:00:00.000Z",
  ...over,
});

const PRODUCTS: Product[] = [
  baseProduct({ id: 7001, slug: "calm-drops", name: "Calm Drops", tags: ["calm"] }),
  baseProduct({ id: 7002, slug: "focus-drops", name: "Focus Drops", tags: ["focus"] }),
  baseProduct({ id: 7003, slug: "calm-elixir", name: "Calm Elixir", tags: ["calm"] }),
];

const POSTS: BlogPost[] = [
  {
    id: 8001,
    slug: "evening-ritual",
    title: "Designing your evening ritual",
    excerpt: "Wind-down notes.",
    content: "# Evening ritual\n",
    coverImage: null,
    tags: ["Rituals"],
    author: "DŌSE Team",
    publishedAt: "2026-05-01T12:00:00.000Z",
    seoTitle: null,
    seoDescription: null,
  },
  {
    id: 8002,
    slug: "morning-clarity",
    title: "Morning clarity, dialed in",
    excerpt: "Day-start notes.",
    content: "# Morning clarity\n",
    coverImage: null,
    tags: ["Notes"],
    author: "DŌSE Team",
    publishedAt: "2026-05-05T12:00:00.000Z",
    seoTitle: null,
    seoDescription: null,
  },
  {
    id: 8003,
    slug: "more-rituals",
    title: "More ritual ideas",
    excerpt: "More wind-down notes.",
    content: "# More\n",
    coverImage: null,
    tags: ["Rituals"],
    author: "DŌSE Team",
    publishedAt: "2026-05-10T12:00:00.000Z",
    seoTitle: null,
    seoDescription: null,
  },
];

async function installMocks(page: Page): Promise<void> {
  await page.route("**/api/products/featured", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/products**", async (route: Route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.fallback();
    const url = new URL(req.url());
    if (url.pathname !== "/api/products") return route.fallback();
    const tag = url.searchParams.get("tag");
    const list = tag ? PRODUCTS.filter((p) => p.tags.includes(tag)) : PRODUCTS;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(list),
    });
  });

  await page.route("**/api/blog/posts**", async (route: Route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.fallback();
    const url = new URL(req.url());
    if (url.pathname !== "/api/blog/posts") return route.fallback();
    const tag = url.searchParams.get("tag");
    const list = tag ? POSTS.filter((p) => p.tags.includes(tag)) : POSTS;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(list),
    });
  });

  await page.route("**/api/cart**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "cart_test",
        items: [],
        subtotalCents: 0,
        discountCents: 0,
        totalCents: 0,
        currency: "usd",
        discountCode: null,
      }),
    });
  });
}

test.describe("tag filter chips", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("dose-age-confirmed", "yes");
      } catch {}
    });
    await installMocks(page);
  });

  test("shop: clicking a tag filters the grid and updates the URL", async ({
    page,
  }) => {
    await page.goto("/shop");
    await expect(page.getByTestId("shop-tag-filter")).toBeVisible();

    // All three products visible by default.
    await expect(page.getByTestId("product-card-calm-drops")).toBeVisible();
    await expect(page.getByTestId("product-card-focus-drops")).toBeVisible();
    await expect(page.getByTestId("product-card-calm-elixir")).toBeVisible();
    await expect(page.getByTestId("shop-tag-all")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByTestId("shop-tag-calm").click();
    await expect(page).toHaveURL(/\/shop\?tag=calm$/);
    await expect(page.getByTestId("shop-tag-calm")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("shop-tag-all")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await expect(page.getByTestId("product-card-calm-drops")).toBeVisible();
    await expect(page.getByTestId("product-card-calm-elixir")).toBeVisible();
    await expect(page.getByTestId("product-card-focus-drops")).toHaveCount(0);
  });

  test("shop: loading /shop?tag=... shows the chip as active", async ({
    page,
  }) => {
    await page.goto("/shop?tag=focus");
    await expect(page.getByTestId("shop-tag-focus")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("shop-tag-all")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByTestId("product-card-focus-drops")).toBeVisible();
    await expect(page.getByTestId("product-card-calm-drops")).toHaveCount(0);
    await expect(page.getByTestId("product-card-calm-elixir")).toHaveCount(0);
  });

  test("blog: clicking a tag filters the list and updates the URL", async ({
    page,
  }) => {
    await page.goto("/blog");
    await expect(page.getByTestId("blog-tag-filter")).toBeVisible();

    await expect(page.getByTestId("blog-post-evening-ritual")).toBeVisible();
    await expect(page.getByTestId("blog-post-morning-clarity")).toBeVisible();
    await expect(page.getByTestId("blog-post-more-rituals")).toBeVisible();
    await expect(page.getByTestId("blog-tag-all")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByTestId("blog-tag-Rituals").click();
    await expect(page).toHaveURL(/\/blog\?tag=Rituals$/);
    await expect(page.getByTestId("blog-tag-Rituals")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("blog-tag-all")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await expect(page.getByTestId("blog-post-evening-ritual")).toBeVisible();
    await expect(page.getByTestId("blog-post-more-rituals")).toBeVisible();
    await expect(
      page.getByTestId("blog-post-morning-clarity"),
    ).toHaveCount(0);
  });

  test("blog: loading /blog?tag=... shows the chip as active", async ({
    page,
  }) => {
    await page.goto("/blog?tag=Notes");
    await expect(page.getByTestId("blog-tag-Notes")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("blog-tag-all")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByTestId("blog-post-morning-clarity")).toBeVisible();
    await expect(page.getByTestId("blog-post-evening-ritual")).toHaveCount(0);
    await expect(page.getByTestId("blog-post-more-rituals")).toHaveCount(0);
  });
});
