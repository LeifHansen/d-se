import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { resetDb, db } from "./testDb";
import { productsTable, blogPostsTable } from "@workspace/db";
import { makeApp } from "./helpers";

const seoRouter = (await import("../routes/seo")).default;

const app = makeApp((r) => {
  r.use(seoRouter);
});

describe("GET /api/sitemap.xml", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns valid XML with the homepage entry only when there's no content", async () => {
    const res = await request(app).get("/api/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/xml/);
    expect(res.text).toContain('<?xml version="1.0"');
    expect(res.text).toContain("<urlset");
    expect(res.text).toMatch(/<loc>https?:\/\/[^<]+\/<\/loc>/);
  });

  it("includes published products and posts but not drafts", async () => {
    await db.insert(productsTable).values([
      { slug: "live-prod", name: "Live", priceCents: 100, published: true },
      { slug: "draft-prod", name: "Draft", priceCents: 100, published: false },
    ]);
    await db.insert(blogPostsTable).values([
      {
        slug: "live-post",
        title: "Live",
        excerpt: "",
        content: "",
        published: true,
        publishedAt: new Date(),
      },
      {
        slug: "draft-post",
        title: "Draft",
        excerpt: "",
        content: "",
        published: false,
      },
    ]);
    const res = await request(app).get("/api/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.text).toContain("/shop/live-prod");
    expect(res.text).not.toContain("/shop/draft-prod");
    expect(res.text).toContain("/journal/live-post");
    expect(res.text).not.toContain("/journal/draft-post");
  });

  it("escapes XML-unsafe characters in slugs", async () => {
    await db.insert(productsTable).values({
      slug: "weird&name",
      name: "Weird",
      priceCents: 100,
    });
    const res = await request(app).get("/api/sitemap.xml");
    expect(res.text).toContain("weird&amp;name");
    expect(res.text).not.toMatch(/weird&name(?!amp;)/);
  });

  it("sets a Cache-Control header", async () => {
    const res = await request(app).get("/api/sitemap.xml");
    expect(res.headers["cache-control"]).toMatch(/max-age=\d+/);
  });
});

describe("GET /api/robots.txt", () => {
  it("returns plain text robots directives with the sitemap URL", async () => {
    const res = await request(app).get("/api/robots.txt");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toMatch(/User-agent: \*/);
    expect(res.text).toMatch(/Disallow: \/admin/);
    expect(res.text).toMatch(/Disallow: \/api\//);
    expect(res.text).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
  });
});
