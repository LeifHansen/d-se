import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { resetDb, db } from "./testDb";
import { blogPostsTable } from "@workspace/db";
import { makeApp } from "./helpers";

const blogRouter = (await import("../routes/blog")).default;

const app = makeApp((r) => {
  r.use(blogRouter);
});

async function seedPost(opts: {
  slug: string;
  title?: string;
  published?: boolean;
  publishedAt?: Date | null;
  tags?: string[];
}): Promise<void> {
  await db.insert(blogPostsTable).values({
    slug: opts.slug,
    title: opts.title ?? opts.slug,
    excerpt: "ex",
    content: "body",
    tags: opts.tags ?? [],
    published: opts.published ?? true,
    publishedAt: opts.publishedAt ?? new Date(),
  });
}

describe("GET /api/blog/posts", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns only published posts", async () => {
    await seedPost({ slug: "live", published: true });
    await seedPost({ slug: "draft", published: false });
    const res = await request(app).get("/api/blog/posts");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].slug).toBe("live");
  });

  it("orders by publishedAt desc", async () => {
    await seedPost({
      slug: "old",
      publishedAt: new Date("2024-01-01"),
    });
    await seedPost({
      slug: "new",
      publishedAt: new Date("2025-01-01"),
    });
    const res = await request(app).get("/api/blog/posts");
    expect(res.body.map((p: { slug: string }) => p.slug)).toEqual(["new", "old"]);
  });

  it("respects limit", async () => {
    await seedPost({ slug: "a", publishedAt: new Date("2025-01-03") });
    await seedPost({ slug: "b", publishedAt: new Date("2025-01-02") });
    await seedPost({ slug: "c", publishedAt: new Date("2025-01-01") });
    const res = await request(app).get("/api/blog/posts").query({ limit: 2 });
    expect(res.body).toHaveLength(2);
  });
});

describe("GET /api/blog/posts/:slug", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns the post when published", async () => {
    await seedPost({ slug: "hello", title: "Hello World" });
    const res = await request(app).get("/api/blog/posts/hello");
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe("hello");
    expect(res.body.title).toBe("Hello World");
  });

  it("returns 404 for an unknown slug", async () => {
    const res = await request(app).get("/api/blog/posts/missing");
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unpublished post", async () => {
    await seedPost({ slug: "secret", published: false });
    const res = await request(app).get("/api/blog/posts/secret");
    expect(res.status).toBe(404);
  });
});
