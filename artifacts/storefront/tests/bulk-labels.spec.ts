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
  mergeCalls: Array<{ orderIds: number[] }> = [];
  failRatesFor = new Set<number>();
  // Orders for which the rates endpoint returns 200 but with an empty
  // rates array — this is the "no rates available" branch the storefront
  // surfaces inline as "No shipping rates available".
  noRatesFor = new Set<number>();
  failFulfillFor = new Set<number>();
  // Per-order override for the labelUrl returned by the fulfill stub. Used
  // to seed a mix of PNG and PDF label URLs so the merge-pdf endpoint
  // exercises both content branches.
  labelUrlByOrder = new Map<number, string>();

  constructor(orders: Order[]) {
    this.orders = orders;
  }

  fulfill(orderId: number): Order | null {
    const o = this.orders.find((x) => x.id === orderId);
    if (!o) return null;
    o.status = "shipped";
    o.trackingCode = `TRK-${orderId}`;
    o.labelUrl =
      this.labelUrlByOrder.get(orderId) ??
      `https://labels.test/order-${orderId}.pdf`;
    return o;
  }
}

async function installBulkMocks(page: Page, api: BulkApi): Promise<void> {
  // Stub the print-window side effect so Playwright doesn't try to drive a
  // popup. Returning null also matches the production guard `if (!win) return`.
  // Also intercept the merged-PDF download path: the admin Orders page
  // triggers a download by creating a blob URL and synthesizing an
  // <a download> click. Playwright's download event does NOT fire for
  // blob: URLs, so we instead capture the filename + the blob's bytes via
  // monkey-patched URL.createObjectURL + HTMLAnchorElement.click.
  await page.addInitScript(() => {
    const w = window as unknown as {
      __labelPrintCalls: number;
      __pdfDownloads: Array<{ filename: string; size: number; head: string }>;
      __blobByUrl: Map<string, Blob>;
    };
    w.__labelPrintCalls = 0;
    w.__pdfDownloads = [];
    w.__blobByUrl = new Map();
    const original = window.open;
    window.open = function patchedOpen(...args: unknown[]) {
      w.__labelPrintCalls += 1;
      void original;
      return null;
    } as typeof window.open;
    const origCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function patchedCreateObjectURL(obj: Blob | MediaSource) {
      const url = origCreate(obj as Blob);
      if (obj instanceof Blob) w.__blobByUrl.set(url, obj);
      return url;
    } as typeof URL.createObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function patchedClick(this: HTMLAnchorElement) {
      const href = this.getAttribute("href") ?? "";
      const filename = this.getAttribute("download") ?? "";
      if (filename && href.startsWith("blob:")) {
        const blob = w.__blobByUrl.get(href);
        if (blob) {
          void blob.arrayBuffer().then((buf) => {
            const bytes = new Uint8Array(buf);
            const head = String.fromCharCode(
              ...Array.from(bytes.slice(0, 8)),
            );
            w.__pdfDownloads.push({ filename, size: bytes.byteLength, head });
          });
          return;
        }
      }
      origClick.call(this);
    };
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
      if (api.noRatesFor.has(orderId)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ shipmentId: `shp_${orderId}`, rates: [] }),
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
    "**/api/admin/orders/labels/merge-pdf",
    async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      const body = JSON.parse(route.request().postData() ?? "{}") as {
        orderIds?: number[];
      };
      const orderIds = Array.isArray(body.orderIds) ? body.orderIds : [];
      api.mergeCalls.push({ orderIds });
      // Verify the storefront only asks the merge endpoint for orders
      // that actually came back with a label URL from fulfill — this is
      // the contract the server-side merger relies on.
      const targets = api.orders.filter(
        (o) => orderIds.includes(o.id) && Boolean(o.labelUrl),
      );
      // Minimal valid PDF document so the blob the storefront downloads
      // really is a PDF (asserted via the %PDF- magic header).
      const pdf = Buffer.from(
        "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n",
        "utf8",
      );
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: {
          "Content-Disposition": `attachment; filename="shipping-labels-${targets.length}.pdf"`,
          "Content-Length": String(pdf.byteLength),
        },
        body: pdf,
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

  test("downloads a single merged PDF for the whole batch (mixed PNG + PDF labels)", async ({
    page,
  }) => {
    // Three eligible paid orders. The fulfill stub seeds a deliberate mix
    // of label URL types so the server-side merge endpoint would have to
    // exercise both its PDF-passthrough branch (for .pdf labels) and its
    // image-embed branch (for .png labels). The frontend's contract is to
    // make exactly one merge-pdf call carrying every successfully-labeled
    // orderId and to download the response as a single attachment.
    const api = new BulkApi([
      makeOrder({ id: 8001 }),
      makeOrder({ id: 8002 }),
      makeOrder({ id: 8003 }),
    ]);
    api.labelUrlByOrder.set(8001, "https://labels.test/order-8001.pdf");
    api.labelUrlByOrder.set(8002, "https://labels.test/order-8002.png");
    api.labelUrlByOrder.set(8003, "https://labels.test/order-8003.pdf");
    await installBulkMocks(page, api);

    await page.goto("/admin/orders");

    await page.getByTestId("checkbox-select-all-paid").check();
    await expect(page.getByTestId("bulk-actions-bar")).toContainText(
      "3 orders selected",
    );

    await page.getByTestId("button-bulk-buy-labels").click();

    await expect.poll(() => api.fulfillCalls.length).toBe(3);
    await expect.poll(() => api.mergeCalls.length).toBe(1);

    // Exactly one merge call, carrying every fulfilled orderId regardless
    // of whether its label was a PNG or a PDF.
    expect(api.mergeCalls).toHaveLength(1);
    expect(new Set(api.mergeCalls[0].orderIds)).toEqual(
      new Set([8001, 8002, 8003]),
    );

    // The frontend turned the merged PDF response into a single download:
    // one filename matching the production pattern, real %PDF- bytes, and
    // no per-order downloads sneaking through.
    await expect
      .poll(
        async () =>
          await page.evaluate(
            () =>
              (
                window as unknown as {
                  __pdfDownloads?: Array<{ filename: string; head: string }>;
                }
              ).__pdfDownloads?.length ?? 0,
          ),
      )
      .toBe(1);

    const downloads = await page.evaluate(
      () =>
        (
          window as unknown as {
            __pdfDownloads: Array<{
              filename: string;
              size: number;
              head: string;
            }>;
          }
        ).__pdfDownloads,
    );
    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toMatch(
      /^shipping-labels-3-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
    expect(downloads[0].head.startsWith("%PDF-")).toBe(true);
    expect(downloads[0].size).toBeGreaterThan(0);

    // No bulk-error panel and no rates were re-requested for already-shipped
    // orders. All three orders flipped to shipped.
    await expect(page.getByTestId("text-bulk-errors")).toHaveCount(0);
    await expect(page.getByTestId("row-order-8001")).toContainText("shipped");
    await expect(page.getByTestId("row-order-8002")).toContainText("shipped");
    await expect(page.getByTestId("row-order-8003")).toContainText("shipped");
  });

  test("partial failure still merges + downloads labels for the orders that succeeded", async ({
    page,
  }) => {
    // 9002's rates call returns 200 with an empty rates array — i.e. the
    // "one order without rates" failure path the task explicitly calls
    // out. The merge endpoint must still be called for the two orders
    // that *did* get labels, and 9002 must show up in the inline bulk
    // errors panel with the storefront's "No shipping rates available"
    // message rather than a generic HTTP error.
    const api = new BulkApi([
      makeOrder({ id: 9001 }),
      makeOrder({ id: 9002 }),
      makeOrder({ id: 9003 }),
    ]);
    api.labelUrlByOrder.set(9001, "https://labels.test/order-9001.png");
    api.labelUrlByOrder.set(9003, "https://labels.test/order-9003.pdf");
    api.noRatesFor.add(9002);
    await installBulkMocks(page, api);

    await page.goto("/admin/orders");

    await page.getByTestId("checkbox-select-all-paid").check();
    await page.getByTestId("button-bulk-buy-labels").click();

    await expect.poll(() => api.mergeCalls.length).toBe(1);
    expect(new Set(api.mergeCalls[0].orderIds)).toEqual(new Set([9001, 9003]));
    expect(api.mergeCalls[0].orderIds).not.toContain(9002);

    // The PDF download still happened despite the partial failure.
    await expect
      .poll(
        async () =>
          await page.evaluate(
            () =>
              (
                window as unknown as {
                  __pdfDownloads?: Array<{ filename: string }>;
                }
              ).__pdfDownloads?.length ?? 0,
          ),
      )
      .toBe(1);
    const downloads = await page.evaluate(
      () =>
        (
          window as unknown as {
            __pdfDownloads: Array<{ filename: string }>;
          }
        ).__pdfDownloads,
    );
    expect(downloads[0].filename).toMatch(
      /^shipping-labels-2-\d{4}-\d{2}-\d{2}\.pdf$/,
    );

    // The error panel still calls out the failing order, and uses the
    // storefront's empty-rates message rather than a generic HTTP error.
    const errors = page.getByTestId("text-bulk-errors");
    await expect(errors).toBeVisible();
    await expect(errors).toContainText("#9002");
    await expect(errors).toContainText("No shipping rates available");
    await expect(errors).not.toContainText("#9001");
    await expect(errors).not.toContainText("#9003");
  });
});
