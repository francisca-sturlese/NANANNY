/**
 * Overlay regression check.
 *
 * `position: fixed` is not always relative to the viewport: any ancestor with
 * backdrop-filter, filter, transform or contain becomes its containing block.
 * Our sticky headers and filter bars all use backdrop-blur, so a sheet rendered
 * inside one gets clipped to that bar — the overlay dims a strip of the page
 * and most of the panel is unreachable.
 *
 * This opens every overlay in the product and asserts it actually covers the
 * viewport, in both engines and at phone and desktop sizes.
 *
 * Run:  node scripts/overlay-check.mjs
 */

import { webkit, chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";

const CASES = [
  {
    name: "search filter sheet",
    path: "/nannies",
    open: async (p) => p.getByRole("button", { name: /Filters/ }).click(),
    selector: '[role="dialog"][aria-label="Filters"]',
    sizes: ["phone", "desktop"],
  },
  {
    name: "homepage search filters",
    path: "/",
    open: async (p) => p.getByRole("button", { name: "Filters" }).click(),
    selector: '[role="dialog"]',
    sizes: ["phone"],
  },
  {
    name: "header mobile menu",
    path: "/",
    open: async (p) => p.getByRole("button", { name: "Open menu" }).click(),
    selector: "#mobile-menu",
    sizes: ["phone"],
  },
];

const SIZES = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
};

const problems = [];
let checked = 0;

for (const [engineName, engine] of [
  ["webkit", webkit],
  ["chromium", chromium],
]) {
  const browser = await engine.launch();

  for (const testCase of CASES) {
    for (const sizeName of testCase.sizes) {
      const context = await browser.newContext({
        viewport: SIZES[sizeName],
        hasTouch: sizeName === "phone",
      });
      const page = await context.newPage();
      await page.goto(`${BASE}${testCase.path}`, { waitUntil: "networkidle" });

      try {
        await testCase.open(page);
        await page.locator(testCase.selector).first().waitFor({ timeout: 5000 });
        await page.waitForTimeout(300);

        const box = await page.evaluate((selector) => {
          const el = document.querySelector(selector);
          const r = el.getBoundingClientRect();
          return {
            top: Math.round(r.top),
            left: Math.round(r.left),
            width: Math.round(r.width),
            height: Math.round(r.height),
            vw: window.innerWidth,
            vh: window.innerHeight,
          };
        }, testCase.selector);

        checked++;
        const covers =
          box.top <= 1 &&
          box.left <= 1 &&
          box.width >= box.vw - 1 &&
          box.height >= box.vh - 1;

        if (!covers) {
          problems.push(
            `${testCase.name} @${sizeName}/${engineName}: ` +
              `${box.width}x${box.height} at (${box.left},${box.top}), ` +
              `viewport ${box.vw}x${box.vh} — trapped inside an ancestor`,
          );
        }
      } catch (error) {
        problems.push(`${testCase.name} @${sizeName}/${engineName}: ${String(error).split("\n")[0]}`);
      }

      await context.close();
    }
  }

  await browser.close();
}

console.log(`\nChecked ${checked} overlays.\n`);
if (problems.length === 0) {
  console.log("✓ Every overlay covers the viewport.");
} else {
  console.log(`✗ ${problems.length} problem(s):\n`);
  for (const p of problems) console.log(`  ${p}`);
  process.exitCode = 1;
}
