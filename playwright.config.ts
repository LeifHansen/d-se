import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5000";
const useExternal = !!process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  // When E2E_BASE_URL is provided we assume an already-running target (Replit
  // dev domain or staging). Otherwise spin up the API + storefront ourselves.
  webServer: useExternal
    ? undefined
    : [
        {
          command: "pnpm --filter @workspace/api-server run dev",
          env: {
            PORT: "5001",
            NODE_ENV: "development",
          },
          url: "http://localhost:5001/api/healthz",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
        },
        {
          command: "pnpm --filter @workspace/storefront run dev",
          env: {
            PORT: "5000",
            BASE_PATH: "/",
            VITE_API_BASE_URL: "http://localhost:5001/api",
          },
          url: "http://localhost:5000",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
        },
      ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
