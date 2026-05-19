import { test, expect, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Order availability badges — /checkout/success and /orders/:id
//
// Task #170 added small "Out of stock" / "Unavailable" pills next to order
// items whose product has since been deleted/unpublished or whose variant has
// run out of stock. Both the just-placed thank-you page and the magic-link
// receipt page render those pills, but until now neither was covered by an
// e2e test, so a future refactor of either page could silently drop the
// badge and shoppers would be surprised again at Reorder time.
//
// This spec seeds an order whose three line items exercise all three states
// (one available, one out_of_stock, one unavailable) and asserts that:
//   * /checkout/success renders the `success-order-item-<id>-availability`
//     pill with the correct label only for the unavailable items.
//   * /orders/:id (loaded via the ?token= magic-link path) renders the
//     matching `order-item-<id>-availability` pill with the same label.
// ---------------------------------------------------------------------------

const ORDER_ID = 8170;
const TOKEN = "magic-link-token-8170";
const CART_ID = "cart-id-8170";

type Item = {
  id: number;
  productId: number;
  productName: string;
  productImage: string | null;
  quantity: number;
  priceCents: number;
  available: boolean;
  unavailableReason: "out_of_stock" | "deleted" | "unpublished" | null;
};

type Order = {
  id: number;
  status: string;
  email: string | null;
  items: Item[];
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

const AVAILABLE_ITEM: Item = {
  id: 1,
  productId: 901,
  productName: "Calm Tincture",
  productImage: null,
  quantity: 1,
  priceCents: 5000,
  available: true,
  unavailableReason: null,
};

const OUT_OF_STOCK_ITEM: Item = {
  id: 2,
  productId: 902,
  productName: "Focus Tincture",
  productImage: null,
  quantity: 2,
  priceCents: 4000,
  available: false,
  unavailableReason: "out_of_stock",
};

const UNAVAILABLE_ITEM: Item = {
  id: 3,
  productId: 903,
  productName: "Sunset Bitters",
  productImage: null,
  quantity: 1,
  priceCents: 3500,
  available: false,
  // Anything other than "out_of_stock" should render the generic
  // "Unavailable" copy — covers deleted/unpublished products.
  unavailableReason: "deleted",
};

function makeOrder(): Order {
  return {
    id: ORDER_ID,
    status: "paid",
    email: "shopper@example.com",
    items: [AVAILABLE_ITEM, OUT_OF_STOCK_ITEM, UNAVAILABLE_ITEM],
    subtotalCents: 16500,
    shippingCents: 500,
    taxCents: 0,
    discountCents: 0,
    discountCode: null,
    totalCents: 17000,
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

async function mockGetOrder(page: Page, order: Order): Promise<void> {
  // GET /api/orders/:id — used by the /checkout/success page.
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

async function mockLookupByToken(page: Page, order: Order): Promise<void> {
  // POST /api/orders/by-token — used by /orders/:id when ?token= is present.
  await page.route(/\/api\/orders\/by-token(\?|$)/, async (route: Route) => {
    if (route.request().method() !== "POST") {
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

async function dismissOverlays(page: Page, cartId?: string): Promise<void> {
  await page.evaluate((id) => {
    try {
      window.localStorage.setItem("dose-age-confirmed", "yes");
      window.localStorage.setItem("dose-cookies-decision", "accept");
      if (id) {
        window.localStorage.setItem("dose-cart-id", id);
      }
    } catch {
      /* ignore */
    }
  }, cartId ?? null);
}

test.describe("order availability badges", () => {
  test("/checkout/success renders the per-item availability pill", async ({
    page,
  }) => {
    const order = makeOrder();
    await mockGetOrder(page, order);

    // Seed the cartId receipt token first so the success page passes it
    // through as the guest-receipt proof on the very first render.
    await page.goto("/checkout/success");
    await dismissOverlays(page, CART_ID);
    await page.goto(`/checkout/success?orderId=${ORDER_ID}`);

    // The summary block must render so the assertions below are meaningful
    // (we're not asserting on a loading/empty view).
    await expect(page.getByTestId("success-order-items")).toBeVisible();

    // The available item must NOT have a pill.
    await expect(
      page.getByTestId(
        `success-order-item-${AVAILABLE_ITEM.id}-availability`,
      ),
    ).toHaveCount(0);

    // Out-of-stock and generic-unavailable pills both render with the
    // correct copy.
    const outBadge = page.getByTestId(
      `success-order-item-${OUT_OF_STOCK_ITEM.id}-availability`,
    );
    await expect(outBadge).toBeVisible();
    await expect(outBadge).toHaveText("Out of stock");

    const unavailBadge = page.getByTestId(
      `success-order-item-${UNAVAILABLE_ITEM.id}-availability`,
    );
    await expect(unavailBadge).toBeVisible();
    await expect(unavailBadge).toHaveText("Unavailable");
  });

  test("/orders/:id (magic-link) renders the per-item availability pill", async ({
    page,
  }) => {
    const order = makeOrder();
    await mockLookupByToken(page, order);

    await page.goto(`/orders/${ORDER_ID}?token=${TOKEN}`);
    await dismissOverlays(page);
    await page.reload();

    // Wait for the lookup to land and the summary to render.
    await expect(page.getByTestId("order-summary")).toBeVisible();

    await expect(
      page.getByTestId(`order-item-${AVAILABLE_ITEM.id}-availability`),
    ).toHaveCount(0);

    const outBadge = page.getByTestId(
      `order-item-${OUT_OF_STOCK_ITEM.id}-availability`,
    );
    await expect(outBadge).toBeVisible();
    await expect(outBadge).toHaveText("Out of stock");

    const unavailBadge = page.getByTestId(
      `order-item-${UNAVAILABLE_ITEM.id}-availability`,
    );
    await expect(unavailBadge).toBeVisible();
    await expect(unavailBadge).toHaveText("Unavailable");
  });
});
