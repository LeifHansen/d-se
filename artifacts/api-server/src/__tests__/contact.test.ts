import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { resetDb, db } from "./testDb";
import { contactRateLimitsTable, contactQuarantineTable } from "@workspace/db";
import { makeApp } from "./helpers";

type ResendSendArg = {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  html: string;
};
const resendSendMock = vi.hoisted(() =>
  vi.fn<(arg: unknown) => Promise<{ id: string }>>(async () => ({
    id: "msg_1",
  })),
);

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSendMock };
  },
}));

const contactRouter = (await import("../routes/contact")).default;

const app = makeApp((r) => {
  r.use(contactRouter);
});

const validBody = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  subject: "Hello",
  message: "I have a question about your products.",
  captchaToken: "ok-token",
};

let originalFetch: typeof globalThis.fetch;

function installTurnstileFetch(success: boolean): void {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("challenges.cloudflare.com")) {
      return new Response(JSON.stringify({ success }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/v2/connection")) {
      return new Response(
        JSON.stringify({
          items: [
            {
              settings: {
                api_key: "re_test_key",
                from_email: "from@example.com",
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("not mocked", { status: 500 });
  }) as typeof globalThis.fetch;
}

describe("POST /api/contact", () => {
  beforeEach(async () => {
    await resetDb();
    resendSendMock.mockClear();
    originalFetch = globalThis.fetch;
    installTurnstileFetch(true);
    process.env.REPLIT_CONNECTORS_HOSTNAME = "connectors.test";
    process.env.REPL_IDENTITY = "test-identity";
    process.env.CONTACT_OWNER_EMAIL = "owner@example.com";
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.REPLIT_CONNECTORS_HOSTNAME;
    delete process.env.REPL_IDENTITY;
    delete process.env.CONTACT_OWNER_EMAIL;
  });

  it("rejects an invalid body with 400", async () => {
    const res = await request(app)
      .post("/api/contact")
      .send({ name: "", email: "not-email", subject: "", message: "" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when Turnstile verification fails", async () => {
    installTurnstileFetch(false);
    const res = await request(app).post("/api/contact").send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/human/i);
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("returns 503 when email creds are not configured", async () => {
    delete process.env.CONTACT_OWNER_EMAIL;
    delete process.env.REPLIT_CONNECTORS_HOSTNAME;
    const res = await request(app).post("/api/contact").send(validBody);
    expect(res.status).toBe(503);
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("sends the email on a fully valid submission", async () => {
    const res = await request(app).post("/api/contact").send(validBody);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const arg = resendSendMock.mock.calls[0][0] as ResendSendArg;
    expect(arg.to).toBe("owner@example.com");
    expect(arg.replyTo).toBe("ada@example.com");
    expect(arg.subject).toContain("Hello");
  });

  it("rate-limits after the 5th submission from the same IP", async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await request(app)
        .post("/api/contact")
        .send({ ...validBody, subject: `Hello ${i}` });
      expect(ok.status).toBe(200);
    }
    const blocked = await request(app).post("/api/contact").send(validBody);
    expect(blocked.status).toBe(429);
    expect(resendSendMock).toHaveBeenCalledTimes(5);
    const rows = await db.select().from(contactRateLimitsTable);
    expect(rows).toHaveLength(1);
    expect(rows[0].hits).toBeGreaterThanOrEqual(6);
  });

  it("shadow-accepts a message stuffed with links (200, no email sent)", async () => {
    const spammy = {
      ...validBody,
      message:
        "Visit https://a.com and https://b.com and https://c.com and https://d.com now!",
    };
    const res = await request(app).post("/api/contact").send(spammy);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(resendSendMock).not.toHaveBeenCalled();
    const quarantined = await db.select().from(contactQuarantineTable);
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0].email).toBe(spammy.email);
    expect(quarantined[0].reasons.length).toBeGreaterThan(0);
    expect(quarantined[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("shadow-accepts a message containing a blocked TLD", async () => {
    const spammy = {
      ...validBody,
      message: "Check out my site at evilshop.ru today!",
    };
    const res = await request(app).post("/api/contact").send(spammy);
    expect(res.status).toBe(200);
    expect(resendSendMock).not.toHaveBeenCalled();
  });
});
