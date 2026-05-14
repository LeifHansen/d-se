import type { LaunchOptions } from "@playwright/test";

export function resolveChromiumLaunchOptions(): LaunchOptions | undefined {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const replitDefault = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const executablePath = explicit || replitDefault;
  if (!executablePath) return undefined;
  return { executablePath };
}
