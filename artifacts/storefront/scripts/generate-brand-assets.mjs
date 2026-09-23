#!/usr/bin/env node
// Regenerates the raster brand assets in public/ from the current palette:
//
//   public/apple-touch-icon.png  180×180, rasterised from public/favicon.svg
//   public/og-image.png          1200×630 social card
//   public/opengraph.jpg         same card as JPEG (used by <Seo> defaults)
//
// The social card is rendered in headless Chromium so the real web fonts
// (Bebas Neue / Inter from Google Fonts) are used — librsvg would fall back
// to system fonts. Needs network access for the font request.
//
// Usage: node scripts/generate-brand-assets.mjs
//
// Env overrides:
//   PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH  use an already-installed Chromium
//   HTTPS_PROXY                           forwarded to the browser
//   PLAYWRIGHT_IGNORE_HTTPS_ERRORS=1      for dev boxes behind a TLS-intercepting proxy
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, "..", "public");

// Keep in sync with src/index.css
const PALETTE = {
  ink: "#111D1D",
  inkSoft: "#1B2C2D",
  white: "#FFFFFF",
  turquoise: "#1FB2A3",
  turquoiseBright: "#3CDDCD",
  pink: "#D51A68",
  pinkSoft: "#F877AD",
  silver: "#BDC4C8",
};

const EMBLEM = `
<svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M60 6 C 90 38, 106 62, 106 84 C 106 110, 84 130, 60 130 C 36 130, 14 110, 14 84 C 14 62, 30 38, 60 6 Z" stroke="${PALETTE.turquoise}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M28 102 L 50 70 L 60 88 L 72 70 L 92 102" stroke="${PALETTE.turquoise}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
  <line x1="28" y1="102" x2="92" y2="102" stroke="${PALETTE.turquoise}" stroke-width="4" stroke-linecap="round"/>
</svg>`;

const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='linear' slope='0.55'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E")`;

const OG_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Permanent+Marker&family=Inter:wght@500;700&display=block" />
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    position: relative; background: ${PALETTE.ink}; color: ${PALETTE.white};
    font-family: 'Inter', system-ui, sans-serif; isolation: isolate;
  }
  .grain { position: absolute; inset: 0; background-image: ${GRAIN}; background-size: 240px 240px; opacity: .22; mix-blend-mode: screen; }
  .spray { position: absolute; border-radius: 50%; filter: blur(70px); }
  .spray.t { left: -180px; top: -160px; width: 620px; height: 620px; background: radial-gradient(closest-side, ${PALETTE.turquoise}66, transparent); }
  .spray.p { right: -160px; bottom: -220px; width: 560px; height: 560px; background: radial-gradient(closest-side, ${PALETTE.pink}66, transparent); }
  .halftone { position: absolute; right: 120px; top: 40px; width: 360px; height: 360px;
    background-image: radial-gradient(circle at center, rgba(255,255,255,.35) 1.4px, transparent 2px); background-size: 12px 12px;
    -webkit-mask-image: radial-gradient(closest-side, black 15%, transparent 100%); }
  .watermark { position: absolute; right: -24px; bottom: -70px; font-family: 'Bebas Neue', Impact, sans-serif; font-size: 520px; line-height: 1; letter-spacing: .02em; color: transparent; -webkit-text-stroke: 2px rgba(255,255,255,.12); }
  .card { position: absolute; left: 84px; top: 72px; right: 84px; bottom: 64px; display: flex; flex-direction: column; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 22px; }
  .brand svg { width: 64px; height: auto; }
  .wordmark { font-family: 'Bebas Neue', Impact, sans-serif; font-size: 200px; line-height: .9; letter-spacing: .12em; display: flex; align-items: baseline; gap: 28px; }
  .tag { font-family: 'Permanent Marker', cursive; font-size: 64px; letter-spacing: 0; color: ${PALETTE.pinkSoft}; transform: rotate(-2deg) translateY(-18px); display: inline-block; }
  .line { display: flex; align-items: center; gap: 22px; }
  .eyebrow { font-size: 22px; font-weight: 700; letter-spacing: .26em; text-transform: uppercase; color: ${PALETTE.turquoiseBright}; }
  .stripe { height: 6px; width: 260px; background: linear-gradient(90deg, ${PALETTE.turquoise} 0 40%, ${PALETTE.pink} 40% 70%, ${PALETTE.silver} 70%); }
  .sticker { display: inline-flex; align-items: center; padding: 14px 22px; border-radius: 8px; background: ${PALETTE.pinkSoft}; color: ${PALETTE.ink}; font-size: 20px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; transform: rotate(-3deg); box-shadow: 0 18px 40px -20px rgba(0,0,0,.8); }
  .bottom { display: flex; align-items: flex-end; justify-content: space-between; }
  .desc { max-width: 640px; font-size: 24px; font-weight: 500; line-height: 1.35; color: rgba(255,255,255,.82); }
</style>
</head>
<body>
  <div class="grain"></div>
  <div class="spray t"></div>
  <div class="spray p"></div>
  <div class="halftone"></div>
  <div class="watermark">DŌSE</div>
  <div class="card">
    <div class="brand">${EMBLEM}<div class="eyebrow">Precision THC beverage additive</div></div>
    <div>
      <div class="wordmark"><span>DŌSE</span><span class="tag">ever bottled.</span></div>
      <div class="line" style="margin-top:18px"><div class="stripe"></div></div>
    </div>
    <div class="bottom">
      <div class="desc">1000mg hemp-derived Delta-9 THC, water-soluble. Rapid onset, tracked from vetted farm to final drop.</div>
      <div class="sticker">1000mg · Lab tested</div>
    </div>
  </div>
</body>
</html>`;

// Same override the Playwright configs honour, for environments where the
// bundled browser revision isn't installed (e.g. Replit, CI images).
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  undefined;

async function renderSocialCard() {
  const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS === "1",
    });
    await page.setContent(OG_HTML, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    // Give the marker/display faces a beat to swap in.
    await page.waitForTimeout(300);
    return await page.screenshot({ type: "png" });
  } finally {
    await browser.close();
  }
}

async function main() {
  const faviconSvg = await fs.readFile(path.join(PUBLIC, "favicon.svg"));
  await sharp(faviconSvg, { density: 384 })
    .resize(180, 180)
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC, "apple-touch-icon.png"));
  console.log("wrote public/apple-touch-icon.png");

  const png = await renderSocialCard();
  await sharp(png).png({ compressionLevel: 9 }).toFile(path.join(PUBLIC, "og-image.png"));
  console.log("wrote public/og-image.png");
  await sharp(png).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(PUBLIC, "opengraph.jpg"));
  console.log("wrote public/opengraph.jpg");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
