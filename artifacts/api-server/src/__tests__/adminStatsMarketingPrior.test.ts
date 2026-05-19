import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { db, resetDb } from "./testDb";
import { makeApp } from "./helpers";
import { ordersTable, newsletterSubscribersTable } from "@workspace/db";

vi.mock("../lib/email", () => ({
  sendOrderConfirmation: vi.fn(async () => {}),
  sendAbandonedCartEmail: vi.fn(async () => {}),
  sendLowStockDigest: vi.fn(async () => {}),
  sendWelcomeEmail: vi.fn(async () => {}),
  sendShipmentEmail: vi.fn(async () => {}),
  addToResendAudience: vi.fn(async () => ({ contactId: null })),
  removeFromResendAudience: vi.fn(async () => {}),
  buildTrackingUrl: () => null,
  STORE_NAME: "Test",
}));

vi.mock("../lib/easypost", () => ({
  getEasyPost: () => ({
    Shipment: {
      buy: async () => ({}),
      create: async () => ({ id: "shp", rates: [] }),
    },
  }),
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

function midnightToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

async function seedPaidOrder(createdAt: Date, totalCents: number): Promise<void> {
  await db.insert(ordersTable).values({
    status: "paid",
    subtotalCents: totalCents,
    totalCents,
    createdAt,
  });
}

async function seedPendingOrder(createdAt: Date, totalCents: number): Promise<void> {
  await db.insert(ordersTable).values({
    status: "pending",
    subtotalCents: totalCents,
    totalCents,
    createdAt,
  });
}

async function seedSubscriber(email: string, createdAt: Date): Promise<void> {
  await db.insert(newsletterSubscribersTable).values({
    email,
    createdAt,
  });
}

describe.each([7, 30, 90])(
  "GET /api/admin/stats?marketingRange=%i — prior-window math",
  (N) => {
    beforeEach(async () => {
      await resetDb();
      __setAuth("user_admin", ADMIN_USER);
    });

    it("buckets orders & subscribers into the current vs prior window with correct boundaries", async () => {
      const todayMidnight = midnightToday();
      const marketingWindowStart = addDays(todayMidnight, -(N - 1));
      const priorWindowStart = addDays(marketingWindowStart, -N);
      const priorWindowEnd = marketingWindowStart;

      // --- Current window paid orders (should count in *current*, not prior) ---
      // Today (last day of current window).
      await seedPaidOrder(new Date(todayMidnight.getTime() + 60 * 60 * 1000), 1000);
      // First day of current window = priorWindowEnd exact midnight boundary
      // (gte current, lt prior -> falls in current only).
      await seedPaidOrder(new Date(marketingWindowStart), 2000);
      // Middle of current window.
      await seedPaidOrder(addDays(marketingWindowStart, Math.floor((N - 1) / 2)), 500);

      // --- Prior window paid orders ---
      // Exact priorWindowStart midnight (gte boundary -> in prior).
      await seedPaidOrder(new Date(priorWindowStart), 700);
      // Last possible instant of priorWindowEnd - 1ms (lt boundary -> in prior).
      await seedPaidOrder(new Date(priorWindowEnd.getTime() - 1), 300);
      // Middle of prior window.
      await seedPaidOrder(addDays(priorWindowStart, Math.floor(N / 2)), 1500);

      // --- Out-of-range paid orders (should count in neither) ---
      // 1ms before priorWindowStart.
      await seedPaidOrder(new Date(priorWindowStart.getTime() - 1), 9999);
      // Far future (shouldn't happen in practice, but proves the upper bound
      // of the prior window excludes anything >= marketingWindowStart from
      // the prior bucket).
      await seedPaidOrder(addDays(todayMidnight, 1), 8888);

      // --- Non-paid order inside prior window (status filter must exclude it) ---
      await seedPendingOrder(addDays(priorWindowStart, 1), 4242);

      // --- Subscribers (no status filter on stats query) ---
      // Current window.
      await seedSubscriber("cur-today@example.com", todayMidnight);
      await seedSubscriber("cur-start@example.com", new Date(marketingWindowStart));
      // Prior window: boundaries + middle.
      await seedSubscriber("prior-start@example.com", new Date(priorWindowStart));
      await seedSubscriber(
        "prior-end@example.com",
        new Date(priorWindowEnd.getTime() - 1),
      );
      await seedSubscriber(
        "prior-mid@example.com",
        addDays(priorWindowStart, Math.floor(N / 2)),
      );
      // Out-of-range subscriber: 1ms before priorWindowStart.
      await seedSubscriber(
        "too-old@example.com",
        new Date(priorWindowStart.getTime() - 1),
      );

      const res = await request(app).get(`/api/admin/stats?marketingRange=${N}`);
      expect(res.status).toBe(200);
      const marketing = res.body.marketing as {
        rangeDays: number;
        ordersInRange: number;
        revenueCentsInRange: number;
        subscribersInRange: number;
        priorOrdersInRange: number;
        priorRevenueCentsInRange: number;
        priorSubscribersInRange: number;
      };

      expect(marketing.rangeDays).toBe(N);

      // Current window: 3 paid orders (today, marketingWindowStart, middle).
      // The +1d future order is also >= marketingWindowStart, so it counts
      // here too — that's how the production query is written (no upper bound).
      expect(marketing.ordersInRange).toBe(4);
      expect(marketing.revenueCentsInRange).toBe(1000 + 2000 + 500 + 8888);

      // Prior window: 3 paid orders (start boundary, end-1ms boundary, middle).
      // The 1ms-before-priorWindowStart order and the pending order must be
      // excluded.
      expect(marketing.priorOrdersInRange).toBe(3);
      expect(marketing.priorRevenueCentsInRange).toBe(700 + 300 + 1500);

      // Subscribers in current window: 2 (today + marketingWindowStart).
      // The marketingWindowStart subscriber is on the shared boundary; the
      // route's gte(marketingWindowStart) places it in current, while the
      // prior query's lt(priorWindowEnd=marketingWindowStart) excludes it
      // from prior — exactly the bucketing we want to lock in.
      expect(marketing.subscribersInRange).toBe(2);

      // Prior window subscribers: 3 (start boundary, end-1ms boundary, middle).
      expect(marketing.priorSubscribersInRange).toBe(3);
    });
  },
);
