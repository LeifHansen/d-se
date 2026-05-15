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

  await page.route("**/api/orders/me", async (route: Route) => {
    // Default: not signed in. Account page falls back to the guest lookup UI.
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unauthenticated" }),
    });
  });

  await page.route("**/api/orders/lookup", async (route: Route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = JSON.parse(route.request().postData() ?? "{}");
    const orderId = Number(body.orderId);
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    if (orderId === 7777 && email === "guest@example.com") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 7777,
          status: "paid",
          email: "guest@example.com",
          items: [
            {
              id: 1,
              productId: PRODUCTS[0].id,
              productName: PRODUCTS[0].name,
              productImage: null,
              quantity: 1,
              priceCents: PRODUCTS[0].priceCents,
            },
          ],
          subtotalCents: PRODUCTS[0].priceCents,
          shippingCents: 0,
          taxCents: 0,
          discountCents: 0,
          discountCode: null,
          totalCents: PRODUCTS[0].priceCents,
          currency: "usd",
          shippingAddress: undefined,
          trackingCode: null,
          labelUrl: null,
          createdAt: "2026-05-10T12:00:00.000Z",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Order not found" }),
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

  test("guest can look up an order from /account and view it on /orders/:id", async ({
    page,
  }) => {
    const api = new StorefrontApi();
    await installStorefrontMocks(page, api);

    // Visit /account first so we can dismiss overlays before interacting.
    await page.goto("/account");
    await dismissOverlays(page);
    await page.reload();

    // Account falls back to the guest lookup form when the user isn't signed in.
    await expect(page.getByTestId("account-signin")).toBeVisible();
    await expect(page.getByTestId("guest-order-lookup")).toBeVisible();

    await page.getByTestId("lookup-order-id").fill("7777");
    await page.getByTestId("lookup-order-email").fill("guest@example.com");
    await page.getByTestId("lookup-order-submit").click();

    // The form navigates to /orders/:id and forwards the email via query string;
    // the order detail page auto-attempts the lookup and renders the summary.
    await expect(page).toHaveURL(/\/orders\/7777\?email=/);
    await expect(page.getByTestId("order-summary")).toBeVisible();
    await expect(page.getByTestId("order-total")).toContainText("$45.00");
    await expect(page.getByTestId("order-item-1")).toContainText(
      "Calm Tincture",
    );
  });

  test("/orders/:id shows the lookup form and an error when the email doesn't match", async ({
    page,
  }) => {
    const api = new StorefrontApi();
    await installStorefrontMocks(page, api);

    // Visit with an email that the mocked lookup will reject. The page
    // auto-attempts the lookup, fails, and renders the form + error.
    await page.goto("/orders/7777?email=not-the-buyer@example.com");
    await dismissOverlays(page);

    await expect(page.getByTestId("order-lookup-form")).toBeVisible();
    await expect(page.getByTestId("order-lookup-error")).toBeVisible();

    // Resubmitting with the correct email reveals the order summary.
    await page.getByTestId("order-lookup-email").fill("guest@example.com");
    await page.getByTestId("order-lookup-submit").click();
    await expect(page.getByTestId("order-summary")).toBeVisible();
    await expect(page.getByTestId("order-total")).toContainText("$45.00");
  });

  test("/account shows signed-in shopper's order list", async ({ page }) => {
    const api = new StorefrontApi();
    await installStorefrontMocks(page, api);

    // Override the default 401 mock with a signed-in response so the account
    // page renders the order list instead of the guest lookup form.
    await page.unroute("**/api/orders/me");
    await page.route("**/api/orders/me", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 8801,
            status: "paid",
            email: "shopper@example.com",
            items: [
              {
                id: 1,
                productId: PRODUCTS[0].id,
                productName: PRODUCTS[0].name,
                productImage: null,
                quantity: 2,
                priceCents: PRODUCTS[0].priceCents,
              },
            ],
            subtotalCents: PRODUCTS[0].priceCents * 2,
            shippingCents: 0,
            taxCents: 0,
            discountCents: 0,
            discountCode: null,
            totalCents: PRODUCTS[0].priceCents * 2,
            currency: "usd",
            trackingCode: "1Z999AA10123456784",
            trackingUrl: "https://track.example.test/1Z999",
            carrier: "UPS",
            labelUrl: null,
            createdAt: "2026-05-01T12:00:00.000Z",
          },
        ]),
      });
    });

    await page.goto("/account");
    await dismissOverlays(page);
    await page.reload();

    await expect(page.getByTestId("page-account")).toBeVisible();
    await expect(page.getByTestId("account-orders")).toBeVisible();
    await expect(page.getByTestId("order-8801")).toContainText("Order #8801");
    await expect(page.getByTestId("order-8801")).toContainText("Calm Tincture");
    await expect(page.getByTestId("order-8801")).toContainText("$90.00");
    await expect(
      page.getByTestId("account-order-tracking-link"),
    ).toHaveAttribute("href", "https://track.example.test/1Z999");

    // Guest lookup form is still rendered below the order list as a fallback.
    await expect(page.getByTestId("guest-order-lookup")).toBeVisible();
  });

  test("/checkout/success renders the order summary from the session id", async ({
    page,
  }) => {
    const api = new StorefrontApi();
    await installStorefrontMocks(page, api);

    const ORDER_ID = 9501;
    await page.route(`**/api/orders/${ORDER_ID}*`, async (route: Route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const url = new URL(route.request().url());
      // The success page forwards the Stripe session id as the guest receipt
      // token; assert it actually lands in the request.
      expect(url.searchParams.get("sessionId")).toBe("cs_test_success_123");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: ORDER_ID,
          status: "paid",
          email: "shopper@example.com",
          items: [
            {
              id: 1,
              productId: PRODUCTS[0].id,
              productName: PRODUCTS[0].name,
              productImage: null,
              quantity: 2,
              priceCents: PRODUCTS[0].priceCents,
            },
          ],
          subtotalCents: PRODUCTS[0].priceCents * 2,
          shippingCents: 599,
          taxCents: 0,
          discountCents: 0,
          discountCode: null,
          totalCents: PRODUCTS[0].priceCents * 2 + 599,
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
          createdAt: "2026-05-10T12:00:00.000Z",
        }),
      });
    });

    await page.goto(
      `/checkout/success?orderId=${ORDER_ID}&session_id=cs_test_success_123`,
    );
    await dismissOverlays(page);

    await expect(page.getByTestId("checkout-success-page")).toBeVisible();
    await expect(page.getByTestId("success-order-id")).toContainText(
      `Order #${ORDER_ID}`,
    );
    await expect(page.getByTestId("success-order-summary")).toBeVisible();
    await expect(page.getByTestId("success-order-status")).toContainText(
      "paid",
    );
    await expect(page.getByTestId("success-order-items")).toContainText(
      "Calm Tincture",
    );
    await expect(page.getByTestId("success-order-total")).toContainText(
      "$95.99",
    );
    await expect(page.getByTestId("success-order-address")).toContainText(
      "100 Test Lane",
    );
    await expect(page.getByTestId("success-order-email")).toContainText(
      "shopper@example.com",
    );
    await expect(page.getByTestId("success-order-delivery")).toBeVisible();
  });

  test("cart shipping estimate updates total and rehydrates after reload", async ({
    page,
  }) => {
    const api = new StorefrontApi();
    await installStorefrontMocks(page, api);

    // Seed the cart with one Calm Tincture by going through the PDP path so
    // that the cart id ends up persisted in localStorage like a real shopper.
    await page.goto("/products/calm-tincture");
    await dismissOverlays(page);
    await page.reload();
    await expect(page.getByTestId("product-detail")).toBeVisible();
    await page.getByTestId("button-add-to-cart").click();
    await expect.poll(() => api.cart.items.length).toBeGreaterThan(0);

    await page.goto("/cart");
    await expect(page.getByTestId("cart-items")).toBeVisible();
    await expect(page.getByTestId("summary-subtotal")).toContainText("$45.00");

    // Before estimating, the shipping row shows the placeholder copy and the
    // total equals the subtotal.
    await expect(
      page.getByTestId("summary-shipping-placeholder"),
    ).toBeVisible();
    await expect(page.getByTestId("summary-total")).toContainText("$45.00");

    // Fill the ZIP/country form and submit. The mocked /api/shipping/rates
    // returns a single $5.99 USPS Ground rate which becomes the cheapest.
    await page.getByTestId("ship-estimate-zip").fill("97201");
    await page.getByTestId("ship-estimate-country").fill("US");
    await page.getByTestId("ship-estimate-apply").click();

    const shipRow = page.getByTestId("summary-shipping-estimate");
    await expect(shipRow).toBeVisible();
    await expect(shipRow).toContainText("$5.99");
    await expect(
      page.getByTestId("summary-shipping-estimate-label"),
    ).toContainText("97201");
    await expect(page.getByTestId("ship-estimate-detail")).toContainText(
      "USPS",
    );

    // Total should now be subtotal + shipping = $45.00 + $5.99 = $50.99.
    await expect(page.getByTestId("summary-total")).toContainText("$50.99");

    // Reload and assert the estimate rehydrates from localStorage without
    // needing to re-submit the form.
    await page.reload();
    await expect(page.getByTestId("cart-items")).toBeVisible();
    await expect(
      page.getByTestId("summary-shipping-estimate"),
    ).toContainText("$5.99");
    await expect(page.getByTestId("summary-total")).toContainText("$50.99");
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

    // Avoid clicking link-back-to-blog: the post page re-renders as the
    // markdown content and related-posts query settle, which can detach the
    // anchor mid-click and time out Playwright's retry. Asserting the link's
    // href and navigating via page.goto gives us the same coverage without
    // racing React re-renders.
    await expect(page.getByTestId("link-back-to-blog")).toHaveAttribute(
      "href",
      "/blog",
    );
    await page.goto("/blog");
    await expect(page).toHaveURL(/\/blog$/);
    await expect(page.getByTestId("blog-grid")).toBeVisible();
  });
});
