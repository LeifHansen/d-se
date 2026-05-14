#!/usr/bin/env node
// Production static server for the storefront SPA with proper try_files
// semantics so per-route prerendered HTML is always served before the SPA
// fallback. Crawlers that don't run JavaScript see the route-specific
// <title>, meta, canonical, and JSON-LD baked in by scripts/prerender.mjs.
//
// Resolution order for each GET/HEAD request:
//   1. <publicDir>/<path>                (exact file, e.g. /assets/foo.js)
//   2. <publicDir>/<path>/index.html     (directory index, e.g. /contact/)
//   3. <publicDir>/<path>.html           (flat html, e.g. /contact.html)
//   4. <publicDir>/index.html            (SPA shell fallback)
//
// Anything else returns 405 (non-GET/HEAD) or 404 if even the SPA shell
// is missing. Path traversal (`..`) is rejected before disk access.

import http from "node:http";
import { promises as fs, createReadStream, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "..", "dist", "public");

const rawPort = process.env.PORT;
if (!rawPort) {
  console.error("PORT environment variable is required");
  process.exit(1);
}
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  console.error(`Invalid PORT value: "${rawPort}"`);
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function cacheHeader(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  // Hashed asset bundles emitted by Vite (dist/public/assets/*) are
  // immutable; everything else (HTML shells, favicon, opengraph image)
  // gets a short cache so deploys propagate quickly.
  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    return "public, max-age=31536000, immutable";
  }
  if (ext === ".html") return "public, max-age=0, must-revalidate";
  return "public, max-age=300";
}

function safeJoin(rel) {
  // Strip query/hash and decode. Reject any path that escapes PUBLIC_DIR.
  const decoded = decodeURIComponent(rel.split("?")[0].split("#")[0]);
  const normalized = path.posix.normalize(decoded.replace(/\\/g, "/"));
  if (normalized.includes("..")) return null;
  const trimmed = normalized.replace(/^\/+/, "");
  const full = path.resolve(PUBLIC_DIR, trimmed);
  if (full !== PUBLIC_DIR && !full.startsWith(PUBLIC_DIR + path.sep)) {
    return null;
  }
  return full;
}

async function fileExists(p) {
  try {
    const st = await fs.stat(p);
    return st.isFile() ? st : null;
  } catch {
    return null;
  }
}

async function resolveFile(urlPath) {
  const base = safeJoin(urlPath);
  if (!base) return null;

  // 1. exact file
  let st = await fileExists(base);
  if (st) return { file: base, stat: st };

  // 2. directory index
  st = await fileExists(path.join(base, "index.html"));
  if (st) return { file: path.join(base, "index.html"), stat: st };

  // 3. flat .html sibling
  st = await fileExists(`${base}.html`);
  if (st) return { file: `${base}.html`, stat: st };

  return null;
}

async function spaShell() {
  const shell = path.join(PUBLIC_DIR, "index.html");
  const st = await fileExists(shell);
  return st ? { file: shell, stat: st } : null;
}

function serveFile(res, found, method) {
  res.statusCode = 200;
  res.setHeader("Content-Type", contentType(found.file));
  res.setHeader("Content-Length", found.stat.size);
  res.setHeader("Cache-Control", cacheHeader(found.file));
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(found.file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    res.end();
    return;
  }

  try {
    const found = await resolveFile(req.url || "/");
    if (found) {
      serveFile(res, found, req.method);
      return;
    }
    // SPA fallback — return the shell with 200 so the client router can
    // render the appropriate route (including 404 / NotFound).
    const shell = await spaShell();
    if (shell) {
      serveFile(res, shell, req.method);
      return;
    }
    res.statusCode = 404;
    res.end("Not found");
  } catch (err) {
    console.error("[serve] error handling", req.url, err);
    res.statusCode = 500;
    res.end("Internal server error");
  }
});

// Sanity-check the public dir up front so misconfiguration fails loudly.
try {
  const st = statSync(PUBLIC_DIR);
  if (!st.isDirectory()) throw new Error("not a directory");
} catch (err) {
  console.error(
    `[serve] publicDir not found at ${PUBLIC_DIR} — did the build run? (${err.message})`,
  );
  process.exit(1);
}

server.listen(port, "0.0.0.0", () => {
  console.log(`[serve] storefront listening on 0.0.0.0:${port}, root=${PUBLIC_DIR}`);
});
