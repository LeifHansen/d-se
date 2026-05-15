import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDb } from "./testDb";
import { contactQuarantineTable } from "@workspace/db";

const sendQuarantineDigestMock = vi.hoisted(() =>
  vi.fn(async (_arg: unknown) => {}),
);

vi.mock("../lib/email", () => ({
  sendQuarantineDigest: sendQuarantineDigestMock,
}));

const {
  runQuarantineDigestOnce,
  getQuarantineDigestFrequency,
  setQuarantineDigestFrequency,
  triggerImmediateQuarantineDigestIfEnabled,
} = await import("../lib/quarantineDigest");

const HOUR = 60 * 60 * 1000;

async function seedEntry(opts: {
  name?: string;
  email?: string;
  subject?: string;
  reasons?: string[];
  createdAt: Date;
  forwardedAt?: Date | null;
}): Promise<void> {
  await db.insert(contactQuarantineTable).values({
    name: opts.name ?? "Spammy",
    email: opts.email ?? "spammy@example.com",
    subject: opts.subject ?? "Hi",
    message: "buy now",
    reasons: opts.reasons ?? ["link_blocked"],
    createdAt: opts.createdAt,
    expiresAt: new Date(opts.createdAt.getTime() + 14 * 24 * HOUR),
    forwardedAt: opts.forwardedAt ?? null,
  });
}

describe("runQuarantineDigestOnce", () => {
  beforeEach(async () => {
    await resetDb();
    sendQuarantineDigestMock.mockClear();
    process.env.ADMIN_EMAILS = "owner@example.com,ops@example.com";
  });

  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
    delete process.env.STOREFRONT_BASE_URL;
  });

  it("does not send when there are no recent quarantined messages", async () => {
    const now = new Date("2026-05-15T12:00:00Z");
    await seedEntry({ createdAt: new Date(now.getTime() - 48 * HOUR) });
    const sent = await runQuarantineDigestOnce(now);
    expect(sent).toBe(0);
    expect(sendQuarantineDigestMock).not.toHaveBeenCalled();
  });

  it("does not send when there are no admin recipients configured", async () => {
    delete process.env.ADMIN_EMAILS;
    const now = new Date("2026-05-15T12:00:00Z");
    await seedEntry({ createdAt: new Date(now.getTime() - 2 * HOUR) });
    const sent = await runQuarantineDigestOnce(now);
    expect(sent).toBe(0);
    expect(sendQuarantineDigestMock).not.toHaveBeenCalled();
  });

  it("skips messages already forwarded by the owner", async () => {
    const now = new Date("2026-05-15T12:00:00Z");
    await seedEntry({
      createdAt: new Date(now.getTime() - 2 * HOUR),
      forwardedAt: new Date(now.getTime() - HOUR),
    });
    const sent = await runQuarantineDigestOnce(now);
    expect(sent).toBe(0);
    expect(sendQuarantineDigestMock).not.toHaveBeenCalled();
  });

  it("emails each admin with the new unforwarded entries from the past 24h", async () => {
    process.env.STOREFRONT_BASE_URL = "https://shop.example.com";
    const now = new Date("2026-05-15T12:00:00Z");
    await seedEntry({
      name: "Recent A",
      createdAt: new Date(now.getTime() - 1 * HOUR),
    });
    await seedEntry({
      name: "Recent B",
      createdAt: new Date(now.getTime() - 5 * HOUR),
    });
    // Old one should be excluded
    await seedEntry({
      name: "Old",
      createdAt: new Date(now.getTime() - 48 * HOUR),
    });

    const sent = await runQuarantineDigestOnce(now);
    expect(sent).toBe(2);
    expect(sendQuarantineDigestMock).toHaveBeenCalledTimes(2);
    const recipients = sendQuarantineDigestMock.mock.calls.map(
      (c) => (c[0] as { to: string }).to,
    );
    expect(recipients.sort()).toEqual([
      "ops@example.com",
      "owner@example.com",
    ]);
    const arg = sendQuarantineDigestMock.mock.calls[0][0] as {
      items: Array<{ name: string }>;
      reviewUrl: string | null;
    };
    expect(arg.items).toHaveLength(2);
    expect(arg.items.map((i) => i.name).sort()).toEqual(["Recent A", "Recent B"]);
    expect(arg.reviewUrl).toBe(
      "https://shop.example.com/admin/contact-quarantine",
    );
  });

  it("respects a custom windowMs (weekly cadence covers the past 7 days)", async () => {
    const now = new Date("2026-05-15T12:00:00Z");
    await seedEntry({
      name: "Inside week",
      createdAt: new Date(now.getTime() - 5 * 24 * HOUR),
    });
    await seedEntry({
      name: "Outside week",
      createdAt: new Date(now.getTime() - 10 * 24 * HOUR),
    });
    const sent = await runQuarantineDigestOnce(now, {
      windowMs: 7 * 24 * HOUR,
    });
    expect(sent).toBe(1);
    const arg = sendQuarantineDigestMock.mock.calls[0][0] as {
      items: Array<{ name: string }>;
    };
    expect(arg.items.map((i) => i.name)).toEqual(["Inside week"]);
  });
});

describe("quarantine digest frequency setting", () => {
  beforeEach(async () => {
    await resetDb();
    sendQuarantineDigestMock.mockClear();
    process.env.ADMIN_EMAILS = "owner@example.com";
  });

  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
    delete process.env.NODE_ENV;
    delete process.env.DISABLE_CONTACT_QUARANTINE_DIGEST;
  });

  it("defaults to daily when no setting is stored", async () => {
    expect(await getQuarantineDigestFrequency()).toBe("daily");
  });

  it("round-trips a stored frequency", async () => {
    await setQuarantineDigestFrequency("weekly");
    expect(await getQuarantineDigestFrequency()).toBe("weekly");
    await setQuarantineDigestFrequency("off");
    expect(await getQuarantineDigestFrequency()).toBe("off");
  });
});

describe("triggerImmediateQuarantineDigestIfEnabled", () => {
  beforeEach(async () => {
    await resetDb();
    sendQuarantineDigestMock.mockClear();
    process.env.ADMIN_EMAILS = "owner@example.com";
    // The function short-circuits in test mode by design; clear NODE_ENV
    // for these targeted tests so we can exercise the gating logic.
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
    delete process.env.DISABLE_CONTACT_QUARANTINE_DIGEST;
    process.env.NODE_ENV = "test";
  });

  it("does nothing when frequency is daily", async () => {
    await setQuarantineDigestFrequency("daily");
    // Use a time well past any prior in-process cooldown so the gating
    // we exercise here is the frequency check, not the debounce.
    const now = new Date("2026-05-16T12:00:00Z");
    await seedEntry({ createdAt: new Date(now.getTime() - 5 * 60 * 1000) });
    const sent = await triggerImmediateQuarantineDigestIfEnabled(now);
    expect(sent).toBe(0);
    expect(sendQuarantineDigestMock).not.toHaveBeenCalled();
  });

  it("sends right away when frequency is immediate", async () => {
    await setQuarantineDigestFrequency("immediate");
    const now = new Date("2026-05-17T12:00:00Z");
    await seedEntry({ createdAt: new Date(now.getTime() - 5 * 60 * 1000) });
    const sent = await triggerImmediateQuarantineDigestIfEnabled(now);
    expect(sent).toBe(1);
    expect(sendQuarantineDigestMock).toHaveBeenCalledTimes(1);
  });

  it("debounces rapid bursts to a single digest", async () => {
    await setQuarantineDigestFrequency("immediate");
    const now = new Date("2026-05-18T12:00:00Z");
    await seedEntry({
      name: "Burst A",
      createdAt: new Date(now.getTime() - 60 * 1000),
    });
    const sent1 = await triggerImmediateQuarantineDigestIfEnabled(now);
    expect(sent1).toBe(1);
    expect(sendQuarantineDigestMock).toHaveBeenCalledTimes(1);

    // A second submission moments later should NOT produce another email.
    await seedEntry({
      name: "Burst B",
      createdAt: new Date(now.getTime() + 30 * 1000),
    });
    const justAfter = new Date(now.getTime() + 60 * 1000);
    const sent2 = await triggerImmediateQuarantineDigestIfEnabled(justAfter);
    expect(sent2).toBe(0);
    expect(sendQuarantineDigestMock).toHaveBeenCalledTimes(1);
  });

  it("respects DISABLE_CONTACT_QUARANTINE_DIGEST even on immediate", async () => {
    await setQuarantineDigestFrequency("immediate");
    process.env.DISABLE_CONTACT_QUARANTINE_DIGEST = "1";
    const now = new Date("2026-05-19T12:00:00Z");
    await seedEntry({ createdAt: new Date(now.getTime() - 5 * 60 * 1000) });
    const sent = await triggerImmediateQuarantineDigestIfEnabled(now);
    expect(sent).toBe(0);
    expect(sendQuarantineDigestMock).not.toHaveBeenCalled();
  });
});
