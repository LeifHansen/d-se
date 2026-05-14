import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, resetDb } from "./testDb";
import { newsletterSubscribersTable } from "@workspace/db";
import { makeApp } from "./helpers";

const emailMock = vi.hoisted(() => ({
  addToResendAudience: vi.fn(async () => ({ contactId: "contact_123" })),
  removeFromResendAudience: vi.fn(async () => {}),
  sendWelcomeEmail: vi.fn(async () => {}),
}));

vi.mock("../lib/email", () => ({
  addToResendAudience: emailMock.addToResendAudience,
  removeFromResendAudience: emailMock.removeFromResendAudience,
  sendWelcomeEmail: emailMock.sendWelcomeEmail,
  sendOrderConfirmation: vi.fn(async () => {}),
  sendAbandonedCartEmail: vi.fn(async () => {}),
  sendLowStockDigest: vi.fn(async () => {}),
  sendShipmentEmail: vi.fn(async () => {}),
  STORE_NAME: "Test",
}));

import * as clerk from "@clerk/express";
const { __setAuth } = clerk as unknown as {
  __setAuth: (userId: string | null, user?: unknown) => void;
};

const newsletterRouter = (await import("../routes/newsletter")).default;

const app = makeApp((r) => {
  r.use(newsletterRouter);
});

describe("POST /api/newsletter/subscribe", () => {
  beforeEach(async () => {
    await resetDb();
    emailMock.addToResendAudience.mockClear();
    emailMock.sendWelcomeEmail.mockClear();
  });

  it("creates a new active subscriber", async () => {
    const res = await request(app)
      .post("/api/newsletter/subscribe")
      .send({ email: "Hello@Example.com", source: "footer" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, alreadySubscribed: false });

    const rows = await db.select().from(newsletterSubscribersTable);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("hello@example.com");
    expect(rows[0].status).toBe("active");
    expect(rows[0].source).toBe("footer");
    expect(rows[0].resendContactId).toBe("contact_123");
    expect(rows[0].unsubscribeToken).toBeTruthy();

    expect(emailMock.addToResendAudience).toHaveBeenCalledTimes(1);
    expect(emailMock.sendWelcomeEmail).toHaveBeenCalledTimes(1);
  });

  it("returns alreadySubscribed for an existing active email without re-sending welcome", async () => {
    await db.insert(newsletterSubscribersTable).values({
      email: "dup@example.com",
      status: "active",
      unsubscribeToken: "tok-existing",
    });
    const res = await request(app)
      .post("/api/newsletter/subscribe")
      .send({ email: "dup@example.com" });
    expect(res.body).toEqual({ ok: true, alreadySubscribed: true });
    expect(emailMock.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("re-activates a previously unsubscribed subscriber", async () => {
    await db.insert(newsletterSubscribersTable).values({
      email: "back@example.com",
      status: "unsubscribed",
      unsubscribeToken: "tok-back",
      unsubscribedAt: new Date(),
    });
    const res = await request(app)
      .post("/api/newsletter/subscribe")
      .send({ email: "back@example.com" });
    expect(res.body.alreadySubscribed).toBe(true);

    const [row] = await db
      .select()
      .from(newsletterSubscribersTable)
      .where(eq(newsletterSubscribersTable.email, "back@example.com"));
    expect(row.status).toBe("active");
    expect(row.unsubscribedAt).toBeNull();
  });

  it("rejects an invalid email with 400", async () => {
    const res = await request(app)
      .post("/api/newsletter/subscribe")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("shadow-accepts a disposable-domain signup without creating a row", async () => {
    const res = await request(app)
      .post("/api/newsletter/subscribe")
      .send({ email: "spammer@mailinator.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, alreadySubscribed: true });
    const rows = await db.select().from(newsletterSubscribersTable);
    expect(rows).toHaveLength(0);
    expect(emailMock.addToResendAudience).not.toHaveBeenCalled();
    expect(emailMock.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("shadow-accepts a blocked-TLD signup without creating a row", async () => {
    const res = await request(app)
      .post("/api/newsletter/subscribe")
      .send({ email: "bot@evil.xyz" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, alreadySubscribed: true });
    const rows = await db.select().from(newsletterSubscribersTable);
    expect(rows).toHaveLength(0);
  });

  it("shadow-accepts after the per-IP burst threshold is exceeded", async () => {
    process.env.NEWSLETTER_SPAM_RATE_MAX = "3";
    try {
      for (let i = 0; i < 3; i++) {
        const ok = await request(app)
          .post("/api/newsletter/subscribe")
          .send({ email: `real${i}@example.com` });
        expect(ok.status).toBe(200);
        expect(ok.body.alreadySubscribed).toBe(false);
      }
      const burst = await request(app)
        .post("/api/newsletter/subscribe")
        .send({ email: "fourth@example.com" });
      expect(burst.status).toBe(200);
      expect(burst.body).toEqual({ ok: true, alreadySubscribed: true });
      const rows = await db.select().from(newsletterSubscribersTable);
      expect(rows.map((r) => r.email).sort()).toEqual([
        "real0@example.com",
        "real1@example.com",
        "real2@example.com",
      ]);
    } finally {
      delete process.env.NEWSLETTER_SPAM_RATE_MAX;
    }
  });
});

describe("POST /api/newsletter/unsubscribe", () => {
  beforeEach(async () => {
    await resetDb();
    emailMock.removeFromResendAudience.mockClear();
  });

  it("flips the row to unsubscribed for a valid token", async () => {
    await db.insert(newsletterSubscribersTable).values({
      email: "bye@example.com",
      status: "active",
      unsubscribeToken: "tok-bye-1234",
    });
    const res = await request(app)
      .post("/api/newsletter/unsubscribe")
      .send({ token: "tok-bye-1234" });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("bye@example.com");
    const [row] = await db
      .select()
      .from(newsletterSubscribersTable)
      .where(eq(newsletterSubscribersTable.email, "bye@example.com"));
    expect(row.status).toBe("unsubscribed");
    expect(row.unsubscribedAt).not.toBeNull();
    expect(emailMock.removeFromResendAudience).toHaveBeenCalledTimes(1);
  });

  it("returns ok with email=null for an unknown token (no enumeration)", async () => {
    const res = await request(app)
      .post("/api/newsletter/unsubscribe")
      .send({ token: "does-not-exist" });
    expect(res.status).toBe(200);
    expect(res.body.email).toBeNull();
  });
});

describe("admin newsletter endpoints — auth gating", () => {
  beforeEach(async () => {
    await resetDb();
    __setAuth(null);
  });

  it("401 unauthenticated on list", async () => {
    const res = await request(app).get("/api/admin/newsletter/subscribers");
    expect(res.status).toBe(401);
  });

  it("403 when signed in as a non-admin email", async () => {
    __setAuth("user_not_admin", {
      emailAddresses: [{ emailAddress: "shopper@example.com" }],
    });
    const res = await request(app).get("/api/admin/newsletter/subscribers");
    expect(res.status).toBe(403);
  });

  it("200 for an admin and includes the subscriber", async () => {
    await db.insert(newsletterSubscribersTable).values({
      email: "ada@example.com",
      status: "active",
      unsubscribeToken: "tok-ada",
    });
    __setAuth("user_admin", {
      emailAddresses: [{ emailAddress: "admin@example.com" }],
    });
    const res = await request(app).get("/api/admin/newsletter/subscribers");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].email).toBe("ada@example.com");
  });
});
