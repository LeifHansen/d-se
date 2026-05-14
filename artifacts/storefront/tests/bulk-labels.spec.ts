import { test, expect, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// End-to-end coverage for the bulk "Buy cheapest label for selected" flow on
// the admin Orders page. Exercises:
//   - eligibility: only paid orders that have a shipping address and no
//     existing tracking code / label URL can be selected
//   - happy path: selecting multiple eligible orders, clicking the bulk
//     button, and watching them flip to "shipped" with tracking codes
//   - partial failure: when one order's rates / fulfill call fails, the
//     others still succeed and the failing order is named in the error panel
// ---------------------------------------------------------------------------

type ShippingAddress = {
  name: string;
  street1: string;
  street2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string | null;
};

type OrderItem = {
  id: number;
  productId: number;
  productName: string;
  productImage: string | null;
  quantity: number;
  priceCents: number;
};

type Order = {
  id: number;
  status: string;
  email: string | null;
  items: OrderItem[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  discountCode: string | null;
  totalCents: number;
  currency: string;
  shippingAddress: ShippingAddress | null;
  trackingCode: string | null;
  labelUrl: string | null;
  createdAt: string;
};

const ADDRESS: ShippingAddress = {
  name: "Casey Buyer",
  street1: "100 Test Lane",
  street2: null,
  city: "Portland",
  state: "OR",
  zip: "97201",
  country: "US",
  phone: null,
};

function makeItem(id: number, productId: number, name: string): OrderItem {
  return {
    id,
    productId,
    productName: name,
    productImage: null,
    quantity: 1,
    priceCents: 2500,
  };
}

function makeOrder(overrides: Partial<Order> & { id: number }): Order {
  return {
    status: "paid",
    email: `buyer${overrides.id}@example.com`,
    items: [makeItem(overrides.id * 10, 101, "Calm Tincture")],
    subtotalCents: 2500,
    shippingCents: 0,
    taxCents: 0,
    discountCents: 0,
    discountCode: null,
    totalCents: 2500,
    currency: "usd",
    shippingAddress: ADDRESS,
    trackingCode: null,
    labelUrl: null,
    createdAt: "2026-05-13T10:00:00.000Z",
    ...overrides,
  };
}

const RATES = [
  {
    id: "flat-express",
    carrier: "Express",
    service: "Express (2-3 days)",
    amountCents: 1595,
    currency: "usd",
    deliveryDays: 3,
  },
  {
    id: "flat-standard",
    carrier: "Standard",
    service: "Ground (5-7 days)",
    amountCents: 695,
    currency: "usd",
    deliveryDays: 6,
  },
];

class BulkApi {
  orders: Order[];
  ratesCalls: number[] = [];
  fulfillCalls: Array<{ orderId: number; body: Record<string, unknown> }> = [];
  failRatesFor = new Set<number>();
  failFulfillFor = new Set<number>();

  constructor(orders: Order[]) {
    this.orders = orders;
  }

  fulfill(orderId: number): Order | null {
    const o = this.orders.find((x) => x.id === orderId);
    if (!o) return null;
    o.status = "shipped";
    o.trackingCode = `TRK-${orderId}`;
    o.labelUrl = `https://labels.test/order-${orderId}.pdf`;
    return o;
  }
}

async function installBulkMocks(page: Page, api: BulkApi): Promise<void> {
  // Stub the print-window side effect so Playwright doesn't try to drive a
  // popup. Returning null also matches the production guard `if (!win) return`.
  await page.addInitScript(() => {
    (window as unknown as { __labelPrintCalls: number }).__labelPrintCalls = 0;
    const original = window.open;
    window.open = function patchedOpen(...args: unknown[]) {
      (window as unknown as { __labelPrintCalls: number })
        .__labelPrintCalls += 1;
      void original;
      return null;
    } as typeof window.open;
  });

  await page.route("**/api/admin/stats", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        totalOrders: api.orders.length,
        ordersToday: 0,
        revenueCentsToday: 0,
        ordersThisMonth: 0,
        revenueCentsThisMonth: 0,
        pendingFulfillment: 0,
        lowStock: 0,
        totalProducts: 0,
        webhookHealthy: true,
        webhookLastReceivedAt: null,
        recentOrders: [],
        marketing: {
          newsletterSubscribers: 0,
          ordersLast7Days: 0,
          revenueCentsLast7Days: 0,
          ga4Url: null,
        },
      }),
    });
  });

  // Specific routes registered AFTER the generic list route below so they
  // win — Playwright matches handlers in reverse-registration order.
  await page.route("**/api/admin/orders*", async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith("/api/admin/orders")) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(api.orders),
    });
  });

  await page.route(
    "**/api/admin/orders/*/shipping-rates",
    async (route: Route) => {
      const url = new URL(route.request().url());
      const m = /\/api\/admin\/orders\/(\d+)\/shipping-rates$/.exec(
        url.pathname,
      );
      if (!m) {
        await route.fallback();
        return;
      }
      const orderId = Number(m[1]);
      api.ratesCalls.push(orderId);
      if (api.failRatesFor.has(orderId)) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "EasyPost rates blew up" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ shipmentId: `shp_${orderId}`, rates: RATES }),
      });
    },
  );

  await page.route(
    "**/api/admin/orders/*/fulfill",
    async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      const url = new URL(route.request().url());
      const m = /\/api\/admin\/orders\/(\d+)\/fulfill$/.exec(url.pathname);
      if (!m) {
        await route.fallback();
        return;
      }
      const orderId = Number(m[1]);
      const body = JSON.parse(route.request().postData() ?? "{}");
      api.fulfillCalls.push({ orderId, body });
      if (api.failFulfillFor.has(orderId)) {
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ error: "Failed to buy shipping label" }),
        });
        return;
      }
      const updated = api.fulfill(orderId);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(updated),
      });
    },
  );
}

test.describe("admin orders — bulk buy cheapest label", () => {
  test("non-paid and already-shipped orders cannot be selected", async ({
    page,
  }) => {
    const api = new BulkApi([
      makeOrder({ id: 5001, status: "paid" }),
      makeOrder({ id: 5002, status: "pending" }),
      makeOrder({
        id: 5003,
        status: "shipped",
        trackingCode: "PRESHIPPED",
        labelUrl: "https://labels.test/old.pdf",
      }),
      makeOrder({ id: 5004, status: "paid", shippingAddress: null }),
    ]);
    await installBulkMocks(page, api);

    await page.goto("/admin/orders");

    // Only the first order is eligible: paid + has shipping address +
    // no tracking code / label URL.
    await expect(page.getByTestId("checkbox-order-5001")).toBeEnabled();
    await expect(page.getByTestId("checkbox-order-5002")).toBeDisabled();
    await expect(page.getByTestId("checkbox-order-5003")).toBeDisabled();
    await expect(page.getByTestId("checkbox-order-5004")).toBeDisabled();

    // The bulk button is disabled until at least one eligible order is checked.
    await expect(page.getByTestId("button-bulk-buy-labels")).toBeDisabled();

    await page.getByTestId("checkbox-order-5001").check();
    await expect(page.getByTestId("button-bulk-buy-labels")).toBeEnabled();
    await expect(page.getByTestId("bulk-actions-bar")).toContainText(
      "1 order selected",
    );

    // "Select all eligible" toggles only the eligible orders — checking it
    // must not select the pending / shipped / no-address rows.
    await page.getByTestId("checkbox-order-5001").uncheck();
    await page.getByTestId("checkbox-select-all-paid").check();
    await expect(page.getByTestId("checkbox-order-5001")).toBeChecked();
    await expect(page.getByTestId("checkbox-order-5002")).not.toBeChecked();
    await expect(page.getByTestId("checkbox-order-5003")).not.toBeChecked();
    await expect(page.getByTestId("checkbox-order-5004")).not.toBeChecked();
  });

  test("bulk-buys cheapest label for selected paid orders and flips them to shipped", async ({
    page,
  }) => {
    const api = new BulkApi([
      makeOrder({ id: 6001 }),
      makeOrder({ id: 6002 }),
      makeOrder({ id: 6003, status: "pending" }),
    ]);
    await installBulkMocks(page, api);

    await page.goto("/admin/orders");

    await page.getByTestId("checkbox-order-6001").check();
    await page.getByTestId("checkbox-order-6002").check();
    await expect(page.getByTestId("bulk-actions-bar")).toContainText(
      "2 orders selected",
    );

    await page.getByTestId("button-bulk-buy-labels").click();

    // While the bulk run is in flight the button text reports progress as
    // "Buying labels… done/total". Assert the final state (2/2) is reached.
    await expect(page.getByTestId("button-bulk-buy-labels")).toContainText(
      /Buying labels…\s*\d+\/2/,
    );

    // Wait for both fulfill calls to complete.
    await expect.poll(() => api.fulfillCalls.length).toBe(2);

    // Each order had its rates fetched and was fulfilled with the cheapest
    // rate (flat-standard at 695 cents) and the corresponding shipmentId.
    expect(new Set(api.ratesCalls)).toEqual(new Set([6001, 6002]));
    for (const call of api.fulfillCalls) {
      expect(call.body.shippingRateId).toBe("flat-standard");
      expect(call.body.shipmentId).toBe(`shp_${call.orderId}`);
    }

    // The orders flip to "shipped" and pick up tracking codes once the list
    // is invalidated and refetched.
    await expect(page.getByTestId("row-order-6001")).toContainText("shipped");
    await expect(page.getByTestId("row-order-6002")).toContainText("shipped");
    await expect(page.getByTestId("checkbox-order-6001")).toBeDisabled();
    await expect(page.getByTestId("checkbox-order-6002")).toBeDisabled();

    // No error panel for a fully-successful bulk run.
    await expect(page.getByTestId("text-bulk-errors")).toHaveCount(0);

    // Open one of the now-shipped orders to assert the tracking code stuck.
    await page.getByTestId("row-order-6001").click();
    await expect(page.getByTestId("text-tracking-code")).toContainText(
      "TRK-6001",
    );
    await page.getByTestId("button-close-drawer").click();

    // The print-label window was opened exactly once for the batch.
    const labelWindowOpens = await page.evaluate(
      () =>
        (window as unknown as { __labelPrintCalls?: number })
          .__labelPrintCalls ?? 0,
    );
    expect(labelWindowOpens).toBe(1);
  });

  test("partial failure: surfaces the failing order in the error panel and ships the rest", async ({
    page,
  }) => {
    const api = new BulkApi([
      makeOrder({ id: 7001 }),
      makeOrder({ id: 7002 }),
      makeOrder({ id: 7003 }),
    ]);
    // 7002's rates call fails; the other two should still succeed.
    api.failRatesFor.add(7002);
    await installBulkMocks(page, api);

    await page.goto("/admin/orders");

    await page.getByTestId("checkbox-select-all-paid").check();
    await expect(page.getByTestId("bulk-actions-bar")).toContainText(
      "3 orders selected",
    );

    await page.getByTestId("button-bulk-buy-labels").click();

    // Two successful fulfill calls (7001 and 7003); 7002 never makes it to
    // fulfill because rates failed.
    await expect.poll(() => api.fulfillCalls.length).toBe(2);
    expect(new Set(api.fulfillCalls.map((c) => c.orderId))).toEqual(
      new Set([7001, 7003]),
    );

    // The error panel calls out the failing order by id.
    const errors = page.getByTestId("text-bulk-errors");
    await expect(errors).toBeVisible();
    await expect(errors).toContainText("#7002");
    await expect(errors).not.toContainText("#7001");
    await expect(errors).not.toContainText("#7003");

    // Successful orders flipped; the failing one stayed paid and selectable.
    await expect(page.getByTestId("row-order-7001")).toContainText("shipped");
    await expect(page.getByTestId("row-order-7003")).toContainText("shipped");
    await expect(page.getByTestId("row-order-7002")).toContainText("paid");
    await expect(page.getByTestId("checkbox-order-7002")).toBeEnabled();
  });
});
