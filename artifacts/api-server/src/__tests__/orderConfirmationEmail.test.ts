import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.hoisted(() =>
  vi.fn(async (_arg: unknown) => ({ data: { id: "msg_test" } })),
);

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { sendOrderConfirmation } from "../lib/email";

const realFetch = globalThis.fetch;

beforeEach(() => {
  sendMock.mockClear();
  process.env.REPLIT_CONNECTORS_HOSTNAME = "connectors.test";
  process.env.REPL_IDENTITY = "test-identity";
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        items: [
          { settings: { api_key: "test_key", from_email: "shop@example.com" } },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("sendOrderConfirmation rendered HTML", () => {
  it("renders subtotal, discount line with code, and reduced total when a discount was used", async () => {
    await sendOrderConfirmation({
      to: "buyer@example.com",
      orderId: 4242,
      items: [{ name: "Slow Candle", quantity: 2, priceCents: 2500 }],
      subtotalCents: 5000,
      discountCents: 1000,
      discountCode: "WELCOME10",
      shippingCents: 500,
      taxCents: 330,
      totalCents: 4830,
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0]![0] as {
      html: string;
      subject: string;
      to: string;
    };
    expect(arg.to).toBe("buyer@example.com");
    expect(arg.subject).toBe("Order #4242 confirmed");

    expect(arg.html).toMatch(/Subtotal[\s\S]*?\$50\.00/);
    expect(arg.html).toContain("Discount (WELCOME10)");
    expect(arg.html).toMatch(/-\$10\.00/);
    expect(arg.html).toMatch(/Total:\s*\$48\.30/);
    expect(arg.html).not.toMatch(/Total:\s*\$50\.00/);
  });

  it("omits the discount line entirely when no discount was used", async () => {
    await sendOrderConfirmation({
      to: "buyer@example.com",
      orderId: 99,
      items: [{ name: "Slow Candle", quantity: 1, priceCents: 2500 }],
      subtotalCents: 2500,
      discountCents: 0,
      shippingCents: 500,
      taxCents: 0,
      totalCents: 3000,
    });

    const arg = sendMock.mock.calls[0]![0] as { html: string };
    expect(arg.html).not.toContain("Discount");
    expect(arg.html).toMatch(/Total:\s*\$30\.00/);
  });
});
