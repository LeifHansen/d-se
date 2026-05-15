import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { resetDb, db } from "./testDb";
import { productsTable } from "@workspace/db";
import { makeApp, seedProduct } from "./helpers";

const productsRouter = (await import("../routes/products")).default;

const app = makeApp((r) => {
  r.use(productsRouter);
});

describe("GET /api/products", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns only published products", async () => {
    await seedProduct({ slug: "alpha", name: "Alpha" });
    await db.insert(productsTable).values({
      slug: "draft",
      name: "Draft",
      priceCents: 1000,
      published: false,
    });
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].slug).toBe("alpha");
  });

  it("filters by search across name and description", async () => {
    await db.insert(productsTable).values([
      {
        slug: "matcha-latte",
        name: "Matcha Latte",
        description: "Green tea drink",
        priceCents: 500,
      },
      {
        slug: "coffee",
        name: "Coffee",
        description: "Roasted beans",
        priceCents: 600,
      },
    ]);
    const res = await request(app).get("/api/products").query({ search: "matcha" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].slug).toBe("matcha-latte");

    const res2 = await request(app).get("/api/products").query({ search: "roasted" });
    expect(res2.body).toHaveLength(1);
    expect(res2.body[0].slug).toBe("coffee");
  });

  it("filters by featured=true", async () => {
    await db.insert(productsTable).values([
      { slug: "f1", name: "F1", priceCents: 100, featured: true },
      { slug: "n1", name: "N1", priceCents: 100, featured: false },
    ]);
    const res = await request(app).get("/api/products").query({ featured: "true" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].slug).toBe("f1");
  });

  it("filters by tag", async () => {
    await db.insert(productsTable).values([
      {
        slug: "tea",
        name: "Tea",
        priceCents: 100,
        tags: ["drink", "hot"],
      },
      {
        slug: "ice",
        name: "Ice",
        priceCents: 100,
        tags: ["drink", "cold"],
      },
      {
        slug: "rock",
        name: "Rock",
        priceCents: 100,
        tags: ["solid"],
      },
    ]);
    const res = await request(app).get("/api/products").query({ tag: "cold" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].slug).toBe("ice");

    const res2 = await request(app).get("/api/products").query({ tag: "drink" });
    expect(res2.status).toBe(200);
    expect(res2.body.map((p: { slug: string }) => p.slug).sort()).toEqual([
      "ice",
      "tea",
    ]);
  });

  it("respects limit", async () => {
    for (let i = 0; i < 5; i++) {
      await db.insert(productsTable).values({
        slug: `p${i}`,
        name: `P${i}`,
        priceCents: 100,
      });
    }
    const res = await request(app).get("/api/products").query({ limit: 2 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("returns 400 for limit above max", async () => {
    const res = await request(app).get("/api/products").query({ limit: 9_999 });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/products/featured", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns only featured & published", async () => {
    await db.insert(productsTable).values([
      { slug: "fp", name: "FP", priceCents: 100, featured: true },
      { slug: "np", name: "NP", priceCents: 100, featured: false },
      {
        slug: "fd",
        name: "FD",
        priceCents: 100,
        featured: true,
        published: false,
      },
    ]);
    const res = await request(app).get("/api/products/featured");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].slug).toBe("fp");
  });
});

describe("GET /api/products/:slug", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns the product when published", async () => {
    await seedProduct({ slug: "vanilla", name: "Vanilla", priceCents: 1234 });
    const res = await request(app).get("/api/products/vanilla");
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe("vanilla");
    expect(res.body.priceCents).toBe(1234);
    expect(res.body.averageRating).toBeNull();
    expect(res.body.reviewCount).toBe(0);
  });

  it("returns 404 for an unknown slug", async () => {
    const res = await request(app).get("/api/products/nope");
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unpublished product", async () => {
    await db.insert(productsTable).values({
      slug: "hidden",
      name: "Hidden",
      priceCents: 100,
      published: false,
    });
    const res = await request(app).get("/api/products/hidden");
    expect(res.status).toBe(404);
  });
});
