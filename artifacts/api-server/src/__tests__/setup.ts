import { vi } from "vitest";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://test/test";
process.env.ABANDONED_CART_SECRET = "test-secret";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
process.env.PUBLIC_APP_URL = "https://example.test";

vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { db, pglite } = await import("./testDb");
  return { ...schema, db, pool: pglite };
});

vi.mock("@clerk/express", () => {
  const state: { userId: string | null; user: unknown } = {
    userId: null,
    user: null,
  };
  return {
    __setAuth: (userId: string | null, user?: unknown) => {
      state.userId = userId;
      state.user = user ?? {
        firstName: "Test",
        lastName: "User",
        username: "testuser",
        emailAddresses: [{ emailAddress: "test@example.com" }],
      };
    },
    getAuth: () => ({ userId: state.userId }),
    clerkClient: {
      users: {
        getUser: async () => state.user,
      },
    },
    clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) =>
      next(),
  };
});

vi.mock("../lib/sentry", () => ({
  initSentry: () => {},
  isSentryEnabled: () => false,
  Sentry: { captureException: () => {} },
}));

vi.mock("../lib/serverAnalytics", () => ({
  trackPurchaseServerSide: vi.fn(async () => {}),
}));
