import { test, expect, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type BlogPost = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string | null;
  tags: string[];
  author: string | null;
  publishedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  published?: boolean;
};

const DRAFT_SLUG = "secret-draft-entry";
const PUBLISHED_SLUG = "the-published-entry";

const DRAFT_POST: BlogPost = {
  id: 7001,
  slug: DRAFT_SLUG,
  title: "Secret Draft Entry",
  excerpt: "An unfinished thought from the lab.",
  content:
    "## Behind the curtain\n\nThis post is not yet ready for the public, " +
    "but admins can preview it before publishing.",
  coverImage: null,
  tags: ["notes"],
  author: "Editorial",
  publishedAt: null,
  seoTitle: null,
  seoDescription: null,
  published: false,
};

const PUBLISHED_POST: BlogPost = {
  id: 7002,
  slug: PUBLISHED_SLUG,
  title: "The Published Entry",
  excerpt: "Live and visible.",
  content:
    "## Hello world\n\nThis post is live and should never render the draft " +
    "preview banner, even when the admin endpoint is also reachable.",
  coverImage: null,
  tags: ["news"],
  author: "Editorial",
  publishedAt: "2026-04-01T12:00:00.000Z",
  seoTitle: null,
  seoDescription: null,
  published: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AdminMode = "draft-visible" | "unauthorized";

async function installBlogMocks(
  page: Page,
  options: { adminMode: AdminMode },
): Promise<void> {
  // Public endpoint: 404 for the unpublished slug, 200 for the published one.
  await page.route("**/api/blog/posts/*", async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const slug = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    if (slug === PUBLISHED_SLUG) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(PUBLISHED_POST),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Post not found" }),
    });
  });

  // Admin fallback endpoint: either return the draft (admin) or 401 (shopper).
  await page.route(
    "**/api/admin/blog/posts/by-slug/*",
    async (route: Route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const slug =
        new URL(route.request().url()).pathname.split("/").pop() ?? "";
      if (options.adminMode === "unauthorized") {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unauthorized" }),
        });
        return;
      }
      const post =
        slug === DRAFT_SLUG
          ? DRAFT_POST
          : slug === PUBLISHED_SLUG
            ? PUBLISHED_POST
            : null;
      if (!post) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "Post not found" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(post),
      });
    },
  );

  // Related-posts list — return empty so the page renders without extra noise.
  await page.route("**/api/blog/posts*", async (route: Route) => {
    const url = new URL(route.request().url());
    // Only intercept the list endpoint (no trailing slug segment).
    if (url.pathname.endsWith("/api/blog/posts")) {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
      return;
    }
    return route.fallback();
  });
}

async function dismissOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      window.localStorage.setItem("dose-age-confirmed", "yes");
      window.localStorage.setItem("dose-cookies-decision", "accept");
    } catch {
      /* ignore */
    }
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("blog draft preview fallback", () => {
  test("signed-out shopper sees 'Post not found' for an unpublished post", async ({
    page,
  }) => {
    await installBlogMocks(page, { adminMode: "unauthorized" });

    await page.goto(`/blog/${DRAFT_SLUG}`);
    await dismissOverlays(page);

    await expect(page.getByText("Post not found.")).toBeVisible();
    await expect(page.getByTestId("blog-draft-banner")).toHaveCount(0);
    await expect(page.getByTestId("blog-post")).toHaveCount(0);
  });

  test("admin sees the draft post and the draft preview banner", async ({
    page,
  }) => {
    await installBlogMocks(page, { adminMode: "draft-visible" });

    await page.goto(`/blog/${DRAFT_SLUG}`);
    await dismissOverlays(page);

    await expect(page.getByTestId("blog-draft-banner")).toBeVisible();
    await expect(page.getByTestId("blog-post")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: DRAFT_POST.title, level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Post not found.")).toHaveCount(0);
  });

  test("published post never renders the draft preview banner", async ({
    page,
  }) => {
    // Even with the admin endpoint reachable, a published post must not show
    // the draft banner because the public endpoint resolves first.
    await installBlogMocks(page, { adminMode: "draft-visible" });

    await page.goto(`/blog/${PUBLISHED_SLUG}`);
    await dismissOverlays(page);

    await expect(page.getByTestId("blog-post")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: PUBLISHED_POST.title, level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId("blog-draft-banner")).toHaveCount(0);
  });
});
