import { test, expect, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// /checkout/success — missing-receipt-token messaging
//
// When a guest opens the success page with an orderId but no cartId (the
// guest receipt token) and no Stripe session_id, the order endpoint replies
// 401. The page must distinguish that from a 404 ("no such order") and show
// the friendly "This link is missing its receipt token" copy instead of the
// generic error / not-found branches. This spec locks that down so a future
// refactor can't quietly bring back the confusing "HTTP 401 Unauthorized"
// message.
// ---------------------------------------------------------------------------

const ORDER_ID = 7401;

async function dismissOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      window.localStorage.setItem("dose-age-confirmed", "yes");
      window.localStorage.setItem("dose-cookies-decision", "accept");
      // Belt-and-suspenders: ensure no leftover guest cart id sneaks in as
      // a receipt token on reload.
      window.localStorage.removeItem("dose-cart-id");
    } catch {
      /* ignore */
    }
  });
}

async function mockOrderStatus(
  page: Page,
  status: number,
  bodyError: string,
): Promise<void> {
  await page.route(/\/api\/orders\/\d+(\?|$)/, async (route: Route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ error: bodyError }),
    });
  });
}

test.describe("/checkout/success missing receipt token", () => {
  test("shows the receipt-missing message when the order endpoint returns 401", async ({
    page,
  }) => {
    // The server returns 401 when a guest hits /api/orders/:id without a
    // valid cartId/sessionId proving ownership.
    await mockOrderStatus(page, 401, "Unauthorized");

    await page.goto(`/checkout/success?orderId=${ORDER_ID}`);
    await dismissOverlays(page);
    await page.reload();

    const missing = page.getByTestId("success-order-receipt-missing");
    await expect(missing).toBeVisible();
    await expect(missing).toContainText("missing its receipt token");
    await expect(missing).toContainText("confirmation email");

    // The other error branches must NOT render — this is the whole point of
    // distinguishing 401 from 404 / generic failures.
    await expect(page.getByTestId("success-order-unavailable")).toHaveCount(0);
    await expect(page.getByTestId("success-order-error")).toHaveCount(0);
    await expect(page.getByTestId("success-order-summary")).toHaveCount(0);
  });

  test("still shows the not-found message when the order endpoint returns 404", async ({
    page,
  }) => {
    // Companion case: a 404 must continue to render the "couldn't load this
    // order" branch, not the receipt-missing copy. Guards against a refactor
    // that collapses both error states into one.
    await mockOrderStatus(page, 404, "Not Found");

    await page.goto(`/checkout/success?orderId=${ORDER_ID}`);
    await dismissOverlays(page);
    await page.reload();

    await expect(
      page.getByTestId("success-order-unavailable"),
    ).toBeVisible();
    await expect(
      page.getByTestId("success-order-receipt-missing"),
    ).toHaveCount(0);
  });
});
