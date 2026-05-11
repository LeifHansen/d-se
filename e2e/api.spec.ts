import { test, expect, request } from "@playwright/test";

const apiBase =
  process.env.E2E_API_BASE_URL ??
  (process.env.E2E_BASE_URL
    ? `${process.env.E2E_BASE_URL}/api`
    : "http://localhost:5001/api");

test.describe("api smoke", () => {
  test("/healthz responds with structured checks and X-Request-Id", async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${apiBase}/healthz`);
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("checks");
    expect(body.checks).toHaveProperty("db");
    expect(body.checks).toHaveProperty("stripe");
    expect(body.checks).toHaveProperty("resend");
    expect(res.headers()["x-request-id"]).toBeTruthy();
  });

  test("/products lists products", async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${apiBase}/products`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("/blog/posts responds", async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${apiBase}/blog/posts`);
    expect(res.ok()).toBeTruthy();
  });
});
