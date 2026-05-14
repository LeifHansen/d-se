import { test, expect, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Shared fixture types (mirroring the generated API schemas just enough to
// produce realistic mock responses for each admin section page).
// ---------------------------------------------------------------------------

type DiscountCode = {
  id: number;
  code: string;
  type: "percent" | "fixed";
  value: number;
  minSubtotalCents: number | null;
  maxRedemptions: number | null;
  redemptionsCount: number;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
};

type Review = {
  id: number;
  productId: number;
  productSlug: string | null;
  productName: string | null;
  rating: number;
  title: string;
  body: string;
  status: "pending" | "approved" | "rejected";
  verifiedPurchase: boolean;
  authorName: string | null;
  createdAt: string;
};

type AbandonedCart = {
  id: number;
  cartId: string;
  email: string;
  userId: string | null;
  subtotalCents: number;
  itemCount: number;
  firstReminderSentAt: string | null;
  secondReminderSentAt: string | null;
  recoveredAt: string | null;
  recoveredOrderId: string | null;
  createdAt: string;
};

type NewsletterSubscriber = {
  id: number;
  email: string;
  source: string | null;
  status: "active" | "unsubscribed";
  createdAt: string;
  unsubscribedAt: string | null;
  resendContactId: string | null;
};

type TaxSummary = {
  taxCollectedCents: number;
  taxableOrders: number;
  currency: string;
  stripeTaxEnabled: boolean;
  warning: string | null;
};

// ---------------------------------------------------------------------------
// Discounts
// ---------------------------------------------------------------------------

test.describe("admin discounts", () => {
  test("creates a new percent discount via the dialog", async ({ page }) => {
    const codes: DiscountCode[] = [
      {
        id: 1,
        code: "WELCOME10",
        type: "percent",
        value: 10,
        minSubtotalCents: null,
        maxRedemptions: null,
        redemptionsCount: 3,
        expiresAt: null,
        active: true,
        createdAt: "2026-05-01T12:00:00.000Z",
      },
    ];
    const createdPayloads: unknown[] = [];

    await page.route("**/api/admin/discount-codes", async (route: Route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(codes),
        });
        return;
      }
      if (method === "POST") {
        const body = JSON.parse(route.request().postData() ?? "{}");
        createdPayloads.push(body);
        const created: DiscountCode = {
          id: 999,
          code: body.code,
          type: body.type,
          value: body.value,
          minSubtotalCents: body.minSubtotalCents ?? null,
          maxRedemptions: body.maxRedemptions ?? null,
          redemptionsCount: 0,
          expiresAt: body.expiresAt ?? null,
          active: body.active ?? true,
          createdAt: "2026-05-14T12:00:00.000Z",
        };
        codes.push(created);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(created),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto("/admin/discounts");

    await expect(page.getByTestId("discount-row-1")).toBeVisible();

    await page.getByTestId("discount-new").click();
    await page.getByTestId("discount-code-input").fill("save15");
    await page.locator("#d-value").fill("15");
    await page.getByTestId("discount-save").click();

    await expect.poll(() => createdPayloads.length).toBeGreaterThan(0);
    const payload = createdPayloads.at(-1) as {
      code: string;
      type: string;
      value: number;
      active: boolean;
    };
    expect(payload.code).toBe("SAVE15");
    expect(payload.type).toBe("percent");
    expect(payload.value).toBe(15);
    expect(payload.active).toBe(true);

    await expect(page.getByTestId("discount-row-999")).toBeVisible();
  });

  test("disables an existing discount via the active toggle", async ({
    page,
  }) => {
    const codes: DiscountCode[] = [
      {
        id: 42,
        code: "FALLSALE",
        type: "fixed",
        value: 500,
        minSubtotalCents: 2000,
        maxRedemptions: 100,
        redemptionsCount: 4,
        expiresAt: "2026-12-31T23:59:59.000Z",
        active: true,
        createdAt: "2026-05-01T12:00:00.000Z",
      },
    ];
    const patches: Array<{ id: number; data: { active?: boolean } }> = [];

    await page.route("**/api/admin/discount-codes", async (route: Route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(codes),
      });
    });

    await page.route(
      "**/api/admin/discount-codes/*",
      async (route: Route) => {
        if (route.request().method() !== "PATCH") {
          await route.fallback();
          return;
        }
        const url = new URL(route.request().url());
        const id = Number(url.pathname.split("/").pop());
        const body = JSON.parse(route.request().postData() ?? "{}");
        patches.push({ id, data: body });
        const target = codes.find((c) => c.id === id);
        if (target && typeof body.active === "boolean") {
          target.active = body.active;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(target ?? { id, ...body }),
        });
      },
    );

    await page.goto("/admin/discounts");

    const row = page.getByTestId("discount-row-42");
    await expect(row).toBeVisible();
    await row.getByRole("switch").click();

    await expect.poll(() => patches.length).toBeGreaterThan(0);
    const last = patches.at(-1)!;
    expect(last.id).toBe(42);
    expect(last.data.active).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

test.describe("admin reviews", () => {
  test("approves a pending review", async ({ page }) => {
    const reviews: Review[] = [
      {
        id: 7,
        productId: 101,
        productSlug: "calm-tincture",
        productName: "Calm Tincture",
        rating: 5,
        title: "Love it",
        body: "Best thing I tried this year.",
        status: "pending",
        verifiedPurchase: true,
        authorName: "Jane",
        createdAt: "2026-05-12T10:00:00.000Z",
      },
    ];
    const patches: Array<{ id: number; status: string }> = [];

    await page.route("**/api/admin/reviews/*", async (route: Route) => {
      const url = new URL(route.request().url());
      const idMatch = /\/api\/admin\/reviews\/(\d+)$/.exec(url.pathname);
      const method = route.request().method();
      if (idMatch && method === "PATCH") {
        const id = Number(idMatch[1]);
        const body = JSON.parse(route.request().postData() ?? "{}");
        patches.push({ id, status: body.status });
        const target = reviews.find((r) => r.id === id);
        if (target) target.status = body.status;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(target ?? { id, ...body }),
        });
        return;
      }
      await route.fallback();
    });

    await page.route("**/api/admin/reviews*", async (route: Route) => {
      const url = new URL(route.request().url());
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      const status = url.searchParams.get("status");
      const filtered = status
        ? reviews.filter((r) => r.status === status)
        : reviews;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(filtered),
      });
    });

    await page.goto("/admin/reviews");

    const row = page.getByTestId("review-row-7");
    await expect(row).toBeVisible();
    await expect(row).toContainText("Calm Tincture");

    await page.getByTestId("review-approve-7").click();

    await expect.poll(() => patches.length).toBeGreaterThan(0);
    expect(patches.at(-1)).toEqual({ id: 7, status: "approved" });
  });

  test("filters tabs request the matching status from the API", async ({
    page,
  }) => {
    const requestedStatuses: string[] = [];

    await page.route("**/api/admin/reviews*", async (route: Route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/api/admin/reviews")) {
        const status = url.searchParams.get("status");
        if (status) requestedStatuses.push(status);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto("/admin/reviews");

    await page.getByTestId("reviews-tab-approved").click();
    await expect
      .poll(() => requestedStatuses.includes("approved"))
      .toBe(true);

    await page.getByTestId("reviews-tab-rejected").click();
    await expect
      .poll(() => requestedStatuses.includes("rejected"))
      .toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Abandoned carts
// ---------------------------------------------------------------------------

test.describe("admin abandoned carts", () => {
  test("renders rows, summary tiles, and recovery status badges", async ({
    page,
  }) => {
    const carts: AbandonedCart[] = [
      {
        id: 1,
        cartId: "cart_a",
        email: "alice@example.com",
        userId: null,
        subtotalCents: 5000,
        itemCount: 2,
        firstReminderSentAt: "2026-05-12T10:00:00.000Z",
        secondReminderSentAt: null,
        recoveredAt: null,
        recoveredOrderId: null,
        createdAt: "2026-05-12T08:00:00.000Z",
      },
      {
        id: 2,
        cartId: "cart_b",
        email: "bob@example.com",
        userId: null,
        subtotalCents: 7500,
        itemCount: 3,
        firstReminderSentAt: "2026-05-10T08:00:00.000Z",
        secondReminderSentAt: "2026-05-11T08:00:00.000Z",
        recoveredAt: "2026-05-11T20:00:00.000Z",
        recoveredOrderId: "9100",
        createdAt: "2026-05-10T06:00:00.000Z",
      },
    ];

    await page.route("**/api/admin/abandoned-carts", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(carts),
      });
    });

    await page.goto("/admin/abandoned-carts");

    const row1 = page.getByTestId("cart-row-1");
    const row2 = page.getByTestId("cart-row-2");
    await expect(row1).toBeVisible();
    await expect(row2).toBeVisible();
    await expect(row1).toContainText("alice@example.com");
    await expect(row1).toContainText("1 reminder sent");
    await expect(row2).toContainText("Recovered");
    await expect(row2).toContainText("9100");

    // Summary tiles: 2 total, 1 recovered, $125.00 cart value.
    const main = page.locator("main");
    await expect(main).toContainText("2");
    await expect(main).toContainText("1 / 2");
    await expect(main).toContainText("$125.00");
  });

  test("shows the empty state when no carts are returned", async ({ page }) => {
    await page.route("**/api/admin/abandoned-carts", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    });

    await page.goto("/admin/abandoned-carts");

    await expect(page.getByText("No abandoned carts.")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Newsletter
// ---------------------------------------------------------------------------

test.describe("admin newsletter", () => {
  test("lists subscribers, exposes export CSV link, and unsubscribes a row", async ({
    page,
  }) => {
    const subscribers: NewsletterSubscriber[] = [
      {
        id: 1,
        email: "alice@example.com",
        source: "footer",
        status: "active",
        createdAt: "2026-05-01T12:00:00.000Z",
        unsubscribedAt: null,
        resendContactId: null,
      },
      {
        id: 2,
        email: "bob@example.com",
        source: "popup",
        status: "unsubscribed",
        createdAt: "2026-04-20T12:00:00.000Z",
        unsubscribedAt: "2026-05-05T12:00:00.000Z",
        resendContactId: null,
      },
    ];
    const unsubscribed: number[] = [];

    await page.route(
      "**/api/admin/newsletter/subscribers**",
      async (route: Route) => {
        const url = new URL(route.request().url());
        const method = route.request().method();
        const unsubMatch =
          /\/api\/admin\/newsletter\/subscribers\/(\d+)\/unsubscribe$/.exec(
            url.pathname,
          );
        if (unsubMatch && method === "POST") {
          const id = Number(unsubMatch[1]);
          unsubscribed.push(id);
          const target = subscribers.find((s) => s.id === id);
          if (target) {
            target.status = "unsubscribed";
            target.unsubscribedAt = new Date().toISOString();
          }
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true }),
          });
          return;
        }
        if (
          url.pathname.endsWith("/api/admin/newsletter/subscribers") &&
          method === "GET"
        ) {
          const status = url.searchParams.get("status") ?? "all";
          const filtered =
            status === "all"
              ? subscribers
              : subscribers.filter((s) => s.status === status);
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              items: filtered,
              total: filtered.length,
              page: 1,
              pageSize: 50,
            }),
          });
          return;
        }
        await route.fallback();
      },
    );

    await page.goto("/admin/newsletter");

    await expect(page.getByTestId("row-subscriber-1")).toBeVisible();
    await expect(page.getByTestId("row-subscriber-2")).toBeVisible();

    const exportLink = page.getByTestId("link-export-csv");
    await expect(exportLink).toHaveAttribute(
      "href",
      /\/api\/admin\/newsletter\/subscribers\/export\.csv\?.*status=all/,
    );

    await page.getByTestId("button-unsubscribe-1").click();

    await expect.poll(() => unsubscribed).toContain(1);
    await expect(page.getByTestId("button-unsubscribe-1")).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Tax summary
// ---------------------------------------------------------------------------

test.describe("admin tax summary", () => {
  test("renders enabled state with collected totals", async ({ page }) => {
    const summary: TaxSummary = {
      taxCollectedCents: 12345,
      taxableOrders: 17,
      currency: "usd",
      stripeTaxEnabled: true,
      warning: null,
    };

    await page.route("**/api/admin/tax-summary", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(summary),
      });
    });

    await page.goto("/admin/tax");

    await expect(page.getByTestId("tax-ok")).toBeVisible();
    await expect(page.getByTestId("tax-warning")).toHaveCount(0);

    const main = page.locator("main");
    await expect(main).toContainText("$123.45");
    await expect(main).toContainText("17");
    await expect(main).toContainText("USD");
    await expect(main).toContainText("Enabled");
  });

  test("renders disabled warning when Stripe Tax is off", async ({ page }) => {
    const summary: TaxSummary = {
      taxCollectedCents: 0,
      taxableOrders: 0,
      currency: "usd",
      stripeTaxEnabled: false,
      warning:
        "Stripe Tax is disabled. Set STRIPE_TAX_ENABLED=1 once tax is configured in your Stripe dashboard.",
    };

    await page.route("**/api/admin/tax-summary", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(summary),
      });
    });

    await page.goto("/admin/tax");

    await expect(page.getByTestId("tax-warning")).toBeVisible();
    await expect(page.getByTestId("tax-warning")).toContainText(
      /Stripe Tax is disabled/i,
    );
    await expect(page.getByTestId("tax-ok")).toHaveCount(0);
    await expect(page.locator("main")).toContainText("Disabled");
  });
});
