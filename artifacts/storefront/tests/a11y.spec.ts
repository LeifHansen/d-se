import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const A11Y_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
];

const SERIOUS = new Set(["serious", "critical"]);

const PAGES: { path: string; name: string }[] = [
  { path: "/", name: "home" },
  { path: "/privacy", name: "privacy" },
  { path: "/terms", name: "terms" },
  { path: "/shipping-policy", name: "shipping" },
  { path: "/returns", name: "returns" },
  { path: "/accessibility", name: "accessibility" },
  { path: "/contact", name: "contact" },
];

test.describe("axe-core a11y audit (no serious/critical violations)", () => {
  for (const p of PAGES) {
    test(`${p.name} (${p.path})`, async ({ page }) => {
      // Pre-seed consent so the AgeGate / CookieBanner do not block the
      // page-level audit. Both are themselves audited via dedicated tests
      // (e.g. focus management) elsewhere; here we cover the underlying
      // page content.
      await page.goto(p.path);
      await page.evaluate(() => {
        try {
          window.localStorage.setItem("dose-age-confirmed", "yes");
          window.localStorage.setItem("dose-cookies-decision", "accept");
        } catch {
          /* ignore */
        }
      });
      await page.reload({ waitUntil: "networkidle" });

      const results = await new AxeBuilder({ page })
        .withTags(A11Y_TAGS)
        .analyze();

      const blocking = results.violations.filter((v) =>
        SERIOUS.has(v.impact ?? ""),
      );

      if (blocking.length > 0) {
        // Surface a concise, actionable summary in the failure message.
        const summary = blocking
          .map(
            (v) =>
              `  - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${
                v.nodes.length === 1 ? "" : "s"
              })\n    ${v.helpUrl}`,
          )
          .join("\n");
        throw new Error(
          `${blocking.length} serious/critical a11y violation(s) on ${p.path}:\n${summary}`,
        );
      }
      expect(blocking).toHaveLength(0);
    });
  }
});
