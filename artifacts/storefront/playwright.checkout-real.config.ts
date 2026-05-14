import { defineConfig, devices } from "@playwright/test";

// True end-to-end checkout flow against a real api-server (with Stripe in
// dev-fallback mode) and the project's real Postgres database. The api-
// server's `dev` script builds + runs the compiled bundle.
//
// Override E2E_BASE_URL / E2E_API_URL to run against an already-running
// pair (e.g. the platform's path-routed dev environment).

const STORE_PORT = process.env.E2E_PORT ?? "5175";
const API_PORT = process.env.E2E_API_PORT ?? "18181";
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${STORE_PORT}`;
const API_URL = process.env.E2E_API_URL ?? `http://localhost:${API_PORT}`;

const useExternal = !!process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./tests",
  testMatch: /checkout-real-backend\.spec\.ts$/,
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
            // Force the orders route into the dev-fallback branch by
            // disabling the Replit Stripe connector lookup. The route
            // creates the order, marks it paid, clears the cart, and
            // redirects to /checkout/success?orderId=… without ever
            // talking to Stripe.
            REPLIT_CONNECTORS_HOSTNAME: "",
            REPL_IDENTITY: "",
            WEB_REPL_RENEWAL: "",
            // Force the flat-rate shipping fallback in
            // artifacts/api-server/src/routes/shipping.ts so the test does
            // not depend on hitting EasyPost from a sandbox.
            EASYPOST_API_KEY: "",
          },
          // /healthz returns 503 in dev because we intentionally disable the
          // Stripe + Resend connector lookup, so we wait on the TCP port
          // instead — once the server is listening, the route is live.
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
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? {
              launchOptions: {
                executablePath:
                  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
              },
            }
          : {}),
      },
    },
  ],
});
