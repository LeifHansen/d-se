import { defineConfig, devices } from "@playwright/test";
import { resolveChromiumLaunchOptions } from "./playwright.shared";

const launchOptions = resolveChromiumLaunchOptions();

// True end-to-end coverage of GET /api/admin/orders/by-email/:email against
// a real api-server + real Postgres. The api-server's admin routes sit
// behind Clerk; here we launch the api-server with a dev-only
// E2E_ADMIN_BYPASS_TOKEN and the spec sends a matching x-e2e-admin-bypass
// header so the route runs without a Clerk session. The bypass is gated on
// NODE_ENV !== "production" inside requireAdmin, so it cannot be enabled
// against a deployed prod build.

const API_PORT = process.env.E2E_API_PORT ?? "18182";
const API_URL = process.env.E2E_API_URL ?? `http://localhost:${API_PORT}`;
const ADMIN_BYPASS_TOKEN =
  process.env.E2E_ADMIN_BYPASS_TOKEN ?? "e2e-admin-bypass-by-email";

const useExternal = !!process.env.E2E_API_URL;

export default defineConfig({
  testDir: "./tests",
  testMatch: /admin-orders-by-email-real-backend\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: API_URL,
    trace: "off",
    extraHTTPHeaders: {
      "x-e2e-admin-bypass": ADMIN_BYPASS_TOKEN,
    },
  },
  webServer: useExternal
    ? undefined
    : [
        {
          command: "pnpm --filter @workspace/api-server run dev",
          env: {
            PORT: API_PORT,
            NODE_ENV: "development",
            E2E_ADMIN_BYPASS_TOKEN: ADMIN_BYPASS_TOKEN,
            // Disable connector lookups so the server boots quickly without
            // talking to Stripe/Resend/EasyPost from a sandbox.
            REPLIT_CONNECTORS_HOSTNAME: "",
            REPL_IDENTITY: "",
            WEB_REPL_RENEWAL: "",
            EASYPOST_API_KEY: "",
          },
          port: Number(API_PORT),
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
        },
      ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(launchOptions ? { launchOptions } : {}),
      },
    },
  ],
});
