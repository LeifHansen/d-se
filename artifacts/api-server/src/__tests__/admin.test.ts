import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { resetDb } from "./testDb";
import { makeApp, seedDiscount, seedProduct } from "./helpers";

vi.mock("../lib/email", () => ({
  sendOrderConfirmation: vi.fn(async () => {}),
  sendAbandonedCartEmail: vi.fn(async () => {}),
  sendLowStockDigest: vi.fn(async () => {}),
  sendWelcomeEmail: vi.fn(async () => {}),
  sendShipmentEmail: vi.fn(async () => {}),
  addToResendAudience: vi.fn(async () => ({ contactId: null })),
  removeFromResendAudience: vi.fn(async () => {}),
  STORE_NAME: "Test",
}));

vi.mock("../lib/easypost", () => ({
  getEasyPost: () => ({}),
  isEasyPostConfigured: () => false,
  FROM_ADDRESS: {},
}));

vi.mock("../lib/metrics", () => ({
  getStripeWebhookHealth: async () => ({
    lastReceivedAt: null,
    healthy: true,
  }),
  recordStripeWebhookReceived: vi.fn(async () => {}),
}));

import * as clerk from "@clerk/express";
const { __setAuth } = clerk as unknown as {
  __setAuth: (userId: string | null, user?: unknown) => void;
};

const adminRouter = (await import("../routes/admin")).default;

const app = makeApp((r) => {
  r.use(adminRouter);
});

const ADMIN_USER = {
  emailAddresses: [{ emailAddress: "admin@example.com" }],
};
const NON_ADMIN_USER = {
  emailAddresses: [{ emailAddress: "shopper@example.com" }],
};

describe.each([
  ["GET", "/api/admin/products"],
  ["GET", "/api/admin/orders"],
  ["GET", "/api/admin/discount-codes"],
  ["GET", "/api/admin/stats"],
])("admin auth gating: %s %s", (method, path) => {
  beforeEach(async () => {
    await resetDb();
    __setAuth(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app)[
      method.toLowerCase() as "get"
    ](path);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a signed-in non-admin", async () => {
    __setAuth("user_shopper", NON_ADMIN_USER);
    const res = await request(app)[
      method.toLowerCase() as "get"
    ](path);
    expect(res.status).toBe(403);
  });

  it("returns 200 for an allowlisted admin", async () => {
    __setAuth("user_admin", ADMIN_USER);
    const res = await request(app)[
      method.toLowerCase() as "get"
    ](path);
    expect(res.status).toBe(200);
  });
});

describe("admin list payloads", () => {
  beforeEach(async () => {
    await resetDb();
    __setAuth("user_admin", ADMIN_USER);
  });

  it("GET /admin/products lists seeded products", async () => {
    await seedProduct({ slug: "ap-1", name: "Admin Product 1" });
    await seedProduct({ slug: "ap-2", name: "Admin Product 2" });
    const res = await request(app).get("/api/admin/products");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((p: { slug: string }) => p.slug).sort()).toEqual([
      "ap-1",
      "ap-2",
    ]);
  });

  it("GET /admin/discount-codes lists seeded codes", async () => {
    await seedDiscount({ code: "ADMIN10" });
    const res = await request(app).get("/api/admin/discount-codes");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].code).toBe("ADMIN10");
  });
});
