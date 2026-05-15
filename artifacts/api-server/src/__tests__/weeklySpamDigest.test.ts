import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDb } from "./testDb";
import {
  contactQuarantineTable,
  newsletterQuarantineTable,
} from "@workspace/db";

const sendWeeklySpamDigestMock = vi.hoisted(() =>
  vi.fn(async (_arg: unknown) => {}),
);

vi.mock("../lib/email", () => ({
  sendWeeklySpamDigest: sendWeeklySpamDigestMock,
}));

const { runWeeklySpamDigestOnce } = await import("../lib/weeklySpamDigest");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function seedContact(opts: {
  reasons: string[];
  createdAt: Date;
  forwardedAt?: Date | null;
  markedLegitAt?: Date | null;
}): Promise<void> {
  await db.insert(contactQuarantineTable).values({
    name: "Spam",
    email: "spam@example.com",
    subject: "Hi",
    message: "buy now",
    reasons: opts.reasons,
    createdAt: opts.createdAt,
    expiresAt: new Date(opts.createdAt.getTime() + 14 * DAY),
    forwardedAt: opts.forwardedAt ?? null,
    markedLegitAt: opts.markedLegitAt ?? null,
  });
}

async function seedNewsletter(opts: {
  reasons: string[];
  createdAt: Date;
  markedLegitAt?: Date | null;
}): Promise<void> {
  await db.insert(newsletterQuarantineTable).values({
    email: "spam@example.com",
    source: "footer",
    reasons: opts.reasons,
    createdAt: opts.createdAt,
    expiresAt: new Date(opts.createdAt.getTime() + 14 * DAY),
    markedLegitAt: opts.markedLegitAt ?? null,
  });
}

describe("runWeeklySpamDigestOnce", () => {
  beforeEach(async () => {
    await resetDb();
    sendWeeklySpamDigestMock.mockClear();
    process.env.CONTACT_OWNER_EMAIL = "owner@example.com";
    process.env.STOREFRONT_BASE_URL = "https://shop.example.com";
  });

  afterEach(() => {
    delete process.env.CONTACT_OWNER_EMAIL;
    delete process.env.STOREFRONT_BASE_URL;
    delete process.env.RESEND_FROM_EMAIL;
  });

  it("returns null when no owner email is configured", async () => {
    delete process.env.CONTACT_OWNER_EMAIL;
    delete process.env.RESEND_FROM_EMAIL;
    const now = new Date("2026-05-15T12:00:00Z");
    await seedContact({
      reasons: ["link_blocked"],
      createdAt: new Date(now.getTime() - 2 * DAY),
    });
    const result = await runWeeklySpamDigestOnce(now);
    expect(result).toBeNull();
    expect(sendWeeklySpamDigestMock).not.toHaveBeenCalled();
  });

  it("skips when nothing was filtered in the last 7 days", async () => {
    const now = new Date("2026-05-15T12:00:00Z");
    // 10 days old — outside the window.
    await seedContact({
      reasons: ["link_blocked"],
      createdAt: new Date(now.getTime() - 10 * DAY),
    });
    const result = await runWeeklySpamDigestOnce(now);
    expect(result).toBeNull();
    expect(sendWeeklySpamDigestMock).not.toHaveBeenCalled();
  });

  it("emails the owner with totals, reasons, and review link", async () => {
    const now = new Date("2026-05-15T12:00:00Z");
    // Contact: 3 within window (1 unreviewed, 1 forwarded, 1 marked legit),
    // plus 1 outside the window.
    await seedContact({
      reasons: ["link_blocked", "honeypot:hp"],
      createdAt: new Date(now.getTime() - 1 * DAY),
    });
    await seedContact({
      reasons: ["link_blocked"],
      createdAt: new Date(now.getTime() - 2 * DAY),
      forwardedAt: new Date(now.getTime() - 1 * DAY),
    });
    await seedContact({
      reasons: ["honeypot:hp"],
      createdAt: new Date(now.getTime() - 3 * DAY),
      markedLegitAt: new Date(now.getTime() - 2 * DAY),
    });
    await seedContact({
      reasons: ["link_blocked"],
      createdAt: new Date(now.getTime() - 9 * DAY),
    });
    // Newsletter: 2 within window (1 unreviewed, 1 marked legit).
    await seedNewsletter({
      reasons: ["disposable_domain"],
      createdAt: new Date(now.getTime() - 6 * HOUR),
    });
    await seedNewsletter({
      reasons: ["disposable_domain", "link_blocked"],
      createdAt: new Date(now.getTime() - 4 * DAY),
      markedLegitAt: new Date(now.getTime() - 1 * DAY),
    });

    const result = await runWeeklySpamDigestOnce(now);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      contactTotal: 3,
      newsletterTotal: 2,
      unreviewed: 2,
      markedLegit: 2,
    });
    expect(sendWeeklySpamDigestMock).toHaveBeenCalledTimes(1);
    const arg = sendWeeklySpamDigestMock.mock.calls[0][0] as {
      to: string;
      summary: {
        topReasons: Array<{ reason: string; count: number }>;
      };
      reviewUrl: string | null;
      periodStart: Date;
      periodEnd: Date;
    };
    expect(arg.to).toBe("owner@example.com");
    expect(arg.reviewUrl).toBe(
      "https://shop.example.com/admin/contact-quarantine",
    );
    // link_blocked: 2 contact rows tally it; honeypot: 2 contact rows;
    // disposable_domain: 2 newsletter rows; link_blocked also +1 from
    // newsletter row -> total 3.
    const map = new Map(
      arg.summary.topReasons.map((r) => [r.reason, r.count]),
    );
    expect(map.get("link_blocked")).toBe(3);
    expect(map.get("honeypot")).toBe(2);
    expect(map.get("disposable_domain")).toBe(2);
    expect(arg.periodEnd).toEqual(now);
    expect(arg.periodStart).toEqual(new Date(now.getTime() - 7 * DAY));
  });

  it("falls back to RESEND_FROM_EMAIL when CONTACT_OWNER_EMAIL is unset", async () => {
    delete process.env.CONTACT_OWNER_EMAIL;
    process.env.RESEND_FROM_EMAIL = "fallback@example.com";
    const now = new Date("2026-05-15T12:00:00Z");
    await seedContact({
      reasons: ["link_blocked"],
      createdAt: new Date(now.getTime() - 6 * HOUR),
    });
    const result = await runWeeklySpamDigestOnce(now);
    expect(result).not.toBeNull();
    expect(sendWeeklySpamDigestMock).toHaveBeenCalledTimes(1);
    expect(
      (sendWeeklySpamDigestMock.mock.calls[0][0] as { to: string }).to,
    ).toBe("fallback@example.com");
  });
});
