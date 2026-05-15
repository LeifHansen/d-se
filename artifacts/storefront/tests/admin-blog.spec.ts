import { test, expect, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// End-to-end coverage for the AdminBlog page (artifacts/storefront/src/pages/
// admin/AdminBlog.tsx). blog-draft-preview.spec.ts only exercises the public-
// facing draft preview; this spec drives the admin editor itself: list +
// create + edit + toggle published/draft + delete, all against page.route()
// mocks for the /api/admin/blog/posts endpoints.
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
  published: boolean;
  createdAt: string;
};

function makePost(overrides: Partial<BlogPost> & { id: number }): BlogPost {
  return {
    slug: `post-${overrides.id}`,
    title: `Post ${overrides.id}`,
    excerpt: "Short excerpt",
    content: "## Heading\n\nBody copy.",
    coverImage: null,
    tags: ["news"],
    author: "Editorial",
    publishedAt: null,
    seoTitle: null,
    seoDescription: null,
    published: false,
    createdAt: "2026-05-13T10:00:00.000Z",
    ...overrides,
  };
}

type Mocks = {
  posts: BlogPost[];
  createCalls: BlogPost[];
  updateCalls: { id: number; body: BlogPost }[];
  deleteCalls: number[];
  bySlugCalls: string[];
};

async function installAdminBlogMocks(
  page: Page,
  initial: BlogPost[],
): Promise<Mocks> {
  const state: Mocks = {
    posts: [...initial],
    createCalls: [],
    updateCalls: [],
    deleteCalls: [],
    bySlugCalls: [],
  };
  let nextId = Math.max(0, ...initial.map((p) => p.id)) + 1;

  // Quiet the dashboard / sidebar stats request that AdminLayout doesn't make
  // here, but other admin pages do — keep parity with admin-misc.spec.ts in
  // case AdminLayout grows a stats peek later.
  await page.route("**/api/admin/stats**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.route("**/api/admin/blog/posts/by-slug/*", async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const slug =
      decodeURIComponent(
        new URL(route.request().url()).pathname.split("/").pop() ?? "",
      ) || "";
    state.bySlugCalls.push(slug);
    const post = state.posts.find((p) => p.slug === slug);
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
  });

  // Catch-all for /api/admin/blog/posts and /api/admin/blog/posts/:id. Note
  // that the more specific by-slug handler above runs first because Playwright
  // matches routes in registration order (most-recently registered wins) — we
  // register the broader one *after* so it acts as the fallback.
  await page.route(/\/api\/admin\/blog\/posts(\/\d+)?$/, async (route: Route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const tail = url.pathname.replace(/^.*\/api\/admin\/blog\/posts/, "");

    if (tail.startsWith("/by-slug/")) {
      // Should have been handled by the more specific route above; fall back
      // just in case.
      await route.fallback();
      return;
    }

    // List
    if (tail === "" || tail === "/") {
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(state.posts),
        });
        return;
      }
      if (method === "POST") {
        const body = JSON.parse(route.request().postData() ?? "{}") as Omit<
          BlogPost,
          "id" | "publishedAt"
        > & { published?: boolean };
        const created: BlogPost = {
          id: nextId++,
          slug: body.slug,
          title: body.title,
          excerpt: body.excerpt,
          content: body.content,
          coverImage: body.coverImage ?? null,
          tags: body.tags ?? [],
          author: body.author ?? null,
          seoTitle: body.seoTitle ?? null,
          seoDescription: body.seoDescription ?? null,
          published: body.published ?? false,
          publishedAt: body.published ? new Date().toISOString() : null,
          createdAt: new Date().toISOString(),
        };
        state.posts = [created, ...state.posts];
        state.createCalls.push(created);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(created),
        });
        return;
      }
    }

    // /:id
    const idMatch = /^\/(\d+)$/.exec(tail);
    if (idMatch) {
      const id = Number(idMatch[1]);
      if (method === "PATCH") {
        const body = JSON.parse(route.request().postData() ?? "{}") as Omit<
          BlogPost,
          "id" | "publishedAt"
        > & { published?: boolean };
        const idx = state.posts.findIndex((p) => p.id === id);
        if (idx === -1) {
          await route.fulfill({ status: 404, body: "{}" });
          return;
        }
        const existing = state.posts[idx];
        const updated: BlogPost = {
          ...existing,
          slug: body.slug,
          title: body.title,
          excerpt: body.excerpt,
          content: body.content,
          coverImage: body.coverImage ?? null,
          tags: body.tags ?? [],
          author: body.author ?? null,
          seoTitle: body.seoTitle ?? null,
          seoDescription: body.seoDescription ?? null,
          published: body.published ?? false,
          publishedAt:
            body.published && !existing.published
              ? new Date().toISOString()
              : existing.publishedAt,
        };
        state.posts[idx] = updated;
        state.updateCalls.push({ id, body: updated });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(updated),
        });
        return;
      }
      if (method === "DELETE") {
        state.posts = state.posts.filter((p) => p.id !== id);
        state.deleteCalls.push(id);
        await route.fulfill({ status: 204, body: "" });
        return;
      }
    }

    await route.fallback();
  });

  return state;
}

test.describe("admin blog editor", () => {
  test("create → edit → toggle published → delete a post", async ({ page }) => {
    const existing = makePost({
      id: 5001,
      slug: "existing-entry",
      title: "Existing Entry",
      excerpt: "Already in the system.",
      content: "## Hello\n\nOriginal body.",
      published: false,
    });
    const mocks = await installAdminBlogMocks(page, [existing]);

    await page.goto("/admin/blog");

    // The list renders the existing post as a Draft.
    const existingRow = page.getByTestId(`row-post-${existing.id}`);
    await expect(existingRow).toBeVisible();
    await expect(
      page.getByTestId(`badge-status-${existing.id}`),
    ).toContainText(/draft/i);

    // ----- CREATE -----------------------------------------------------------
    await page.getByTestId("button-new-post").click();
    await expect(page.getByTestId("post-editor-form")).toBeVisible();

    // Typing the title auto-fills the slug (slugify) until the slug field is
    // touched directly.
    await page
      .getByTestId("input-post-title")
      .fill("Brand New Tea Guide");
    await expect(page.getByTestId("input-post-slug")).toHaveValue(
      "brand-new-tea-guide",
    );

    await page
      .getByTestId("input-post-excerpt")
      .fill("Everything we learned this season.");
    await page
      .getByTestId("input-post-content")
      .fill("## Welcome\n\nFirst paragraph of the new guide.");
    await page.getByTestId("input-post-author").fill("Editorial");
    await page.getByTestId("input-post-tags").fill("guide, tea");

    // Save as a draft (don't toggle the switch).
    await page.getByTestId("button-save-post").click();

    // Editor closes and the new post appears at the top of the list.
    await expect(page.getByTestId("post-editor-form")).toHaveCount(0);
    expect(mocks.createCalls).toHaveLength(1);
    const created = mocks.createCalls[0];
    expect(created).toMatchObject({
      slug: "brand-new-tea-guide",
      title: "Brand New Tea Guide",
      tags: ["guide", "tea"],
      published: false,
    });
    const createdRow = page.getByTestId(`row-post-${created.id}`);
    await expect(createdRow).toBeVisible();
    await expect(createdRow).toContainText("Brand New Tea Guide");
    await expect(
      page.getByTestId(`badge-status-${created.id}`),
    ).toContainText(/draft/i);

    // ----- EDIT (existing post) --------------------------------------------
    await page.getByTestId(`button-edit-${existing.id}`).click();
    await expect(page.getByTestId("post-editor-form")).toBeVisible();

    // Editor prefills via the by-slug fetch.
    expect(mocks.bySlugCalls).toContain("existing-entry");
    await expect(page.getByTestId("input-post-title")).toHaveValue(
      "Existing Entry",
    );

    // Change title + excerpt and save.
    await page.getByTestId("input-post-title").fill("Existing Entry (v2)");
    await page
      .getByTestId("input-post-excerpt")
      .fill("Now with a sharper hook.");
    await page.getByTestId("button-save-post").click();

    await expect(page.getByTestId("post-editor-form")).toHaveCount(0);
    expect(mocks.updateCalls).toHaveLength(1);
    expect(mocks.updateCalls[0]).toMatchObject({
      id: existing.id,
      body: {
        title: "Existing Entry (v2)",
        excerpt: "Now with a sharper hook.",
        published: false,
      },
    });
    await expect(existingRow).toContainText("Existing Entry (v2)");
    await expect(
      page.getByTestId(`badge-status-${existing.id}`),
    ).toContainText(/draft/i);

    // ----- TOGGLE PUBLISHED -------------------------------------------------
    await page.getByTestId(`button-edit-${existing.id}`).click();
    await expect(page.getByTestId("post-editor-form")).toBeVisible();

    const publishedSwitch = page.getByTestId("switch-post-published");
    await expect(publishedSwitch).toHaveAttribute("data-state", "unchecked");
    await publishedSwitch.click();
    await expect(publishedSwitch).toHaveAttribute("data-state", "checked");
    await page.getByTestId("button-save-post").click();

    await expect(page.getByTestId("post-editor-form")).toHaveCount(0);
    expect(mocks.updateCalls).toHaveLength(2);
    expect(mocks.updateCalls[1].body.published).toBe(true);
    await expect(
      page.getByTestId(`badge-status-${existing.id}`),
    ).toContainText(/published/i);

    // Flip it back to draft to prove the toggle works both directions.
    await page.getByTestId(`button-edit-${existing.id}`).click();
    const switch2 = page.getByTestId("switch-post-published");
    await expect(switch2).toHaveAttribute("data-state", "checked");
    await switch2.click();
    await expect(switch2).toHaveAttribute("data-state", "unchecked");
    await page.getByTestId("button-save-post").click();

    await expect(page.getByTestId("post-editor-form")).toHaveCount(0);
    expect(mocks.updateCalls).toHaveLength(3);
    expect(mocks.updateCalls[2].body.published).toBe(false);
    await expect(
      page.getByTestId(`badge-status-${existing.id}`),
    ).toContainText(/draft/i);

    // ----- DELETE -----------------------------------------------------------
    await page.getByTestId(`button-delete-${created.id}`).click();
    await page.getByTestId("button-confirm-delete-post").click();

    await expect(page.getByTestId(`row-post-${created.id}`)).toHaveCount(0);
    expect(mocks.deleteCalls).toEqual([created.id]);

    // The other post is untouched.
    await expect(existingRow).toBeVisible();
  });

  test("validation error blocks save and surfaces an inline message", async ({
    page,
  }) => {
    const mocks = await installAdminBlogMocks(page, []);

    await page.goto("/admin/blog");
    await page.getByTestId("button-new-post").click();

    // Fill everything except content, then try to save. The form's own
    // fromForm() guard rejects empty content with "Content is required".
    await page.getByTestId("input-post-title").fill("Half-finished");
    await page.getByTestId("input-post-excerpt").fill("Excerpt is here.");
    // Slug auto-fills from title; clear content explicitly to be safe.
    await page.getByTestId("input-post-content").fill(" ");

    await page.getByTestId("button-save-post").click();

    await expect(page.getByTestId("text-post-form-error")).toContainText(
      /content is required/i,
    );
    expect(mocks.createCalls).toHaveLength(0);
    // Editor stays open so the admin can fix the problem.
    await expect(page.getByTestId("post-editor-form")).toBeVisible();
  });
});
