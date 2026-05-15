import { test, expect, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// /orders/:id?token=<bad> — expired/invalid link state.
//
// When the token in the URL fails to resolve (the API returns 404 to
// /api/orders/by-token), the order detail page must:
//   1. Render the resend form (not the generic lookup form), and
//   2. Submitting an email there must POST to /api/orders/:id/resend-link
//      and surface the success state.
//
// This spec stubs the API at the network boundary so the assertions cover
// the storefront wiring (the new resend hook → form → success copy) without
// depending on a live api-server. The route's contract — always 200, only
// actually emails on a match — is covered by the api-server vitest in
// artifacts/api-server/src/__tests__/orders.test.ts.
// ---------------------------------------------------------------------------

const ORDER_ID = 7777;

async function dismissOverlays(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("dose-age-confirmed", "yes");
      window.localStorage.setItem("dose-cookies-decision", "accept");
      // Make sure the order-detail effect doesn't auto-fire a lookup using
      // a stale guest email left over by another spec.
      window.localStorage.removeItem("dose-last-order-email");
    } catch {
      /* ignore */
    }
  });
}

async function stubExpiredToken(page: Page): Promise<void> {
  await page.route("**/api/orders/by-token", async (route: Route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Order not found" }),
    });
  });
}

test.describe("/orders/:id?token=<bad> — resend link form", () => {
  test("shows the resend form and surfaces the success state on submit", async ({
    page,
  }) => {
    await dismissOverlays(page);
    await stubExpiredToken(page);

    let resendCalls = 0;
    let lastBody: { email?: string } | null = null;
    await page.route(
      `**/api/orders/${ORDER_ID}/resend-link`,
      async (route: Route) => {
        resendCalls += 1;
        try {
          lastBody = JSON.parse(route.request().postData() ?? "{}");
        } catch {
          lastBody = null;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      },
    );

    await page.goto(`/orders/${ORDER_ID}?token=definitely-not-a-real-token`);

    // The token lookup fails → resend form is shown (the generic lookup form
    // is also rendered below it for users who'd rather verify via email).
    await expect(page.getByTestId("page-order-detail")).toBeVisible();
    await expect(page.getByTestId("order-resend-form")).toBeVisible();

    await page
      .getByTestId("order-resend-email")
      .fill("buyer@example.com");
    await page.getByTestId("order-resend-submit").click();

    await expect(page.getByTestId("order-resend-success")).toBeVisible();
    // Button flips to the "Link sent" terminal label and stays disabled so a
    // jittery user can't double-fire and burn through the throttle.
    await expect(page.getByTestId("order-resend-submit")).toContainText(
      /link sent/i,
    );
    await expect(page.getByTestId("order-resend-submit")).toBeDisabled();

    expect(resendCalls).toBe(1);
    expect(lastBody?.email).toBe("buyer@example.com");
  });
});
