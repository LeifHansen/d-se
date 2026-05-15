import { test, expect, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Cart auto-trim shortcuts
//
// Covers the "Update to N" / "Remove" recovery affordances that appear on
// oversold or out-of-stock cart lines in two surfaces:
//   1. The header CartDrawer
//   2. The /checkout page's order summary
//
// In each case the shortcut should mutate the cart server-side and the
// stale-stock warning should clear on its own.
// ---------------------------------------------------------------------------

const STORED_CART_KEY = "dose-cart-id";
const AGE_CONFIRMED_KEY = "dose-age-confirmed";
const CART_ID = "cart_e2e_shortcuts";

type CartItem = {
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
    lowStockThreshold?: number;
  };
};

type CartFixture = {
  id: string;
  items: CartItem[];
  subtotalCents: number;
  currency: string;
  discountCode: string | null;
  discountCents: number;
  totalCents: number;
};

function recompute(cart: CartFixture): CartFixture {
  const subtotal = cart.items.reduce(
    (sum, it) => sum + it.product.priceCents * it.quantity,
    0,
  );
  for (const it of cart.items) {
    it.lineTotalCents = it.product.priceCents * it.quantity;
  }
  cart.subtotalCents = subtotal;
  cart.totalCents = subtotal - cart.discountCents;
  return cart;
}

function makeStaleCart(): CartFixture {
  // Calm Tincture is oversold (asked 5, only 2 left).
  // Bright Elixir is out of stock entirely.
  const cart: CartFixture = {
    id: CART_ID,
    items: [
      {
        id: 1,
        productId: 101,
        quantity: 5,
        lineTotalCents: 0,
        product: {
          id: 101,
          slug: "calm-tincture",
          name: "Calm Tincture",
          priceCents: 4_200,
          currency: "usd",
          images: [],
          inventory: 2,
        },
      },
      {
        id: 2,
        productId: 102,
        quantity: 1,
        lineTotalCents: 0,
        product: {
          id: 102,
          slug: "bright-elixir",
          name: "Bright Elixir",
          priceCents: 3_600,
          currency: "usd",
          images: [],
          inventory: 0,
        },
      },
    ],
    subtotalCents: 0,
    currency: "usd",
    discountCode: null,
    discountCents: 0,
    totalCents: 0,
  };
  return recompute(cart);
}

type ServerState = { cart: CartFixture };

async function installCartMocks(
  page: Page,
  state: ServerState,
): Promise<void> {
  // GET /api/cart — return current state.
  await page.route("**/api/cart*", async (route: Route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(state.cart),
    });
  });

  // PATCH /api/cart/items/:id — update quantity.
  // DELETE /api/cart/items/:id — remove the line.
  await page.route(/\/api\/cart\/items\/(\d+).*/, async (route: Route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const idMatch = url.pathname.match(/\/api\/cart\/items\/(\d+)/);
    const itemId = idMatch ? Number(idMatch[1]) : NaN;

    if (method === "PATCH") {
      const body = JSON.parse(route.request().postData() ?? "{}") as {
        quantity?: number;
      };
      const item = state.cart.items.find((it) => it.id === itemId);
      if (item && typeof body.quantity === "number") {
        item.quantity = body.quantity;
      }
      recompute(state.cart);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.cart),
      });
      return;
    }

    if (method === "DELETE") {
      state.cart.items = state.cart.items.filter((it) => it.id !== itemId);
      recompute(state.cart);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.cart),
      });
      return;
    }

    await route.fallback();
  });

  // /checkout fetches shipping rates from address; not needed for the
  // shortcut assertions, but stub it so unrelated requests don't error.
  await page.route("**/api/shipping/rates", async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Avoid leaking a server-side address into the prefill behavior on
  // /checkout — irrelevant to this test.
  await page.route("**/api/orders/me", async (route: Route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "unauthorized" }),
    });
  });
}

async function seedCartId(page: Page): Promise<void> {
  await page.addInitScript(
    ([cartKey, cartValue, ageKey, ageValue]) => {
      try {
        window.localStorage.setItem(cartKey, cartValue);
        window.localStorage.setItem(ageKey, ageValue);
        window.localStorage.setItem("dose-cookies-decision", "accept");
      } catch {
        // ignore
      }
    },
    [STORED_CART_KEY, CART_ID, AGE_CONFIRMED_KEY, "yes"],
  );
}

test.describe("cart auto-trim shortcuts", () => {
  test('CartDrawer "Update to N" trims an oversold line and clears the warning', async ({
    page,
  }) => {
    const state: ServerState = { cart: makeStaleCart() };
    await installCartMocks(page, state);
    await seedCartId(page);

    await page.goto("/");
    await page.getByTestId("header-cart").click();
    await expect(page.getByTestId("cart-drawer-items")).toBeVisible();

    // Oversold warning + the "Update to 2" shortcut are both showing.
    const stockBadge = page.getByTestId("cart-drawer-stock-1");
    await expect(stockBadge).toBeVisible();
    await expect(stockBadge).toHaveText(/Only 2 left/i);

    const updateBtn = page.getByTestId("cart-drawer-update-to-1");
    await expect(updateBtn).toHaveText(/Update to 2/i);
    await updateBtn.click();

    // Quantity is trimmed to inventory and the warning disappears.
    await expect(page.getByTestId("cart-drawer-stock-1")).toHaveCount(0);
    await expect(
      page.getByTestId("cart-drawer-update-to-1"),
    ).toHaveCount(0);
    expect(state.cart.items.find((it) => it.id === 1)?.quantity).toBe(2);
  });

  test('CartDrawer "Remove" drops an out-of-stock line from the bag', async ({
    page,
  }) => {
    const state: ServerState = { cart: makeStaleCart() };
    await installCartMocks(page, state);
    await seedCartId(page);

    await page.goto("/");
    await page.getByTestId("header-cart").click();
    await expect(page.getByTestId("cart-drawer-items")).toBeVisible();

    // Out-of-stock badge + dedicated "Remove" affordance render on item 2.
    await expect(page.getByTestId("cart-drawer-stock-2")).toHaveText(
      /Out of stock/i,
    );
    await page.getByTestId("cart-drawer-remove-oos-2").click();

    // Line 2 disappears and item 1 (oversold) is still in the bag.
    await expect(page.getByTestId("cart-drawer-item-2")).toHaveCount(0);
    await expect(page.getByTestId("cart-drawer-item-1")).toBeVisible();
    expect(state.cart.items.map((it) => it.id)).toEqual([1]);
  });

  test('/checkout summary "Update to N" trims an oversold line and clears the warning', async ({
    page,
  }) => {
    const state: ServerState = { cart: makeStaleCart() };
    await installCartMocks(page, state);
    await seedCartId(page);

    await page.goto("/checkout");
    await expect(page.getByTestId("page-checkout")).toBeVisible();
    await expect(page.getByTestId("checkout-line-1")).toBeVisible();

    // The summary shows "Only 2 left — please reduce quantity" and the
    // submit button is disabled with the stock warning visible.
    await expect(page.getByTestId("checkout-stock-1")).toHaveText(
      /Only 2 left/i,
    );
    await expect(page.getByTestId("checkout-submit")).toBeDisabled();
    await expect(page.getByTestId("checkout-stock-warning")).toBeVisible();

    await page.getByTestId("checkout-update-to-1").click();

    // Warning + shortcut clear once the quantity is trimmed.
    await expect(page.getByTestId("checkout-stock-1")).toHaveCount(0);
    await expect(page.getByTestId("checkout-update-to-1")).toHaveCount(0);
    expect(state.cart.items.find((it) => it.id === 1)?.quantity).toBe(2);
  });

  test('/checkout summary "Remove" drops an out-of-stock line', async ({
    page,
  }) => {
    const state: ServerState = { cart: makeStaleCart() };
    await installCartMocks(page, state);
    await seedCartId(page);

    await page.goto("/checkout");
    await expect(page.getByTestId("page-checkout")).toBeVisible();
    await expect(page.getByTestId("checkout-line-2")).toBeVisible();
    await expect(page.getByTestId("checkout-stock-2")).toHaveText(
      /Out of stock/i,
    );

    await page.getByTestId("checkout-remove-oos-2").click();

    await expect(page.getByTestId("checkout-line-2")).toHaveCount(0);
    await expect(page.getByTestId("checkout-line-1")).toBeVisible();
    expect(state.cart.items.map((it) => it.id)).toEqual([1]);
  });
});
