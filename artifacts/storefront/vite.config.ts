import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { imagetools } from "vite-imagetools";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    imagetools({
      defaultDirectives: (url) => {
        if (url.searchParams.has("picture")) {
          const params = new URLSearchParams();
          params.set("w", "400;640;960;1280;1600");
          params.set("format", "avif;webp;jpeg");
          params.set("as", "picture");
          return params;
        }
        return new URLSearchParams();
      },
    }),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    // E2E_API_PROXY (e.g. http://localhost:18181) lets a Playwright run
    // forward the storefront's same-origin /api/* calls (and the SEO
    // routes the api-server also exposes at /sitemap.xml + /robots.txt)
    // to a real api-server process, so we can drive the full stack from
    // a single browser origin without a separate path-routing proxy.
    ...(process.env.E2E_API_PROXY
      ? {
          proxy: {
            "/api": {
              target: process.env.E2E_API_PROXY,
              changeOrigin: true,
            },
            "/sitemap.xml": {
              target: process.env.E2E_API_PROXY,
              changeOrigin: true,
            },
            "/robots.txt": {
              target: process.env.E2E_API_PROXY,
              changeOrigin: true,
            },
          },
        }
      : {}),
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
