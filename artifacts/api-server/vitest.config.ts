import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["src/__tests__/**/*.test.ts"],
    setupFiles: ["src/__tests__/setup.ts"],
    pool: "forks",
    forks: { singleFork: true },
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
