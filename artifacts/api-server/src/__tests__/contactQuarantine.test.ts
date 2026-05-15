import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { db, resetDb } from "./testDb";
import { makeApp } from "./helpers";
import { contactQuarantineTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const forwardMock = vi.hoisted(() =>
  vi.fn<(arg: unknown) => Promise<void>>(async () => {}),
);

vi.mock("../lib/email", () => ({
  sendOrderConfirmation: vi.fn(async () => {}),
  sendAbandonedCartEmail: vi.fn(async () => {}),
  sendLowStockDigest: vi.fn(async () => {}),
  sendWelcomeEmail: vi.fn(async () => {}),
  sendShipmentEmail: vi.fn(async () => {}),
  forwardQuarantinedContactEmail: forwardMock,
  addToResendAudience: vi.fn(async () => ({ contactId: null })),
  removeFromResendAudience: vi.fn(async () => {}),
  buildTrackingUrl: () => null,
  STORE_NAME: "Test",
}));

vi.mock("../lib/easypost", () => ({
  getEasyPost: () => ({ Shipment: { buy: vi.fn(), create: vi.fn() } }),
  isEasyPostConfigured: () => false,
  FROM_ADDRESS: {},
}));

vi.mock("../lib/metrics", () => ({
  getStripeWebhookHealth: async () => ({ lastReceivedAt: null, healthy: true }),
  recordStripeWebhookReceived: vi.fn(async () => {}),
}));

import * as clerk from "@clerk/express";
const { __setAuth } = clerk as unknown as {
  __setAuth: (userId: string | null, user?: unknown) => void;
};

const adminRouter = (await import("../routes/admin")).default;
const { cleanupContactQuarantine } = await import(
  "../lib/contactQuarantineCleanup"
);

const app = makeApp((r) => {
  r.use(adminRouter);
});

const ADMIN_USER = {
  emailAddresses: [{ emailAddress: "admin@example.com" }],
};

async function seedQuarantine(opts?: {
  expiresAt?: Date;
  reasons?: string[];
  email?: string;
  subject?: string;
}): Promise<number> {
  const [row] = await db
    .insert(contactQuarantineTable)
    .values({
      name: "Spammy Sam",
      email: opts?.email ?? "spammy@example.com",
      subject: opts?.subject ?? "Cheap deals!!",
      message: "Visit https://a.com https://b.com https://c.com now",
      reasons: opts?.reasons ?? ["too_many_links"],
      ip: "203.0.113.7",
      expiresAt:
        opts?.expiresAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
    })
    .returning();
  return row.id;
}

describe("admin contact-quarantine routes", () => {
  beforeEach(async () => {
    await resetDb();
    forwardMock.mockClear();
    __setAuth("user_admin", ADMIN_USER);
    process.env.CONTACT_OWNER_EMAIL = "owner@example.com";
  });

  describe("GET /admin/contact-quarantine", () => {
    it("returns 401 when unauthenticated", async () => {
      __setAuth(null);
      const res = await request(app).get("/api/admin/contact-quarantine");
      expect(res.status).toBe(401);
    });

    it("lists quarantined items most-recent first", async () => {
      const olderId = await seedQuarantine({ subject: "older" });
      // Ensure ordering by createdAt desc is stable across the two rows.
      await new Promise((r) => setTimeout(r, 5));
      const newerId = await seedQuarantine({ subject: "newer" });

      const res = await request(app).get("/api/admin/contact-quarantine");
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].id).toBe(newerId);
      expect(res.body.items[1].id).toBe(olderId);
      expect(res.body.items[0].reasons).toContain("too_many_links");
      expect(res.body.items[0].forwardedAt).toBeNull();
    });

    it("evicts expired rows on read", async () => {
      const expiredId = await seedQuarantine({
        expiresAt: new Date(Date.now() - 60_000),
      });
      const liveId = await seedQuarantine();

      const res = await request(app).get("/api/admin/contact-quarantine");
      expect(res.status).toBe(200);
      const ids = res.body.items.map((i: { id: number }) => i.id);
      expect(ids).toContain(liveId);
      expect(ids).not.toContain(expiredId);
    });
  });

  describe("POST /admin/contact-quarantine/:id/forward", () => {
    it("calls Resend (via forwardQuarantinedContactEmail) and stamps forwardedAt", async () => {
      const id = await seedQuarantine();

      const before = await db
        .select()
        .from(contactQuarantineTable)
        .where(eq(contactQuarantineTable.id, id));
      expect(before[0].forwardedAt).toBeNull();

      const res = await request(app).post(
        `/api/admin/contact-quarantine/${id}/forward`,
      );
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(id);
      expect(typeof res.body.forwardedAt).toBe("string");

      expect(forwardMock).toHaveBeenCalledTimes(1);
      const arg = forwardMock.mock.calls[0][0] as {
        to: string;
        email: string;
        subject: string;
        reasons: string[];
      };
      expect(arg.to).toBe("owner@example.com");
      expect(arg.email).toBe("spammy@example.com");
      expect(arg.subject).toBe("Cheap deals!!");
      expect(arg.reasons).toContain("too_many_links");

      const after = await db
        .select()
        .from(contactQuarantineTable)
        .where(eq(contactQuarantineTable.id, id));
      expect(after[0].forwardedAt).toBeInstanceOf(Date);
    });

    it("returns 404 when the row does not exist", async () => {
      const res = await request(app).post(
        "/api/admin/contact-quarantine/9999/forward",
      );
      expect(res.status).toBe(404);
      expect(forwardMock).not.toHaveBeenCalled();
    });

    it("returns 503 when no owner email is configured", async () => {
      delete process.env.CONTACT_OWNER_EMAIL;
      delete process.env.RESEND_FROM_EMAIL;
      const id = await seedQuarantine();
      const res = await request(app).post(
        `/api/admin/contact-quarantine/${id}/forward`,
      );
      expect(res.status).toBe(503);
      expect(forwardMock).not.toHaveBeenCalled();
    });

    it("returns 502 and does not stamp forwardedAt when sending fails", async () => {
      forwardMock.mockRejectedValueOnce(new Error("resend down"));
      const id = await seedQuarantine();
      const res = await request(app).post(
        `/api/admin/contact-quarantine/${id}/forward`,
      );
      expect(res.status).toBe(502);
      const after = await db
        .select()
        .from(contactQuarantineTable)
        .where(eq(contactQuarantineTable.id, id));
      expect(after[0].forwardedAt).toBeNull();
    });
  });

  describe("DELETE /admin/contact-quarantine/:id", () => {
    it("removes the row and returns 204", async () => {
      const id = await seedQuarantine();
      const res = await request(app).delete(
        `/api/admin/contact-quarantine/${id}`,
      );
      expect(res.status).toBe(204);
      const remaining = await db
        .select()
        .from(contactQuarantineTable)
        .where(eq(contactQuarantineTable.id, id));
      expect(remaining).toHaveLength(0);
    });

    it("is a no-op (204) when the id does not exist", async () => {
      const res = await request(app).delete(
        "/api/admin/contact-quarantine/9999",
      );
      expect(res.status).toBe(204);
    });
  });
});

describe("cleanupContactQuarantine", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("deletes rows whose expiresAt is in the past and keeps fresh ones", async () => {
    const expiredA = await seedQuarantine({
      expiresAt: new Date(Date.now() - 60_000),
      subject: "expired-a",
    });
    const expiredB = await seedQuarantine({
      expiresAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      subject: "expired-b",
    });
    const fresh = await seedQuarantine({
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      subject: "fresh",
    });

    const removed = await cleanupContactQuarantine();
    expect(removed).toBe(2);

    const rows = await db.select().from(contactQuarantineTable);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(fresh);
    expect(ids).not.toContain(expiredA);
    expect(ids).not.toContain(expiredB);
  });

  it("returns 0 when nothing has expired", async () => {
    await seedQuarantine();
    await seedQuarantine();
    const removed = await cleanupContactQuarantine();
    expect(removed).toBe(0);
    const rows = await db.select().from(contactQuarantineTable);
    expect(rows).toHaveLength(2);
  });
});
