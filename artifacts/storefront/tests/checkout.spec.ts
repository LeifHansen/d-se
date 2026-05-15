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
const AGE_CONFIRMED_KEY = "dose-age-confirmed";
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
  await page.route("**" + STRIPE_STUB_PATH + "*", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: '<!doctype html><title>stripe-stub</title><h1 data-testid="stripe-stub">Stripe stub</h1>',
    });
  });
}

async function seedCartId(page: Page): Promise<void> {
  await page.addInitScript(
    ([cartKey, cartValue, ageKey, ageValue]) => {
      try {
        window.localStorage.setItem(cartKey, cartValue);
        // Pre-dismiss the AgeGate / CookieBanner so they don't intercept
        // clicks during the test.
        window.localStorage.setItem(ageKey, ageValue);
        window.localStorage.setItem("dose-cookies-decision", "accept");
      } catch {
        // ignore
      }
    },
    [STORED_CART_KEY, CART_ID, AGE_CONFIRMED_KEY, "yes"],
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

  // Regression guard: the cart's "Continue to checkout" button used to call
  // /api/checkout directly with no shipping rate, handing the shopper off to
  // Stripe with $0 shipping. It must instead route to the in-app /checkout
  // page where the address form + shipping-rate picker live, and "Pay
  // securely" must stay disabled until a rate is selected.
  test("Continue to checkout sends the shopper through the rate picker, not straight to Stripe", async ({
    page,
  }) => {
    const calls: CheckoutCall[] = [];
    await installCheckoutMocks(page, {
      redirectUrl: "about:blank",
      calls,
    });

    // If anything tries to hit Stripe directly from the cart click, fail
    // loudly instead of silently navigating cross-origin.
    let stripeHit = false;
    await page.route(/https?:\/\/([a-z0-9-]+\.)*stripe\.com\/.*/i, async (route: Route) => {
      stripeHit = true;
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>stripe-hit</title>",
      });
    });

    await seedCartId(page);

    await page.goto("/cart");
    await expect(page.getByTestId("cart-items")).toBeVisible();

    await page.getByTestId("cart-checkout").click();

    // Land on the in-app checkout page, not on Stripe.
    await page.waitForURL(/\/checkout(\?|$)/);
    expect(new URL(page.url()).pathname).toBe("/checkout");
    await expect(page.getByTestId("page-checkout")).toBeVisible();
    expect(stripeHit).toBe(false);
    // No /api/checkout request should have been fired by the cart click.
    expect(calls).toHaveLength(0);

    // Address form fields are rendered.
    await expect(page.getByTestId("checkout-email")).toBeVisible();
    await expect(page.getByTestId("checkout-name")).toBeVisible();
    await expect(page.getByTestId("checkout-street1")).toBeVisible();
    await expect(page.getByTestId("checkout-city")).toBeVisible();
    await expect(page.getByTestId("checkout-state")).toBeVisible();
    await expect(page.getByTestId("checkout-zip")).toBeVisible();

    // Pay securely is disabled before a shipping rate is chosen.
    await expect(page.getByTestId("checkout-submit")).toBeDisabled();

    // No shipping-rate radios rendered yet.
    await expect(page.locator('input[name="shipping-rate"]')).toHaveCount(0);

    // Fill the address and calculate shipping so the rate picker renders.
    await page.getByTestId("checkout-email").fill("buyer@example.com");
    await page.getByTestId("checkout-name").fill("Test Buyer");
    await page.getByTestId("checkout-street1").fill("1 Main St");
    await page.getByTestId("checkout-city").fill("Town");
    await page.getByTestId("checkout-state").fill("CA");
    await page.getByTestId("checkout-zip").fill("90210");

    await page.getByTestId("checkout-calc-shipping").click();

    // Shipping-rate radios are now rendered and one is auto-selected.
    await expect(page.locator('input[name="shipping-rate"]')).toHaveCount(1);
    await expect(page.locator(`input[value="${RATE_ID}"]`)).toBeChecked();

    // Only after the rate is picked does Pay securely become enabled.
    await expect(page.getByTestId("checkout-submit")).toBeEnabled();
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

  test("returning to /checkout after a guest order pre-fills the saved address", async ({
    page,
  }) => {
    const calls: CheckoutCall[] = [];
    // We don't actually care about the post-checkout navigation here — only
    // that the address gets persisted before the redirect. Use about:blank
    // so we don't depend on the (separately-tested) Stripe-stub flow.
    const redirectUrl = "about:blank";
    await installCheckoutMocks(page, { redirectUrl, calls });
    // No signed-in user — keep /api/orders/me from leaking a server address
    // into the localStorage prefill we're trying to verify.
    await page.route("**/api/orders/me", async (route: Route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "unauthorized" }),
      });
    });
    await seedCartId(page);

    // 1) Place one order so the address gets persisted to localStorage.
    await page.goto("/checkout");
    await expect(page.getByTestId("page-checkout")).toBeVisible();
    // Fresh visit — no prior address yet, so the prefill banner/button must
    // be absent.
    await expect(
      page.getByTestId("checkout-address-prefilled"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("checkout-use-different-address"),
    ).toHaveCount(0);

    await page.getByTestId("checkout-email").fill("buyer@example.com");
    await page.getByTestId("checkout-name").fill("Test Buyer");
    await page.getByTestId("checkout-street1").fill("1 Main St");
    await page.getByTestId("checkout-city").fill("Town");
    await page.getByTestId("checkout-state").fill("CA");
    await page.getByTestId("checkout-zip").fill("90210");

    await page.getByTestId("checkout-calc-shipping").click();
    await expect(page.locator(`input[value="${RATE_ID}"]`)).toBeChecked();

    // Submit and wait for the /api/checkout call to complete; we don't care
    // where the redirect lands, only that the address landed in
    // localStorage before navigation.
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/checkout") &&
          r.request().method() === "POST",
      ),
      page.getByTestId("checkout-submit").click(),
    ]);
    await page.waitForFunction(
      () => window.localStorage.getItem("dose-saved-address") !== null,
    );

    const saved = await page.evaluate(() =>
      window.localStorage.getItem("dose-saved-address"),
    );
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved!)).toMatchObject({
      name: "Test Buyer",
      street1: "1 Main St",
      city: "Town",
      state: "CA",
      zip: "90210",
    });

    // 2) Return to /checkout with a fresh cart and assert the form is
    // pre-filled from localStorage.
    await page.goto("/checkout");
    await expect(page.getByTestId("page-checkout")).toBeVisible();

    await expect(
      page.getByTestId("checkout-address-prefilled"),
    ).toBeVisible();
    await expect(
      page.getByTestId("checkout-use-different-address"),
    ).toBeVisible();

    await expect(page.getByTestId("checkout-name")).toHaveValue("Test Buyer");
    await expect(page.getByTestId("checkout-street1")).toHaveValue(
      "1 Main St",
    );
    await expect(page.getByTestId("checkout-city")).toHaveValue("Town");
    await expect(page.getByTestId("checkout-state")).toHaveValue("CA");
    await expect(page.getByTestId("checkout-zip")).toHaveValue("90210");
    // Email is also remembered from the previous order.
    await expect(page.getByTestId("checkout-email")).toHaveValue(
      "buyer@example.com",
    );
  });

  test('"Use a different address" clears the form and hides the prefill affordances', async ({
    page,
  }) => {
    await installCheckoutMocks(page, {
      redirectUrl: "about:blank",
      calls: [],
    });
    await page.route("**/api/orders/me", async (route: Route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "unauthorized" }),
      });
    });

    // Seed a previously-saved address so the form starts pre-filled.
    await page.addInitScript(
      ([cartKey, cartValue, ageKey, ageValue, addrKey, addrValue]) => {
        try {
          window.localStorage.setItem(cartKey, cartValue);
          window.localStorage.setItem(ageKey, ageValue);
          window.localStorage.setItem("dose-cookies-decision", "accept");
          window.localStorage.setItem(addrKey, addrValue);
        } catch {
          // ignore
        }
      },
      [
        STORED_CART_KEY,
        CART_ID,
        AGE_CONFIRMED_KEY,
        "yes",
        "dose-saved-address",
        JSON.stringify({
          name: "Returning Buyer",
          street1: "42 Old Lane",
          street2: "",
          city: "Oldtown",
          state: "NY",
          zip: "10001",
          country: "US",
          phone: "",
        }),
      ],
    );

    await page.goto("/checkout");
    await expect(page.getByTestId("page-checkout")).toBeVisible();

    // Pre-fill banner + "use a different address" button are both visible.
    await expect(
      page.getByTestId("checkout-address-prefilled"),
    ).toBeVisible();
    const useDifferent = page.getByTestId("checkout-use-different-address");
    await expect(useDifferent).toBeVisible();

    await expect(page.getByTestId("checkout-name")).toHaveValue(
      "Returning Buyer",
    );
    await expect(page.getByTestId("checkout-zip")).toHaveValue("10001");

    await useDifferent.click();

    // Both affordances disappear once the form is cleared.
    await expect(
      page.getByTestId("checkout-address-prefilled"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("checkout-use-different-address"),
    ).toHaveCount(0);

    // Form fields are reset to empty.
    await expect(page.getByTestId("checkout-name")).toHaveValue("");
    await expect(page.getByTestId("checkout-street1")).toHaveValue("");
    await expect(page.getByTestId("checkout-city")).toHaveValue("");
    await expect(page.getByTestId("checkout-state")).toHaveValue("");
    await expect(page.getByTestId("checkout-zip")).toHaveValue("");
  });

  test("/checkout/success clears the stored cart id once the order loads", async ({
    page,
  }) => {
    await installCheckoutMocks(page, {
      redirectUrl: "about:blank",
      calls: [],
    });

    // Stub the order fetch so the success page can render its inline order
    // summary without depending on a real backend.
    await page.route(/\/api\/orders\/\d+(\?|$)/, async (route: Route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: ORDER_ID,
          status: "paid",
          email: "buyer@example.com",
          items: [
            {
              id: 1,
              productId: 101,
              productName: "Calm Tincture",
              productImage: null,
              quantity: 1,
              priceCents: 4_200,
            },
          ],
          subtotalCents: 4_200,
          shippingCents: 800,
          taxCents: 0,
          discountCents: 0,
          discountCode: null,
          totalCents: 5_000,
          currency: "usd",
          shippingAddress: {
            name: "Test Buyer",
            street1: "1 Main St",
            city: "Town",
            state: "CA",
            zip: "90210",
            country: "US",
          },
          trackingCode: null,
          labelUrl: null,
          createdAt: "2026-05-01T12:00:00.000Z",
        }),
      });
    });

    await seedCartId(page);

    await page.goto(`/checkout/success?orderId=${ORDER_ID}`);

    // The success page renders the inline order summary once the order
    // loads — that's the signal the cleanup effect has already run.
    await expect(page.getByTestId("checkout-success-page")).toBeVisible();
    await expect(page.getByTestId("success-order-summary")).toBeVisible();

    // Cleanup effect must have wiped the locally-stored cart id.
    await expect
      .poll(() =>
        page.evaluate(
          (k) => window.localStorage.getItem(k),
          STORED_CART_KEY,
        ),
      )
      .toBeNull();
  });
});
