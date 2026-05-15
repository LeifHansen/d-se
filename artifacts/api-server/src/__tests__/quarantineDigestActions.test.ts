import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { db, resetDb } from "./testDb";
import { contactQuarantineTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { makeApp } from "./helpers";

const forwardMock = vi.hoisted(() => vi.fn(async (_arg: unknown) => {}));

vi.mock("../lib/email", () => ({
  forwardQuarantinedContactEmail: forwardMock,
}));

const { default: router } = await import("../routes/quarantineDigestActions");
const { signDigestActionToken, verifyDigestActionToken } = await import(
  "../lib/quarantineDigestToken"
);

const app = makeApp((r) => r.use(router));

const HOUR = 60 * 60 * 1000;

async function seed(opts?: {
  forwardedAt?: Date | null;
}): Promise<number> {
  const now = new Date();
  const [row] = await db
    .insert(contactQuarantineTable)
    .values({
      name: "Spammy",
      email: "spammy@example.com",
      subject: "Hi",
      message: "buy now",
      reasons: ["link_blocked"],
      createdAt: now,
      expiresAt: new Date(now.getTime() + 14 * 24 * HOUR),
      forwardedAt: opts?.forwardedAt ?? null,
    })
    .returning();
  return row.id;
}

describe("quarantine digest action tokens", () => {
  beforeEach(() => {
    process.env.QUARANTINE_DIGEST_SECRET = "test-digest-secret";
  });
  afterEach(() => {
    delete process.env.QUARANTINE_DIGEST_SECRET;
  });

  it("round-trips a valid forward token", () => {
    const token = signDigestActionToken({ id: 42, action: "forward" });
    expect(token).toBeTypeOf("string");
    const decoded = verifyDigestActionToken(token!);
    expect(decoded).toEqual({ id: 42, action: "forward" });
  });

  it("rejects a tampered token", () => {
    const token = signDigestActionToken({ id: 42, action: "forward" })!;
    const tampered = token.slice(0, -2) + "aa";
    expect(verifyDigestActionToken(tampered)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signDigestActionToken({ id: 42, action: "forward" })!;
    process.env.QUARANTINE_DIGEST_SECRET = "different";
    expect(verifyDigestActionToken(token)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signDigestActionToken({
      id: 1,
      action: "discard",
      now: Date.now() - 30 * 24 * HOUR,
    })!;
    expect(verifyDigestActionToken(token)).toBeNull();
  });

  it("returns null when no secret is configured", () => {
    delete process.env.QUARANTINE_DIGEST_SECRET;
    delete process.env.SESSION_SECRET;
    expect(signDigestActionToken({ id: 1, action: "forward" })).toBeNull();
  });
});

describe("GET /api/quarantine-digest/forward", () => {
  beforeEach(async () => {
    await resetDb();
    forwardMock.mockClear();
    forwardMock.mockImplementation(async () => {});
    process.env.QUARANTINE_DIGEST_SECRET = "test-digest-secret";
    process.env.CONTACT_OWNER_EMAIL = "owner@example.com";
  });
  afterEach(() => {
    delete process.env.QUARANTINE_DIGEST_SECRET;
    delete process.env.CONTACT_OWNER_EMAIL;
  });

  it("forwards the message and marks it forwarded on first use", async () => {
    const id = await seed();
    const token = signDigestActionToken({ id, action: "forward" })!;
    const res = await request(app)
      .get("/api/quarantine-digest/forward")
      .query({ t: token });
    expect(res.status).toBe(200);
    expect(res.text).toContain("Forwarded to your inbox");
    expect(forwardMock).toHaveBeenCalledTimes(1);
    const [row] = await db
      .select()
      .from(contactQuarantineTable)
      .where(eq(contactQuarantineTable.id, id));
    expect(row.forwardedAt).not.toBeNull();
  });

  it("rejects an invalid or missing token", async () => {
    const res = await request(app)
      .get("/api/quarantine-digest/forward")
      .query({ t: "garbage" });
    expect(res.status).toBe(400);
    expect(res.text).toContain("no longer valid");
    expect(forwardMock).not.toHaveBeenCalled();
  });

  it("rejects a discard token at the forward endpoint", async () => {
    const id = await seed();
    const token = signDigestActionToken({ id, action: "discard" })!;
    const res = await request(app)
      .get("/api/quarantine-digest/forward")
      .query({ t: token });
    expect(res.status).toBe(400);
    expect(forwardMock).not.toHaveBeenCalled();
  });

  it("is single-use: a second click reports already forwarded and does not resend", async () => {
    const id = await seed();
    const token = signDigestActionToken({ id, action: "forward" })!;
    await request(app)
      .get("/api/quarantine-digest/forward")
      .query({ t: token });
    forwardMock.mockClear();
    const res = await request(app)
      .get("/api/quarantine-digest/forward")
      .query({ t: token });
    expect(res.status).toBe(200);
    expect(res.text).toContain("Already forwarded");
    expect(forwardMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the message has been deleted", async () => {
    const token = signDigestActionToken({ id: 9999, action: "forward" })!;
    const res = await request(app)
      .get("/api/quarantine-digest/forward")
      .query({ t: token });
    expect(res.status).toBe(404);
    expect(forwardMock).not.toHaveBeenCalled();
  });

  it("returns 503 when no owner email is configured", async () => {
    delete process.env.CONTACT_OWNER_EMAIL;
    delete process.env.RESEND_FROM_EMAIL;
    const id = await seed();
    const token = signDigestActionToken({ id, action: "forward" })!;
    const res = await request(app)
      .get("/api/quarantine-digest/forward")
      .query({ t: token });
    expect(res.status).toBe(503);
    expect(forwardMock).not.toHaveBeenCalled();
  });

  it("reports a 502 when the email helper throws", async () => {
    forwardMock.mockImplementationOnce(async () => {
      throw new Error("smtp boom");
    });
    const id = await seed();
    const token = signDigestActionToken({ id, action: "forward" })!;
    const res = await request(app)
      .get("/api/quarantine-digest/forward")
      .query({ t: token });
    expect(res.status).toBe(502);
    const [row] = await db
      .select()
      .from(contactQuarantineTable)
      .where(eq(contactQuarantineTable.id, id));
    expect(row.forwardedAt).toBeNull();
  });
});

describe("GET /api/quarantine-digest/discard", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.QUARANTINE_DIGEST_SECRET = "test-digest-secret";
  });
  afterEach(() => {
    delete process.env.QUARANTINE_DIGEST_SECRET;
  });

  it("deletes the row on first use", async () => {
    const id = await seed();
    const token = signDigestActionToken({ id, action: "discard" })!;
    const res = await request(app)
      .get("/api/quarantine-digest/discard")
      .query({ t: token });
    expect(res.status).toBe(200);
    expect(res.text).toContain("Message discarded");
    const rows = await db
      .select()
      .from(contactQuarantineTable)
      .where(eq(contactQuarantineTable.id, id));
    expect(rows).toHaveLength(0);
  });

  it("reports already discarded on a second click", async () => {
    const id = await seed();
    const token = signDigestActionToken({ id, action: "discard" })!;
    await request(app).get("/api/quarantine-digest/discard").query({ t: token });
    const res = await request(app)
      .get("/api/quarantine-digest/discard")
      .query({ t: token });
    expect(res.status).toBe(200);
    expect(res.text).toContain("Already discarded");
  });

  it("rejects a forward token at the discard endpoint", async () => {
    const id = await seed();
    const token = signDigestActionToken({ id, action: "forward" })!;
    const res = await request(app)
      .get("/api/quarantine-digest/discard")
      .query({ t: token });
    expect(res.status).toBe(400);
    const rows = await db
      .select()
      .from(contactQuarantineTable)
      .where(eq(contactQuarantineTable.id, id));
    expect(rows).toHaveLength(1);
  });
});
