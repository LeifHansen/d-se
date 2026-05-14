import { test, expect, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// /checkout/success — tax-inclusive receipt rendering
//
// The Stripe webhook is responsible for writing taxCents on the order row,
// and the server-side webhook tax handling has its own unit coverage. This
// spec locks down the *storefront* half: once the order endpoint returns an
// order with non-zero taxCents, the thank-you page must render a Tax line
// and a Total that includes that tax. A future refactor of the receipt
// summary block (`<dl>` in checkout-success.tsx) cannot silently regress
// either of those.
// ---------------------------------------------------------------------------

const ORDER_ID = 7301;

type Order = {
  id: number;
  status: string;
  email: string | null;
  items: Array<{
    id: number;
    productId: number;
    productName: string;
    productImage: string | null;
    quantity: number;
    priceCents: number;
  }>;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  discountCode: string | null;
  totalCents: number;
  currency: string;
  shippingAddress?: {
    name: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  trackingCode: string | null;
  labelUrl: string | null;
  createdAt: string;
};

function makeTaxedOrder(): Order {
  // Subtotal + shipping + tax === total. Use round, distinct dollar amounts
  // so the asserted strings can't accidentally match each other.
  return {
    id: ORDER_ID,
    status: "paid",
    email: "shopper@example.com",
    items: [
      {
        id: 1,
        productId: 401,
        productName: "Calm Tincture",
        productImage: null,
        quantity: 1,
        priceCents: 5000,
      },
    ],
    subtotalCents: 5000,
    shippingCents: 500,
    taxCents: 450,
    discountCents: 0,
    discountCode: null,
    totalCents: 5950,
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
    createdAt: "2026-05-01T12:00:00.000Z",
  };
}

async function mockOrder(page: Page, order: Order): Promise<void> {
  // Match GET /api/orders/:id (digits only). Query string (cartId/sessionId)
  // is ignored — the success page passes whatever it has and we always
  // return the same fixture.
  await page.route(/\/api\/orders\/\d+(\?|$)/, async (route: Route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(order),
    });
  });
}

async function dismissOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      window.localStorage.setItem("dose-age-confirmed", "yes");
      window.localStorage.setItem("dose-cookies-decision", "accept");
    } catch {
      /* ignore */
    }
  });
}

test.describe("/checkout/success tax-inclusive receipt", () => {
  test("renders the Tax line and a tax-inclusive Total when taxCents > 0", async ({
    page,
  }) => {
    const order = makeTaxedOrder();
    await mockOrder(page, order);

    await page.goto(`/checkout/success?orderId=${ORDER_ID}`);
    await dismissOverlays(page);
    await page.reload();

    const summary = page.getByTestId("success-order-summary");
    await expect(summary).toBeVisible();

    // Subtotal + Shipping render as a baseline, so the assertions below are
    // meaningful (we're not asserting against an empty / loading view).
    await expect(summary).toContainText("Subtotal");
    await expect(summary).toContainText("$50.00");
    await expect(summary).toContainText("Shipping");
    await expect(summary).toContainText("$5.00");

    // The Tax row only renders when taxCents > 0 — assert both the label
    // and the formatted amount are present.
    await expect(summary).toContainText("Tax");
    await expect(summary).toContainText("$4.50");

    // Total must equal subtotal + shipping + tax (5000 + 500 + 450 = 5950).
    await expect(page.getByTestId("success-order-total")).toHaveText("$59.50");
  });

  test("omits the Tax line when taxCents is 0", async ({ page }) => {
    // Companion case so a future refactor that always renders "Tax: $0.00"
    // (and rolls it into the total) is caught.
    const order: Order = {
      ...makeTaxedOrder(),
      taxCents: 0,
      totalCents: 5500,
    };
    await mockOrder(page, order);

    await page.goto(`/checkout/success?orderId=${ORDER_ID}`);
    await dismissOverlays(page);
    await page.reload();

    const summary = page.getByTestId("success-order-summary");
    await expect(summary).toBeVisible();
    await expect(summary).not.toContainText(/^Tax$/m);
    await expect(page.getByTestId("success-order-total")).toHaveText("$55.00");
  });
});
