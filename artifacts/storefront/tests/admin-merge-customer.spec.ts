import { test, expect, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// End-to-end coverage for the "Merge into customer" dialog on the per-email
// orders page (artifacts/storefront/src/pages/admin/OrdersByEmail.tsx). The
// dialog is the only customer-creation entry point that lives outside of the
// API tests, so this spec verifies:
//   - the per-email page renders without the "Merged into customer #N" badge
//     while the underlying orders still have a null customerId,
//   - clicking "Merge into customer" opens the dialog,
//   - the "Create & merge" form posts to /api/admin/customers and then to
//     /api/admin/orders/merge-into-customer with the normalized email,
//   - the dialog closes and the badge appears once the orders refetch with
//     the new customerId attached.
// ---------------------------------------------------------------------------

type Order = {
  id: number;
  status: string;
  email: string | null;
  customerId: number | null;
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
  shippingAddress: null;
  trackingCode: string | null;
  labelUrl: string | null;
  createdAt: string;
};

function makeOrder(id: number, email: string): Order {
  return {
    id,
    status: "paid",
    email,
    customerId: null,
    items: [
      {
        id: id * 10,
        productId: 401,
        productName: "Calm Tincture",
        productImage: null,
        quantity: 1,
        priceCents: 2500,
      },
    ],
    subtotalCents: 2500,
    shippingCents: 0,
    taxCents: 0,
    discountCents: 0,
    discountCode: null,
    totalCents: 2500,
    currency: "usd",
    shippingAddress: null,
    trackingCode: null,
    labelUrl: null,
    createdAt: "2026-05-13T10:00:00.000Z",
  };
}

async function installAdminBaseMocks(page: Page): Promise<void> {
  await page.route("**/api/admin/stats**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        totalOrders: 0,
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
          rangeDays: 7,
          ordersInRange: 0,
          revenueCentsInRange: 0,
          ga4Url: null,
          subscribersDaily: [],
          ordersDaily: [],
          revenueCentsDaily: [],
        },
      }),
    });
  });
}

test.describe("admin per-email orders — Merge into customer dialog", () => {
  test("creates a new customer from the dialog and shows the merged badge", async ({
    page,
  }) => {
    const email = "merge.me@example.com";
    const orders = [makeOrder(9301, email), makeOrder(9302, email)];

    // Mock customer storage. Starts empty so the dialog shows "No customers
    // yet. Create one below." and forces the create-and-merge path.
    type Customer = {
      id: number;
      email: string;
      name: string | null;
      orderCount: number;
      createdAt: string;
    };
    const customers: Customer[] = [];
    let nextCustomerId = 5500;

    const createCustomerBodies: Array<Record<string, unknown>> = [];
    const mergeBodies: Array<Record<string, unknown>> = [];

    await installAdminBaseMocks(page);

    // GET /api/admin/orders/by-email/:email — returns the current snapshot
    // so that re-fetches after the merge see the updated customerId.
    await page.route(
      "**/api/admin/orders/by-email/**",
      async (route: Route) => {
        const url = new URL(route.request().url());
        const match = /\/api\/admin\/orders\/by-email\/([^/?#]+)/.exec(
          url.pathname,
        );
        const wanted = match
          ? decodeURIComponent(match[1]).trim().toLowerCase()
          : "";
        const matched = orders.filter(
          (o) => (o.email ?? "").trim().toLowerCase() === wanted,
        );
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ email: wanted, orders: matched }),
        });
      },
    );

    // GET/POST /api/admin/customers — list returns current customers; create
    // appends a new one and returns it (mirroring the api-server route).
    await page.route("**/api/admin/customers**", async (route: Route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(customers),
        });
        return;
      }
      if (method === "POST") {
        const body = JSON.parse(route.request().postData() ?? "{}") as {
          email?: string;
          name?: string | null;
        };
        createCustomerBodies.push(body);
        const created: Customer = {
          id: nextCustomerId++,
          email: (body.email ?? "").trim().toLowerCase(),
          name: body.name ? String(body.name).trim() || null : null,
          orderCount: 0,
          createdAt: "2026-05-15T12:00:00.000Z",
        };
        customers.push(created);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(created),
        });
        return;
      }
      await route.fallback();
    });

    // POST /api/admin/orders/merge-into-customer — flips every order whose
    // email matches and returns the merged count, mirroring the server.
    await page.route(
      "**/api/admin/orders/merge-into-customer",
      async (route: Route) => {
        if (route.request().method() !== "POST") {
          await route.fallback();
          return;
        }
        const body = JSON.parse(route.request().postData() ?? "{}") as {
          email?: string;
          customerId?: number;
        };
        mergeBodies.push(body);
        const wantedEmail = (body.email ?? "").trim().toLowerCase();
        const customerId = body.customerId ?? null;
        const customer = customers.find((c) => c.id === customerId);
        if (!customer) {
          await route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ error: "Customer not found" }),
          });
          return;
        }
        let mergedCount = 0;
        for (const o of orders) {
          if ((o.email ?? "").trim().toLowerCase() === wantedEmail) {
            o.customerId = customer.id;
            mergedCount += 1;
          }
        }
        customer.orderCount += mergedCount;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ customer, mergedCount }),
        });
      },
    );

    await page.goto(`/admin/orders/by-email/${encodeURIComponent(email)}`);

    // Page renders both orders and there is no merged badge yet because the
    // orders still have customerId: null.
    await expect(page.getByTestId("text-customer-email")).toContainText(email);
    await expect(page.getByTestId("row-order-9301")).toBeVisible();
    await expect(page.getByTestId("row-order-9302")).toBeVisible();
    await expect(page.getByTestId("badge-merged-customer")).toHaveCount(0);

    // Open the merge dialog.
    await page.getByTestId("button-open-merge").click();
    await expect(page.getByTestId("dialog-merge-customer")).toBeVisible();
    // No customers exist yet, so the empty-state message is shown.
    await expect(page.getByTestId("text-no-customers")).toBeVisible();

    // Fill in an optional name and submit Create & merge.
    await page.getByTestId("input-new-customer-name").fill("Casey Buyer");
    await page.getByTestId("button-create-and-merge").click();

    // Dialog closes, badge appears with the new customer id, both API calls
    // were made with the normalized email.
    await expect(page.getByTestId("dialog-merge-customer")).toHaveCount(0);
    const badge = page.getByTestId("badge-merged-customer");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(`Merged into customer #${customers[0].id}`);

    expect(createCustomerBodies).toHaveLength(1);
    expect(createCustomerBodies[0]).toMatchObject({
      email,
      name: "Casey Buyer",
    });
    expect(mergeBodies).toHaveLength(1);
    expect(mergeBodies[0]).toMatchObject({
      email,
      customerId: customers[0].id,
    });

    // The orders themselves now carry the new customerId (the badge is
    // derived from this), so the merge actually flowed through to the data.
    expect(orders.every((o) => o.customerId === customers[0].id)).toBe(true);
  });
});
