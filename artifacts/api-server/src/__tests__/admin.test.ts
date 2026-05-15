import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { db, resetDb } from "./testDb";
import { makeApp, seedDiscount, seedProduct } from "./helpers";
import { ordersTable, blogPostsTable } from "@workspace/db";

vi.mock("../lib/email", () => ({
  sendOrderConfirmation: vi.fn(async () => {}),
  sendAbandonedCartEmail: vi.fn(async () => {}),
  sendLowStockDigest: vi.fn(async () => {}),
  sendWelcomeEmail: vi.fn(async () => {}),
  sendShipmentEmail: vi.fn(async () => {}),
  addToResendAudience: vi.fn(async () => ({ contactId: null })),
  removeFromResendAudience: vi.fn(async () => {}),
  buildTrackingUrl: (_carrier: string | null, code: string | null) =>
    code ? `https://track.test/${code}` : null,
  STORE_NAME: "Test",
}));

const easypostState = vi.hoisted(() => ({
  configured: false,
  buyImpl: vi.fn(async (_shipmentId: string, _rateId: string) => ({
    id: "shp_default",
    tracking_code: "TRK-DEFAULT",
    postage_label: { label_url: "https://labels.test/default.pdf" },
    selected_rate: { carrier: "Carrier" },
  })),
  createImpl: vi.fn(
    async (
      _input: unknown,
    ): Promise<{
      id: string;
      rates: Array<{
        id: string;
        carrier: string;
        service: string;
        rate: string;
        currency?: string;
        delivery_days?: number | null;
      }>;
    }> => ({
      id: "shp_created",
      rates: [],
    }),
  ),
}));

vi.mock("../lib/easypost", () => ({
  getEasyPost: () => ({
    Shipment: {
      buy: (shipmentId: string, rateId: string) =>
        easypostState.buyImpl(shipmentId, rateId),
      create: (input: unknown) => easypostState.createImpl(input),
    },
  }),
  isEasyPostConfigured: () => easypostState.configured,
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
const { sendShipmentEmail } = await import("../lib/email");
const sendShipmentEmailMock = sendShipmentEmail as unknown as ReturnType<
  typeof vi.fn
>;

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

// ---------------------------------------------------------------------------
// POST /api/admin/orders/labels/merge-pdf is the server side of the bulk
// "Buy cheapest label for selected" flow on the admin Orders page. The bulk
// e2e covers the frontend contract (one merge call, one PDF download) — this
// suite covers the server's content-type branching: a PDF labelUrl is
// passed through page-by-page via pdf-lib, while a PNG labelUrl is embedded
// onto a fresh 4x6 page. Both branches must end up in the same merged PDF.
// ---------------------------------------------------------------------------
describe("POST /admin/orders/labels/merge-pdf", () => {
  let originalFetch: typeof globalThis.fetch;
  let pngLabelBytes: Uint8Array;
  let pdfLabelBytes: Uint8Array;

  beforeEach(async () => {
    await resetDb();
    __setAuth("user_admin", ADMIN_USER);

    const { PDFDocument, rgb } = await import("pdf-lib");

    // Build a real one-page PDF that the merger will copyPages() out of.
    const srcPdf = await PDFDocument.create();
    const pdfPage = srcPdf.addPage([288, 432]);
    pdfPage.drawText("PDF LABEL", { x: 24, y: 200, size: 18, color: rgb(0, 0, 0) });
    pdfLabelBytes = await srcPdf.save();

    // Build a real PNG by embedding a single-pixel PNG into a tiny PDF and
    // then asking pdf-lib for the original PNG bytes. Since pdf-lib only
    // emits PDFs, we hand-craft a minimal valid 1x1 PNG instead.
    pngLabelBytes = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.endsWith(".pdf")) {
        return new Response(pdfLabelBytes, {
          status: 200,
          headers: { "content-type": "application/pdf" },
        });
      }
      if (url.endsWith(".png")) {
        return new Response(pngLabelBytes, {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      return new Response("not found", { status: 404 });
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function seedPaidOrderWithLabel(labelUrl: string): Promise<number> {
    const [order] = await db
      .insert(ordersTable)
      .values({
        email: "buyer@example.com",
        status: "shipped",
        subtotalCents: 5_000,
        totalCents: 5_000,
        currency: "usd",
        labelUrl,
        trackingCode: `TRK-${Math.floor(Math.random() * 1_000_000)}`,
      })
      .returning();
    return order.id;
  }

  it("merges a mix of PDF + PNG labels into a single PDF (both branches)", async () => {
    const pdfOrderId = await seedPaidOrderWithLabel("https://labels.test/a.pdf");
    const pngOrderId = await seedPaidOrderWithLabel("https://labels.test/b.png");

    const res = await request(app)
      .post("/api/admin/orders/labels/merge-pdf")
      .send({ orderIds: [pdfOrderId, pngOrderId] })
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (c: Buffer) => chunks.push(c));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toMatch(
      /attachment; filename="shipping-labels-2\.pdf"/,
    );

    const out = res.body as Buffer;
    expect(out.length).toBeGreaterThan(0);
    expect(out.subarray(0, 4).toString("utf8")).toBe("%PDF");

    // The merged document has at least 2 pages: 1 copied from the source
    // PDF + 1 freshly created for the embedded PNG.
    const { PDFDocument } = await import("pdf-lib");
    const merged = await PDFDocument.load(out);
    expect(merged.getPageCount()).toBeGreaterThanOrEqual(2);
  });

  it("returns 404 when none of the requested orders has a labelUrl", async () => {
    const [order] = await db
      .insert(ordersTable)
      .values({
        email: "buyer@example.com",
        status: "paid",
        subtotalCents: 5_000,
        totalCents: 5_000,
        currency: "usd",
      })
      .returning();
    const res = await request(app)
      .post("/api/admin/orders/labels/merge-pdf")
      .send({ orderIds: [order.id] });
    expect(res.status).toBe(404);
  });

  it("rejects an empty orderIds list with 400", async () => {
    const res = await request(app)
      .post("/api/admin/orders/labels/merge-pdf")
      .send({ orderIds: [] });
    expect(res.status).toBe(400);
  });

  it("returns 502 when fetching one of the labels fails", async () => {
    const orderId = await seedPaidOrderWithLabel("https://labels.test/x.pdf");
    globalThis.fetch = (async () =>
      new Response("boom", { status: 500 })) as typeof globalThis.fetch;
    const res = await request(app)
      .post("/api/admin/orders/labels/merge-pdf")
      .send({ orderIds: [orderId] });
    expect(res.status).toBe(502);
  });
});

describe("GET /admin/blog/posts/by-slug/:slug (draft preview)", () => {
  beforeEach(async () => {
    await resetDb();
    __setAuth(null);
  });

  async function seedDraft() {
    await db.insert(blogPostsTable).values({
      slug: "secret-draft",
      title: "Secret Draft",
      excerpt: "shh",
      content: "draft body",
      published: false,
    });
  }

  it("returns 401 when unauthenticated", async () => {
    await seedDraft();
    const res = await request(app).get(
      "/api/admin/blog/posts/by-slug/secret-draft",
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for a signed-in non-admin", async () => {
    __setAuth("user_shopper", NON_ADMIN_USER);
    await seedDraft();
    const res = await request(app).get(
      "/api/admin/blog/posts/by-slug/secret-draft",
    );
    expect(res.status).toBe(403);
  });

  it("returns the unpublished post for an admin", async () => {
    __setAuth("user_admin", ADMIN_USER);
    await seedDraft();
    const res = await request(app).get(
      "/api/admin/blog/posts/by-slug/secret-draft",
    );
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe("secret-draft");
    expect(res.body.published).toBe(false);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("returns 404 when no such post exists", async () => {
    __setAuth("user_admin", ADMIN_USER);
    const res = await request(app).get(
      "/api/admin/blog/posts/by-slug/missing",
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Customers + merge-into-customer — admins can consolidate every guest order
// placed under an email onto a single customer record from the per-email view.
// ---------------------------------------------------------------------------
describe("admin customers + merge-into-customer", () => {
  beforeEach(async () => {
    await resetDb();
    __setAuth("user_admin", ADMIN_USER);
  });

  it("creates, lists, and merges every order for an email into a customer", async () => {
    await db.insert(ordersTable).values([
      {
        email: "buyer@example.com",
        status: "paid",
        subtotalCents: 1000,
        totalCents: 1000,
        currency: "usd",
      },
      {
        email: "buyer@example.com",
        status: "paid",
        subtotalCents: 2000,
        totalCents: 2000,
        currency: "usd",
      },
      {
        email: "other@example.com",
        status: "paid",
        subtotalCents: 5000,
        totalCents: 5000,
        currency: "usd",
      },
    ]);

    const created = await request(app)
      .post("/api/admin/customers")
      .send({ email: "Buyer@Example.com", name: "Jane Buyer" });
    expect(created.status).toBe(201);
    expect(created.body.email).toBe("buyer@example.com");
    expect(created.body.name).toBe("Jane Buyer");
    expect(created.body.orderCount).toBe(0);
    const customerId = created.body.id as number;

    const dupe = await request(app)
      .post("/api/admin/customers")
      .send({ email: "buyer@example.com" });
    expect(dupe.status).toBe(409);

    const merge = await request(app)
      .post("/api/admin/orders/merge-into-customer")
      .send({ email: "buyer@example.com", customerId });
    expect(merge.status).toBe(200);
    expect(merge.body.mergedCount).toBe(2);
    expect(merge.body.customer.id).toBe(customerId);
    expect(merge.body.customer.orderCount).toBe(2);

    const byEmail = await request(app).get(
      "/api/admin/orders/by-email/buyer%40example.com",
    );
    expect(byEmail.status).toBe(200);
    expect(byEmail.body.orders).toHaveLength(2);
    for (const o of byEmail.body.orders as Array<{ customerId: number }>) {
      expect(o.customerId).toBe(customerId);
    }

    const otherByEmail = await request(app).get(
      "/api/admin/orders/by-email/other%40example.com",
    );
    expect(otherByEmail.body.orders[0].customerId).toBeNull();

    const list = await request(app).get("/api/admin/customers?search=buyer");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(customerId);
    expect(list.body[0].orderCount).toBe(2);
  });

  it("rejects merging into a missing customer", async () => {
    const res = await request(app)
      .post("/api/admin/orders/merge-into-customer")
      .send({ email: "buyer@example.com", customerId: 99999 });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/orders/:id/fulfill — when EasyPost is configured, the real
// carrier from the bought shipment's selected_rate must be forwarded into the
// shipment email so customers see "USPS"/"UPS"/"FedEx" instead of the
// "Carrier" fallback.
// ---------------------------------------------------------------------------
describe("POST /admin/orders/:id/fulfill (EasyPost configured)", () => {
  beforeEach(async () => {
    await resetDb();
    __setAuth("user_admin", ADMIN_USER);
    sendShipmentEmailMock.mockClear();
    easypostState.configured = true;
    easypostState.buyImpl.mockReset();
    easypostState.createImpl.mockReset();
    easypostState.createImpl.mockResolvedValue({
      id: "shp_new",
      rates: [],
    });
  });

  afterEach(() => {
    easypostState.configured = false;
  });

  it("forwards the bought shipment's carrier into sendShipmentEmail", async () => {
    easypostState.buyImpl.mockResolvedValue({
      id: "shp_bought_123",
      tracking_code: "9400111899223197428490",
      postage_label: { label_url: "https://labels.test/usps.pdf" },
      selected_rate: { carrier: "USPS" },
    });

    const [order] = await db
      .insert(ordersTable)
      .values({
        email: "buyer@example.com",
        status: "paid",
        subtotalCents: 5_000,
        totalCents: 5_000,
        currency: "usd",
        shippingAddress: {
          name: "Jane Buyer",
          street1: "123 Main St",
          street2: null,
          city: "Brooklyn",
          state: "NY",
          zip: "11201",
          country: "US",
          phone: null,
        },
      })
      .returning();

    const res = await request(app)
      .post(`/api/admin/orders/${order.id}/fulfill`)
      .send({ shipmentId: "shp_existing", shippingRateId: "rate_usps_priority" });

    expect(res.status).toBe(200);
    expect(easypostState.buyImpl).toHaveBeenCalledWith(
      "shp_existing",
      "rate_usps_priority",
    );
    expect(sendShipmentEmailMock).toHaveBeenCalledTimes(1);
    const arg = sendShipmentEmailMock.mock.calls[0][0] as {
      to: string;
      orderId: number;
      trackingCode: string;
      carrier: string;
    };
    expect(arg.carrier).toBe("USPS");
    expect(arg.carrier).not.toBe("Carrier");
    expect(arg.trackingCode).toBe("9400111899223197428490");
    expect(arg.to).toBe("buyer@example.com");
    expect(arg.orderId).toBe(order.id);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/orders/:id/shipping-rates — when EasyPost is configured,
// the live branch must map shipment.rates into our shape (carrier, service,
// amountCents from parseFloat(rate)*100, lowercased currency, deliveryDays).
// ---------------------------------------------------------------------------
describe("POST /admin/orders/:id/shipping-rates (EasyPost configured)", () => {
  beforeEach(async () => {
    await resetDb();
    __setAuth("user_admin", ADMIN_USER);
    easypostState.configured = true;
    easypostState.createImpl.mockReset();
  });

  afterEach(() => {
    easypostState.configured = false;
  });

  it("maps EasyPost rates into the response shape", async () => {
    easypostState.createImpl.mockResolvedValue({
      id: "shp_rates_abc",
      rates: [
        {
          id: "rate_usps_priority",
          carrier: "USPS",
          service: "Priority",
          rate: "7.45",
          currency: "USD",
          delivery_days: 3,
        },
        {
          id: "rate_ups_ground",
          carrier: "UPS",
          service: "Ground",
          rate: "12.99",
          currency: "usd",
          delivery_days: null,
        },
        {
          id: "rate_dhl_express",
          carrier: "DHL",
          service: "Express",
          rate: "25.50",
          currency: "CAD",
          delivery_days: 2,
        },
      ],
    });

    const [order] = await db
      .insert(ordersTable)
      .values({
        email: "buyer@example.com",
        status: "paid",
        subtotalCents: 5_000,
        totalCents: 5_000,
        currency: "usd",
        shippingAddress: {
          name: "Jane Buyer",
          street1: "123 Main St",
          street2: null,
          city: "Brooklyn",
          state: "NY",
          zip: "11201",
          country: "US",
          phone: null,
        },
      })
      .returning();

    const res = await request(app)
      .post(`/api/admin/orders/${order.id}/shipping-rates`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.shipmentId).toBe("shp_rates_abc");
    expect(res.body.rates).toEqual([
      {
        id: "rate_usps_priority",
        carrier: "USPS",
        service: "Priority",
        amountCents: 745,
        currency: "usd",
        deliveryDays: 3,
      },
      {
        id: "rate_ups_ground",
        carrier: "UPS",
        service: "Ground",
        amountCents: 1299,
        currency: "usd",
        deliveryDays: null,
      },
      {
        id: "rate_dhl_express",
        carrier: "DHL",
        service: "Express",
        amountCents: 2550,
        currency: "cad",
        deliveryDays: 2,
      },
    ]);
    expect(easypostState.createImpl).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when the order has no shipping address", async () => {
    const [order] = await db
      .insert(ordersTable)
      .values({
        email: "buyer@example.com",
        status: "paid",
        subtotalCents: 5_000,
        totalCents: 5_000,
        currency: "usd",
        shippingAddress: null,
      })
      .returning();

    const res = await request(app)
      .post(`/api/admin/orders/${order.id}/shipping-rates`)
      .send({});

    expect(res.status).toBe(400);
    expect(easypostState.createImpl).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/orders/:id/shipping-rates — when EasyPost is NOT configured,
// the handler must return a hardcoded flat-rate fallback (Standard $6.95 /
// Express $15.95) so the admin Fulfill modal still works in local/dev envs.
// ---------------------------------------------------------------------------
describe("POST /admin/orders/:id/shipping-rates (EasyPost not configured)", () => {
  beforeEach(async () => {
    await resetDb();
    __setAuth("user_admin", ADMIN_USER);
    easypostState.configured = false;
    easypostState.createImpl.mockReset();
  });

  it("returns the flat-rate fallback without calling EasyPost", async () => {
    const [order] = await db
      .insert(ordersTable)
      .values({
        email: "buyer@example.com",
        status: "paid",
        subtotalCents: 5_000,
        totalCents: 5_000,
        currency: "usd",
        shippingAddress: {
          name: "Jane Buyer",
          street1: "123 Main St",
          street2: null,
          city: "Brooklyn",
          state: "NY",
          zip: "11201",
          country: "US",
          phone: null,
        },
      })
      .returning();

    const res = await request(app)
      .post(`/api/admin/orders/${order.id}/shipping-rates`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.shipmentId).toBeNull();
    expect(res.body.rates).toEqual([
      {
        id: "flat-standard",
        carrier: "Standard",
        service: "Ground (5-7 days)",
        amountCents: 695,
        currency: "usd",
        deliveryDays: 6,
      },
      {
        id: "flat-express",
        carrier: "Express",
        service: "Express (2-3 days)",
        amountCents: 1595,
        currency: "usd",
        deliveryDays: 3,
      },
    ]);
    expect(easypostState.createImpl).not.toHaveBeenCalled();
  });
});
