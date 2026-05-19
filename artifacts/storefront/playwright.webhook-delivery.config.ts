import { defineConfig, devices } from "@playwright/test";
import { resolveChromiumLaunchOptions } from "./playwright.shared";

const launchOptions = resolveChromiumLaunchOptions();

// End-to-end test for the EasyPost delivery webhook -> delivery email flow.
// Mirrors playwright.checkout-real.config.ts: a real api-server (Stripe in
// dev-fallback, EasyPost API disabled) talks to the project's real Postgres,
// and a real storefront vite dev server proxies /api to it. The spec POSTs a
// `tracker.updated` event directly to the api-server, then loads the order
// page using the same `?token=…` URL the delivery email would have linked to.

const STORE_PORT = process.env.E2E_PORT ?? "5176";
const API_PORT = process.env.E2E_API_PORT ?? "18182";
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${STORE_PORT}`;
const API_URL = process.env.E2E_API_URL ?? `http://localhost:${API_PORT}`;

const useExternal = !!process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./tests",
  testMatch: /webhook-delivery-email\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "off",
    extraHTTPHeaders: {
      "x-e2e-api-url": API_URL,
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
            // Disable Replit connector lookups so Stripe/Resend stay off and
            // sendDeliveryEmail() short-circuits to a no-op (we only care
            // that the webhook builds the correct orderUrl + token, not
            // that an actual email is dispatched).
            REPLIT_CONNECTORS_HOSTNAME: "",
            REPL_IDENTITY: "",
            WEB_REPL_RENEWAL: "",
            EASYPOST_API_KEY: "",
            // Leave EASYPOST_WEBHOOK_SECRET unset so the route accepts the
            // unsigned test payload.
            // Pin a stable token secret so verifyOrderToken() in the same
            // process (and in this spec, indirectly via the by-token
            // lookup the storefront calls) can validate the link.
            ORDER_TOKEN_SECRET: "e2e-webhook-delivery-secret",
          },
          port: Number(API_PORT),
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
        },
        {
          command: "pnpm run dev",
          env: {
            PORT: STORE_PORT,
            BASE_PATH: "/",
            NODE_ENV: "development",
            E2E_API_PROXY: API_URL,
          },
          url: BASE_URL,
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
