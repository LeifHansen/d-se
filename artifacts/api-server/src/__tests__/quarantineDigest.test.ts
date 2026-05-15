import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDb } from "./testDb";
import { contactQuarantineTable } from "@workspace/db";

const sendQuarantineDigestMock = vi.hoisted(() =>
  vi.fn(async (_arg: unknown) => {}),
);

vi.mock("../lib/email", () => ({
  sendQuarantineDigest: sendQuarantineDigestMock,
}));

const { runQuarantineDigestOnce } = await import("../lib/quarantineDigest");

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
});
