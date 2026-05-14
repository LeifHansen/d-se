import { defineConfig, devices } from "@playwright/test";
import { resolveChromiumLaunchOptions } from "./playwright.shared";

const launchOptions = resolveChromiumLaunchOptions();

const PORT = process.env.E2E_PORT ?? "5174";
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: /(journey|blog-draft-preview)\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: BASE_URL,
    trace: "off",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm run dev",
        env: {
          PORT,
          BASE_PATH: "/",
          NODE_ENV: "development",
        },
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      },
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
