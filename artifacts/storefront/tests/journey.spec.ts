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

type CartItem = {
  id: number;
  productId: number;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  product: Product;
};

type Cart = {
  id: string;
  items: CartItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
  discountCode: string | null;
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

const PRODUCTS: Product[] = [
  {
    id: 401,
    slug: "calm-tincture",
    name: "Calm Tincture",
    description:
      "A precise, hemp-derived tincture designed for evening rituals.",
    shortDescription: "Evening ritual tincture.",
    priceCents: 4500,
    compareAtCents: null,
    currency: "usd",
    images: [],
    inventory: 25,
    lowStockThreshold: 5,
    weightOz: null,
    tags: ["tincture"],
    seoTitle: null,
    seoDescription: null,
    featured: true,
    published: true,
    averageRating: 4.6,
    reviewCount: 12,
    createdAt: "2026-04-01T12:00:00.000Z",
  },
  {
    id: 402,
    slug: "focus-elixir",
    name: "Focus Elixir",
    description: "Daytime clarity in a dropper.",
    shortDescription: "Daytime clarity.",
    priceCents: 5200,
    compareAtCents: null,
    currency: "usd",
    images: [],
    inventory: 14,
    lowStockThreshold: 4,
    weightOz: null,
    tags: ["elixir"],
    seoTitle: null,
    seoDescription: null,
    featured: false,
    published: true,
    averageRating: 4.8,
    reviewCount: 7,
    createdAt: "2026-04-02T12:00:00.000Z",
  },
];

const POSTS: BlogPost[] = [
  {
    id: 9001,
    slug: "evening-ritual",
    title: "Designing your evening ritual",
    excerpt: "How to build a calmer wind-down with intention.",
    content:
      "# Designing your evening ritual\n\nA calm wind-down starts with one small habit.\n\nTry it tonight.",
    coverImage: null,
    tags: ["Rituals"],
    author: "DŌSE Team",
    publishedAt: "2026-05-01T12:00:00.000Z",
    seoTitle: null,
    seoDescription: null,
  },
  {
    id: 9002,
    slug: "morning-clarity",
    title: "Morning clarity, dialed in",
    excerpt: "Notes on starting the day with focus.",
    content: "# Morning clarity\n\nA few notes on starting the day with focus.",
    coverImage: null,
    tags: ["Notes"],
    author: "DŌSE Team",
    publishedAt: "2026-05-05T12:00:00.000Z",
    seoTitle: null,
    seoDescription: null,
  },
];

class StorefrontApi {
  cart: Cart = {
    id: "cart_test_1",
    items: [],
    subtotalCents: 0,
    discountCents: 0,
    totalCents: 0,
    currency: "usd",
    discountCode: null,
  };
  checkoutCalls: Array<Record<string, unknown>> = [];

  recompute() {
    const subtotal = this.cart.items.reduce(
      (sum, it) => sum + it.lineTotalCents,
      0,
    );
    this.cart.subtotalCents = subtotal;
    this.cart.totalCents = subtotal - this.cart.discountCents;
  }

  addItem(productId: number, quantity: number) {
    const product = PRODUCTS.find((p) => p.id === productId);
    if (!product) throw new Error(`unknown product ${productId}`);
    const existing = this.cart.items.find((it) => it.productId === productId);
    if (existing) {
      existing.quantity += quantity;
      existing.lineTotalCents = existing.quantity * existing.unitPriceCents;
    } else {
      this.cart.items.push({
        id: Math.floor(Math.random() * 100000) + 1,
        productId,
        quantity,
        unitPriceCents: product.priceCents,
        lineTotalCents: product.priceCents * quantity,
        product,
      });
    }
    this.recompute();
  }
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

async function installStorefrontMocks(
  page: Page,
  api: StorefrontApi,
): Promise<void> {
  await page.route("**/api/products/featured", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(PRODUCTS.filter((p) => p.featured)),
    });
  });

  await page.route("**/api/products", async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(PRODUCTS),
    });
  });

  await page.route("**/api/products/*", async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const slug = url.pathname.split("/").pop() ?? "";
    if (slug === "featured") return route.fallback();
    const product = PRODUCTS.find((p) => p.slug === slug);
    if (!product) {
      await route.fulfill({ status: 404, body: "{}" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(product),
    });
  });

  await page.route("**/api/products/*/reviews", async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        count: 0,
        averageRating: null,
      }),
    });
  });

  await page.route("**/api/cart/items", async (route: Route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = JSON.parse(route.request().postData() ?? "{}");
    api.addItem(Number(body.productId), Number(body.quantity ?? 1));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(api.cart),
    });
  });

  await page.route("**/api/cart*", async (route: Route) => {
    const url = new URL(route.request().url());
    if (
      url.pathname !== "/api/cart" ||
      route.request().method() !== "GET"
    ) {
      return route.fallback();
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(api.cart),
    });
  });

  await page.route("**/api/shipping/rates", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "rate_standard",
          carrier: "USPS",
          service: "Ground",
          deliveryDays: 5,
          amountCents: 599,
          currency: "usd",
        },
      ]),
    });
  });

  await page.route("**/api/checkout", async (route: Route) => {
    if (route.request().method() !== "POST") return route.fallback();
    api.checkoutCalls.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        url: "https://stripe.example.test/checkout/session_test_123",
      }),
    });
  });

  await page.route("**/api/blog/posts", async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(POSTS),
    });
  });

  await page.route("**/api/blog/posts/*", async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const slug = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    const post = POSTS.find((p) => p.slug === slug);
    if (!post) {
      await route.fulfill({ status: 404, body: "{}" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(post),
    });
  });
}

async function dismissOverlays(page: Page) {
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

test.describe("storefront customer journey", () => {
  test("shop -> PDP -> add to cart -> cart -> checkout (stop before payment)", async ({
    page,
  }) => {
    const api = new StorefrontApi();
    await installStorefrontMocks(page, api);

    // Pre-seed dismissals so the AgeGate / CookieBanner never block clicks.
    await page.goto("/shop");
    await dismissOverlays(page);
    await page.reload();

    await expect(page.getByTestId("shop-grid")).toBeVisible();
    await expect(
      page.getByTestId("product-card-calm-tincture"),
    ).toBeVisible();

    await page.getByTestId("product-card-calm-tincture").click();
    await expect(page).toHaveURL(/\/products\/calm-tincture$/);
    await expect(page.getByTestId("product-detail")).toBeVisible();
    await expect(page.getByTestId("product-name")).toContainText(
      "Calm Tincture",
    );

    // Bump quantity to 2, then add to cart.
    await page.getByTestId("qty-increase").click();
    await expect(page.getByTestId("qty-value")).toContainText("2");

    await page.getByTestId("button-add-to-cart").click();

    // Wait for the cart mutation to round-trip (cart now has the item).
    await expect.poll(() => api.cart.items.length).toBeGreaterThan(0);

    await page.goto("/cart");
    await expect(page.getByTestId("cart-items")).toBeVisible();
    const itemId = api.cart.items[0].id;
    await expect(page.getByTestId(`cart-item-${itemId}`)).toContainText(
      "Calm Tincture",
    );
    await expect(page.getByTestId("summary-subtotal")).toContainText("$90.00");

    // Proceed to /checkout. We navigate directly because the cart's
    // "Continue to checkout" button on this storefront kicks off a Stripe
    // redirect via /api/checkout — the task explicitly asks us to stop
    // before payment, so we visit the local checkout page instead.
    await page.goto("/checkout");
    await expect(page.getByTestId("checkout-form")).toBeVisible();

    // Fill the address form.
    await page.getByTestId("checkout-email").fill("shopper@example.com");
    await page.getByTestId("checkout-name").fill("Casey Buyer");
    await page.getByTestId("checkout-street1").fill("100 Test Lane");
    await page.getByTestId("checkout-city").fill("Portland");
    await page.getByTestId("checkout-state").fill("OR");
    await page.getByTestId("checkout-zip").fill("97201");

    // Calculate shipping. The mocked rate becomes selected by default.
    await page.getByTestId("checkout-calc-shipping").click();
    await expect(
      page.locator('input[name="shipping-rate"]'),
    ).toBeChecked();

    // Stop before payment: assert the submit button is reachable & enabled,
    // but do NOT click it (the test must not hand off to Stripe).
    const submit = page.getByTestId("checkout-submit");
    await expect(submit).toBeVisible();
    await expect(submit).toBeEnabled();
    expect(api.checkoutCalls).toHaveLength(0);
  });

  test("blog list -> open a post -> back to list", async ({ page }) => {
    const api = new StorefrontApi();
    await installStorefrontMocks(page, api);

    await page.goto("/blog");
    await dismissOverlays(page);
    await page.reload();

    await expect(page.getByTestId("blog-grid")).toBeVisible();
    await expect(
      page.getByTestId("blog-post-evening-ritual"),
    ).toBeVisible();

    await page.getByTestId("blog-post-evening-ritual").click();
    await expect(page).toHaveURL(/\/blog\/evening-ritual$/);
    await expect(page.getByTestId("blog-post")).toBeVisible();
    await expect(page.getByTestId("blog-post-content")).toContainText(
      "calm wind-down",
    );

    await page.getByTestId("link-back-to-blog").click();
    await expect(page).toHaveURL(/\/blog$/);
    await expect(page.getByTestId("blog-grid")).toBeVisible();
  });
});
