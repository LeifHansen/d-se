import { test, expect, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Cart-to-Stripe checkout handoff
//
// Exercises the most revenue-critical click in the storefront:
//   1. /cart "Continue to checkout" navigates to the /checkout page.
//   2. Submitting the /checkout form POSTs to /api/checkout and the browser
//      redirects to whatever URL the API returns (the Stripe session URL,
//      or the dev fallback /checkout/success URL).
//   3. /checkout/success clears the locally-stored cart id before
//      redirecting on to the order/account page.
// ---------------------------------------------------------------------------

const STORED_CART_KEY = "dose-cart-id";
const CART_ID = "cart_e2e_handoff";
const STRIPE_STUB_PATH = "/__stripe-stub";
const ORDER_ID = 4242;
const RATE_ID = "usps_priority";

type CartFixture = {
  id: string;
  items: Array<{
    id: number;
    productId: number;
    quantity: number;
    lineTotalCents: number;
    product: {
      id: number;
      slug: string;
      name: string;
      priceCents: number;
      currency: string;
      images: string[];
      inventory: number;
    };
  }>;
  subtotalCents: number;
  currency: string;
  discountCode: string | null;
  discountCents: number;
  totalCents: number;
};

function makeCart(): CartFixture {
  return {
    id: CART_ID,
    items: [
      {
        id: 1,
        productId: 101,
        quantity: 1,
        lineTotalCents: 4_200,
        product: {
          id: 101,
          slug: "calm-tincture",
          name: "Calm Tincture",
          priceCents: 4_200,
          currency: "usd",
          images: [],
          inventory: 12,
        },
      },
    ],
    subtotalCents: 4_200,
    currency: "usd",
    discountCode: null,
    discountCents: 0,
    totalCents: 4_200,
  };
}

type CheckoutCall = {
  cartId?: string;
  email?: string;
  shippingRateId?: string;
  address?: { name?: string; zip?: string; country?: string };
};

async function installCheckoutMocks(
  page: Page,
  opts: { redirectUrl: string; calls: CheckoutCall[] },
): Promise<void> {
  await page.route("**/api/cart*", async (route: Route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeCart()),
    });
  });

  await page.route("**/api/shipping/rates", async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: RATE_ID,
          carrier: "USPS",
          service: "Priority",
          amountCents: 800,
          currency: "usd",
          deliveryDays: 3,
        },
      ]),
    });
  });

  await page.route("**/api/checkout", async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}") as CheckoutCall;
    opts.calls.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: opts.redirectUrl, orderId: ORDER_ID }),
    });
  });

  // Same-origin stub so Playwright can wait for the navigation triggered by
  // window.location.href = result.url. A real Stripe URL would be
  // cross-origin and produce flaky network behavior in a test environment.
  await page.route("**" + STRIPE_STUB_PATH, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: '<!doctype html><title>stripe-stub</title><h1 data-testid="stripe-stub">Stripe stub</h1>',
    });
  });
}

async function seedCartId(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // ignore
      }
    },
    [STORED_CART_KEY, CART_ID],
  );
}

test.describe("cart → Stripe checkout handoff", () => {
  test("/cart's Continue to checkout link routes to /checkout", async ({
    page,
  }) => {
    await installCheckoutMocks(page, {
      redirectUrl: "about:blank",
      calls: [],
    });
    await seedCartId(page);

    await page.goto("/cart");

    await expect(page.getByTestId("cart-items")).toBeVisible();
    await expect(page.getByTestId("cart-item-1")).toBeVisible();

    await page.getByTestId("cart-checkout").click();
    await page.waitForURL(/\/checkout(\?|$)/);
    await expect(page.getByTestId("page-checkout")).toBeVisible();
  });

  test("submitting /checkout posts to /api/checkout and redirects to the returned URL", async ({
    page,
    baseURL,
  }) => {
    const calls: CheckoutCall[] = [];
    const redirectUrl = `${baseURL}${STRIPE_STUB_PATH}?cs=cs_test_e2e`;
    await installCheckoutMocks(page, { redirectUrl, calls });
    await seedCartId(page);

    await page.goto("/checkout");
    await expect(page.getByTestId("page-checkout")).toBeVisible();

    await page.getByTestId("checkout-email").fill("buyer@example.com");
    await page.getByTestId("checkout-name").fill("Test Buyer");
    await page.getByTestId("checkout-street1").fill("1 Main St");
    await page.getByTestId("checkout-city").fill("Town");
    await page.getByTestId("checkout-state").fill("CA");
    await page.getByTestId("checkout-zip").fill("90210");

    await page.getByTestId("checkout-calc-shipping").click();
    // Wait for the rate to render and be auto-selected.
    await expect(page.locator(`input[value="${RATE_ID}"]`)).toBeChecked();

    await page.getByTestId("checkout-submit").click();

    await page.waitForURL(redirectUrl);
    await expect(page.getByTestId("stripe-stub")).toBeVisible();

    // Exactly one /api/checkout call carrying the persisted cart id, the
    // chosen shipping rate, and a non-empty address.
    expect(calls).toHaveLength(1);
    expect(calls[0].cartId).toBe(CART_ID);
    expect(calls[0].email).toBe("buyer@example.com");
    expect(calls[0].shippingRateId).toBe(RATE_ID);
    expect(calls[0].address?.zip).toBe("90210");
  });

  test("/checkout/success clears the stored cart id before redirecting", async ({
    page,
  }) => {
    await installCheckoutMocks(page, {
      redirectUrl: "about:blank",
      calls: [],
    });

    // The success page redirects to /orders/:id (or /account) once the cart
    // is cleared. Stub those destinations so the test stays self-contained
    // and we can assert the cleanup happened.
    await page.route(`**/orders/${ORDER_ID}*`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: '<!doctype html><title>order-stub</title><h1 data-testid="order-stub">Order page</h1>',
      });
    });
    await page.route("**/account*", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>account-stub</title><h1>Account</h1>",
      });
    });

    await seedCartId(page);

    await page.goto(`/checkout/success?orderId=${ORDER_ID}`);

    // Success page kicks off a same-origin redirect to /orders/:id once the
    // cleanup effect has run.
    await page.waitForURL(new RegExp(`/orders/${ORDER_ID}(\\?|$)`));
    await expect(page.getByTestId("order-stub")).toBeVisible();

    // localStorage is same-origin so the value is still readable on the
    // stubbed destination — and it must be null.
    const stored = await page.evaluate(
      (k) => window.localStorage.getItem(k),
      STORED_CART_KEY,
    );
    expect(stored).toBeNull();
  });
});
