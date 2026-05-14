import { defineConfig, devices } from "@playwright/test";
import { resolveChromiumLaunchOptions } from "./playwright.shared";

const launchOptions = resolveChromiumLaunchOptions();

const PORT = process.env.A11Y_PORT ?? process.env.PORT ?? "80";
const BASE_URL = process.env.A11Y_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "off",
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
