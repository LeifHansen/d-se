import { test, expect, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// E2E coverage for the unified spam quarantine page at
// /admin/contact-quarantine, which now uses the GET /admin/spam-quarantine
// endpoint and renders three things:
//   1. A reason-counts table (last 7d / last 30d).
//   2. A Contact-form section with Forward / Mark legit / Delete actions.
//   3. A Newsletter section with Mark legit / Delete actions.
// This guards against regressions in the unified endpoint contract and the
// page wiring (testids, action plumbing, refresh after action).
// ---------------------------------------------------------------------------

type ContactEntry = {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  reasons: string[];
  ip: string | null;
  createdAt: string;
  expiresAt: string;
  forwardedAt: string | null;
  markedLegitAt: string | null;
};

type NewsletterEntry = {
  id: number;
  email: string;
  source: string | null;
  reasons: string[];
  ip: string | null;
  createdAt: string;
  expiresAt: string;
  markedLegitAt: string | null;
};

test.describe("admin spam quarantine — unified page", () => {
  test("lists contact + newsletter rows, shows reason counts, and the per-kind actions work", async ({
    page,
  }) => {
    const contact: ContactEntry[] = [
      {
        id: 501,
        name: "Spammy Sam",
        email: "spammy@example.com",
        subject: "Cheap deals!!",
        message: "Visit https://a.com https://b.com https://c.com now",
        reasons: ["too_many_links", "blocked_tld:.ru"],
        ip: "203.0.113.7",
        createdAt: "2026-05-12T10:00:00.000Z",
        expiresAt: "2026-05-26T10:00:00.000Z",
        forwardedAt: null,
        markedLegitAt: null,
      },
    ];
    const newsletter: NewsletterEntry[] = [
      {
        id: 902,
        email: "burner+sub@mailinator.com",
        source: "footer",
        reasons: ["disposable_email"],
        ip: "198.51.100.4",
        createdAt: "2026-05-13T08:00:00.000Z",
        expiresAt: "2026-05-27T08:00:00.000Z",
        markedLegitAt: null,
      },
    ];

    const contactLegit: number[] = [];
    const contactDeleted: number[] = [];
    const newsletterLegit: number[] = [];
    const newsletterDeleted: number[] = [];

    function summary() {
      return {
        contact,
        newsletter,
        reasonCounts7d: [
          { reason: "too_many_links", count: 1 },
          { reason: "disposable_email", count: 1 },
          { reason: "blocked_tld", count: 1 },
        ],
        reasonCounts30d: [
          { reason: "too_many_links", count: 3 },
          { reason: "disposable_email", count: 2 },
          { reason: "blocked_tld", count: 2 },
        ],
      };
    }

    await page.route(
      "**/api/admin/spam-quarantine",
      async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(summary()),
        });
      },
    );

    await page.route(
      "**/api/admin/contact-quarantine/*/mark-legit",
      async (route: Route) => {
        const url = new URL(route.request().url());
        const id = Number(/\/(\d+)\/mark-legit$/.exec(url.pathname)?.[1] ?? 0);
        contactLegit.push(id);
        const target = contact.find((c) => c.id === id);
        if (target) target.markedLegitAt = "2026-05-15T12:00:00.000Z";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(target),
        });
      },
    );

    await page.route(
      "**/api/admin/contact-quarantine/*",
      async (route: Route) => {
        if (route.request().method() !== "DELETE") {
          await route.fallback();
          return;
        }
        const url = new URL(route.request().url());
        const id = Number(/\/(\d+)$/.exec(url.pathname)?.[1] ?? 0);
        contactDeleted.push(id);
        const idx = contact.findIndex((c) => c.id === id);
        if (idx >= 0) contact.splice(idx, 1);
        await route.fulfill({ status: 204, body: "" });
      },
    );

    await page.route(
      "**/api/admin/newsletter-quarantine/*/mark-legit",
      async (route: Route) => {
        const url = new URL(route.request().url());
        const id = Number(/\/(\d+)\/mark-legit$/.exec(url.pathname)?.[1] ?? 0);
        newsletterLegit.push(id);
        const target = newsletter.find((n) => n.id === id);
        if (target) target.markedLegitAt = "2026-05-15T12:30:00.000Z";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(target),
        });
      },
    );

    await page.route(
      "**/api/admin/newsletter-quarantine/*",
      async (route: Route) => {
        if (route.request().method() !== "DELETE") {
          await route.fallback();
          return;
        }
        const url = new URL(route.request().url());
        const id = Number(/\/(\d+)$/.exec(url.pathname)?.[1] ?? 0);
        newsletterDeleted.push(id);
        const idx = newsletter.findIndex((n) => n.id === id);
        if (idx >= 0) newsletter.splice(idx, 1);
        await route.fulfill({ status: 204, body: "" });
      },
    );

    await page.goto("/admin/contact-quarantine");

    // Page shell
    await expect(
      page.getByTestId("page-admin-contact-quarantine"),
    ).toBeVisible();

    // Reason counts table is populated with both 7d and 30d figures.
    const counts = page.getByTestId("section-reason-counts");
    await expect(counts).toBeVisible();
    await expect(page.getByTestId("reason-row-too_many_links")).toBeVisible();
    await expect(page.getByTestId("reason-too_many_links-7d")).toHaveText("1");
    await expect(page.getByTestId("reason-too_many_links-30d")).toHaveText(
      "3",
    );
    await expect(page.getByTestId("reason-disposable_email-7d")).toHaveText(
      "1",
    );
    await expect(page.getByTestId("reason-disposable_email-30d")).toHaveText(
      "2",
    );
    await expect(page.getByTestId("reason-counts-empty")).toHaveCount(0);

    // Contact row renders with the right copy + reason chips.
    const contactRow = page.getByTestId("row-quarantine-501");
    await expect(contactRow).toBeVisible();
    await expect(contactRow).toContainText("Spammy Sam");
    await expect(contactRow).toContainText("spammy@example.com");
    await expect(contactRow).toContainText("Cheap deals!!");
    await expect(contactRow).toContainText("too_many_links");

    // Newsletter row renders with email + reason chip.
    const newsletterRow = page.getByTestId("row-newsletter-quarantine-902");
    await expect(newsletterRow).toBeVisible();
    await expect(newsletterRow).toContainText("burner+sub@mailinator.com");
    await expect(newsletterRow).toContainText("disposable_email");

    // Mark contact entry as legit → button flips to disabled "Marked legit"
    // and a badge appears on the row.
    await page.getByTestId("button-mark-legit-501").click();
    await expect.poll(() => contactLegit).toContain(501);
    await expect(page.getByTestId("button-mark-legit-501")).toBeDisabled();
    await expect(page.getByTestId("button-mark-legit-501")).toContainText(
      "Marked legit",
    );
    await expect(contactRow.getByTestId("badge-legit")).toBeVisible();

    // Mark newsletter entry as legit → same behavior on the newsletter side.
    await page.getByTestId("button-newsletter-mark-legit-902").click();
    await expect.poll(() => newsletterLegit).toContain(902);
    await expect(
      page.getByTestId("button-newsletter-mark-legit-902"),
    ).toBeDisabled();
    await expect(newsletterRow.getByTestId("badge-legit")).toBeVisible();

    // Delete contact (confirm dialog) → row disappears and contact-empty
    // state shows up.
    page.once("dialog", (dialog) => {
      void dialog.accept();
    });
    await page.getByTestId("button-delete-501").click();
    await expect.poll(() => contactDeleted).toContain(501);
    await expect(page.getByTestId("row-quarantine-501")).toHaveCount(0);
    await expect(page.getByTestId("quarantine-empty")).toBeVisible();

    // Delete newsletter (confirm dialog) → row disappears and newsletter-empty
    // state shows up.
    page.once("dialog", (dialog) => {
      void dialog.accept();
    });
    await page.getByTestId("button-newsletter-delete-902").click();
    await expect.poll(() => newsletterDeleted).toContain(902);
    await expect(
      page.getByTestId("row-newsletter-quarantine-902"),
    ).toHaveCount(0);
    await expect(page.getByTestId("newsletter-quarantine-empty")).toBeVisible();
  });
});
