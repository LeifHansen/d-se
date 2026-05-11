import { test, expect } from "@playwright/test";

test.describe("storefront smoke", () => {
  test("home page loads and renders key sections", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/.+/);
    // Hero section: brand name should be visible somewhere on the page.
    await expect(page.locator("body")).toContainText(/DŌSE|Dose|DOSE/i);
  });

  test("404 route renders not-found", async ({ page }) => {
    const response = await page.goto("/__definitely-not-a-page");
    // SPA returns 200 for unknown routes; component shows the 404 UI.
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator("body")).toContainText(/not.?found|404/i);
  });
});
