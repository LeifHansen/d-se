import { test, expect, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Coverage for the "Order link" panel on the admin order detail drawer.
// Exercises:
//   - GET  /api/admin/orders/:id/order-link   (panel render)
//   - POST /api/orders/by-token               (lookupTokenLastUsedAt update)
//   - DELETE /api/admin/orders/:id/order-link (Rotate / revoke button)
// All three endpoints share the same mock state so the test can verify the
// panel reflects the by-token call and that the previously-emailed token is
// rejected once the link has been revoked.
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
  shippingAddress: ShippingAddress | null;
  trackingCode: string | null;
  labelUrl: string | null;
  createdAt: string;
};

const ORDER: Order = {
  id: 8201,
  status: "paid",
  email: "linked@example.com",
  items: [
    {
      id: 1,
      productId: 401,
      productName: "Calm Tincture",
      productImage: null,
      quantity: 1,
      priceCents: 4500,
    },
  ],
  subtotalCents: 4500,
  shippingCents: 0,
  taxCents: 0,
  discountCents: 0,
  discountCode: null,
  totalCents: 4500,
  currency: "usd",
  shippingAddress: {
    name: "Casey Buyer",
    street1: "100 Test Lane",
    street2: null,
    city: "Portland",
    state: "OR",
    zip: "97201",
    country: "US",
    phone: null,
  },
  trackingCode: null,
  labelUrl: null,
  createdAt: "2026-05-13T10:00:00.000Z",
};

const ORIGINAL_TOKEN = "tkn_original_emailed_to_customer_xyz";
const ISSUED_AT = "2026-05-10T09:00:00.000Z";

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

test.describe("admin order detail — Order link panel", () => {
  test("shows issued time, records by-token use, then revokes the emailed token", async ({
    page,
  }) => {
    // Shared mock state for the order link, mirroring the api-server columns
    // (lookupToken / lookupTokenIssuedAt / lookupTokenLastUsedAt).
    const link = {
      token: ORIGINAL_TOKEN as string | null,
      issuedAt: ISSUED_AT as string | null,
      lastUsedAt: null as string | null,
    };

    await installAdminBaseMocks(page);

    await page.route("**/api/admin/orders*", async (route: Route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith("/api/admin/orders")) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([ORDER]),
      });
    });

    // Panel GET: returns the current state.
    await page.route(
      "**/api/admin/orders/*/order-link",
      async (route: Route) => {
        const method = route.request().method();
        if (method === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              orderId: ORDER.id,
              active: Boolean(link.token),
              issuedAt: link.issuedAt,
              lastUsedAt: link.lastUsedAt,
            }),
          });
          return;
        }
        if (method === "DELETE") {
          // Mirror the server: clear the token but keep the audit timestamps.
          link.token = null;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              orderId: ORDER.id,
              active: false,
              issuedAt: link.issuedAt,
              lastUsedAt: link.lastUsedAt,
            }),
          });
          return;
        }
        await route.fallback();
      },
    );

    // POST /api/orders/by-token: matches only the currently-active token; on
    // success it bumps lastUsedAt, mirroring the api-server route. Revoked
    // (cleared) tokens are rejected.
    await page.route("**/api/orders/by-token", async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      const body = JSON.parse(route.request().postData() ?? "{}") as {
        token?: string;
      };
      if (!link.token || body.token !== link.token) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "Order not found" }),
        });
        return;
      }
      link.lastUsedAt = new Date().toISOString();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ORDER),
      });
    });

    // ---- Open the drawer and assert the panel renders with the issued time.
    await page.goto("/admin/orders");

    await page
      .getByTestId(`row-order-${ORDER.id}`)
      .getByText(`#${ORDER.id}`)
      .click();
    await expect(page.getByTestId("order-detail-drawer")).toBeVisible();

    const panel = page.getByTestId("panel-order-link");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("text-order-link-status")).toHaveText(
      "Active",
    );
    // Issued cell shows a real timestamp (formatted, not the "—" placeholder).
    const issuedCell = page.getByTestId("text-order-link-issued-at");
    await expect(issuedCell).toBeVisible();
    await expect(issuedCell).not.toHaveText("—");
    // Nobody has opened the link yet.
    await expect(page.getByTestId("text-order-link-last-used-at")).toHaveText(
      "Never",
    );

    // ---- Customer opens the emailed link → /orders/by-token must succeed
    // and the mock state must record lookupTokenLastUsedAt.
    // Use in-browser fetch so the request flows through page.route handlers.
    const byTokenOkStatus = await page.evaluate(async (token) => {
      const r = await fetch("/api/orders/by-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      return r.status;
    }, ORIGINAL_TOKEN);
    expect(byTokenOkStatus).toBe(200);
    expect(link.lastUsedAt).not.toBeNull();

    // Re-open the drawer so the panel refetches and the "Last opened" cell
    // shows the new timestamp instead of "Never".
    await page.getByTestId("button-close-drawer").click();
    await expect(page.getByTestId("order-detail-drawer")).toHaveCount(0);
    await page
      .getByTestId(`row-order-${ORDER.id}`)
      .getByText(`#${ORDER.id}`)
      .click();
    await expect(page.getByTestId("order-detail-drawer")).toBeVisible();
    await expect(
      page.getByTestId("text-order-link-last-used-at"),
    ).not.toHaveText("Never");

    // ---- Rotate / revoke flips the panel and rejects the original token.
    await page.getByTestId("button-rotate-order-link").click();
    await page.getByTestId("button-confirm-rotate-order-link").click();

    await expect(page.getByTestId("text-order-link-status")).toHaveText(
      "Revoked",
    );
    // The Rotate button is gone once the link is inactive.
    await expect(page.getByTestId("button-rotate-order-link")).toHaveCount(0);

    const byTokenAfterRevokeStatus = await page.evaluate(async (token) => {
      const r = await fetch("/api/orders/by-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      return r.status;
    }, ORIGINAL_TOKEN);
    expect(byTokenAfterRevokeStatus).toBe(404);
  });
});
