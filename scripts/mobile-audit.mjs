/**
 * Mobile audit.
 *
 * Checks the rules that "does it fit on a phone?" never catches: sideways
 * scroll, targets too small for a thumb, text below the readable floor, and
 * content hidden behind the fixed bottom bar.
 *
 * Runs every page at every viewport the product targets, in WebKit (iPhone
 * Safari) and Chromium (Android Chrome), and writes a screenshot per
 * combination.
 *
 * Run:  node scripts/mobile-audit.mjs [--shots]
 */

import { mkdir } from "node:fs/promises";
import { chromium, webkit, devices } from "playwright";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const OUT = new URL("../screenshots/", import.meta.url).pathname;
const WANT_SHOTS = process.argv.includes("--shots");

const VIEWPORTS = [
  { name: "iphone-se", width: 375, height: 667, mobile: true },
  { name: "iphone-13", width: 390, height: 844, mobile: true },
  { name: "iphone-15", width: 393, height: 852, mobile: true },
  { name: "iphone-pro-max", width: 430, height: 932, mobile: true },
  { name: "android-small", width: 360, height: 800, mobile: true },
  { name: "ipad", width: 768, height: 1024, mobile: true },
  { name: "desktop", width: 1440, height: 900, mobile: false },
];

const PAGES = [
  { path: "/", name: "home" },
  { path: "/signup", name: "signup" },
  { path: "/login", name: "login" },
  { path: "/forgot-password", name: "forgot" },
  { path: "/verify-email", name: "verify" },
  { path: "/nannies", name: "search" },
  { path: "/nannies?emirate=Dubai&experience=5", name: "search-filtered" },
  { path: "/nannies?emirate=Fujairah&experience=10&salary_max=2000", name: "search-empty" },
  { path: "/jobs", name: "jobs" },
  // Filled in at startup from the seeded data, so the detail pages are audited
  // with real content rather than a placeholder.
];

/** Minimum comfortable thumb target, and the readable text floor. */
const MIN_TARGET = 44;
const MIN_FONT = 12;

/**
 * Runs inside the page. Declared as a real function (not a template string) so
 * its own backticks and ${} are not eaten by the outer module's interpolation —
 * limits arrive as an argument instead.
 */
function auditPage({ minTarget, minFont, enforceTargets }) {
  const problems = [];
  const doc = document.documentElement;

  if (doc.scrollWidth > doc.clientWidth + 1) {
    // Name the widest offender, otherwise "the page scrolls sideways" is
    // useless to whoever has to fix it.
    let worst = null;
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      const overflow = Math.round(r.right - doc.clientWidth);
      if (overflow > 1 && (!worst || overflow > worst.overflow)) {
        worst = {
          overflow,
          tag: el.tagName.toLowerCase(),
          cls: (el.className && String(el.className).slice(0, 60)) || "",
        };
      }
    }
    problems.push({
      kind: "horizontal-scroll",
      detail:
        (doc.scrollWidth - doc.clientWidth) + "px too wide" +
        (worst ? " — widest: <" + worst.tag + " class=\"" + worst.cls + "\"> +" + worst.overflow + "px" : ""),
    });
  }

  const seen = new Set();
  const interactive = document.querySelectorAll(
    "button, a[href], input:not([type=hidden]), select, textarea, [role=button]",
  );

  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    // Visually-hidden controls (a 1px sr-only radio behind a card label)
    // are not the target the finger aims at — the label is.
    if (r.width <= 2 || r.height <= 2) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") continue;

    // An inline link inside a paragraph is text, not a button.
    const inProse = el.tagName === "A" && el.closest("p, li");

    if (enforceTargets && !inProse && r.height < minTarget - 0.5) {
      const label = (el.textContent || el.getAttribute("aria-label") || el.tagName)
        .trim()
        .slice(0, 40);
      const key = "target:" + label + Math.round(r.height);
      if (!seen.has(key)) {
        seen.add(key);
        problems.push({
          kind: "small-target",
          detail: Math.round(r.height) + "px tall: \"" + label + "\"",
        });
      }
    }

    const fs = parseFloat(style.fontSize);
    if (fs && fs < minFont) {
      const key = "font:" + Math.round(fs);
      if (!seen.has(key)) {
        seen.add(key);
        problems.push({
          kind: "tiny-text",
          detail: fs + "px on <" + el.tagName.toLowerCase() + ">",
        });
      }
    }
  }

  // Anything sitting under a fixed bottom bar is unreachable.
  const bars = [...document.querySelectorAll("nav, div")].filter((el) => {
    const s = getComputedStyle(el);
    return s.position === "fixed" && s.bottom === "0px" && el.getBoundingClientRect().height > 0;
  });

  if (bars.length) {
    const barHeight = bars[0].getBoundingClientRect().height;
    const main = document.querySelector("main");
    // Measure the last piece of CONTENT, not <main> itself: the whole point of
    // the bottom padding is that main's own box extends behind the bar while
    // nothing inside it does. Comparing main.bottom would flag every correctly
    // padded page.
    const last = main?.lastElementChild;
    if (last) {
      const contentBottom = last.getBoundingClientRect().bottom + window.scrollY;
      const barTop = doc.scrollHeight - barHeight;
      if (contentBottom > barTop + 4) {
        problems.push({
          kind: "covered-by-bottom-bar",
          detail:
            "content ends " + Math.round(contentBottom - barTop) +
            "px inside the " + Math.round(barHeight) + "px bottom bar",
        });
      }
    }
  }

  return problems;
}

// Pull one real id for each detail page rather than hardcoding a uuid.
try {
  const search = await fetch(`${BASE}/nannies`).then((r) => r.text());
  const nannyId = search.match(/\/nannies\/([0-9a-f-]{36})/)?.[1];
  if (nannyId) PAGES.push({ path: `/nannies/${nannyId}`, name: "nanny-profile" });

  const jobs = await fetch(`${BASE}/jobs`).then((r) => r.text());
  const jobId = jobs.match(/\/jobs\/([0-9a-f-]{36})/)?.[1];
  if (jobId) PAGES.push({ path: `/jobs/${jobId}`, name: "job-detail" });
} catch {
  console.warn("Could not resolve detail-page ids; auditing list pages only.");
}

await mkdir(OUT, { recursive: true });

let total = 0;
const failures = [];

for (const [engineName, engine, deviceHint] of [
  ["webkit", webkit, devices["iPhone 13"]],
  ["chromium", chromium, devices["Pixel 5"]],
]) {
  const browser = await engine.launch();

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: vp.mobile && engineName === "chromium",
      hasTouch: vp.mobile,
      userAgent: vp.mobile ? deviceHint.userAgent : undefined,
    });
    const page = await context.newPage();

    for (const target of PAGES) {
      total++;
      await page.goto(`${BASE}${target.path}`, { waitUntil: "networkidle" });
      // Let fonts settle so text metrics are real.
      await page.evaluate(() => document.fonts.ready);

      const problems = await page.evaluate(auditPage, {
        minTarget: MIN_TARGET,
        minFont: MIN_FONT,
        // A mouse pointer is precise; the 44px floor is a touch requirement.
        enforceTargets: vp.mobile,
      });

      if (problems.length) {
        failures.push({ engine: engineName, viewport: vp.name, page: target.name, problems });
      }

      if (WANT_SHOTS && vp.mobile) {
        await page.screenshot({
          path: `${OUT}${target.name}-${vp.name}-${engineName}.png`,
          fullPage: true,
        });
      }
    }

    await context.close();
  }

  await browser.close();
}

console.log(`\nAudited ${total} page/viewport/engine combinations.\n`);

if (failures.length === 0) {
  console.log("✓ No horizontal scroll, no targets under 44px, no text under 12px.");
} else {
  // Group by problem so the same issue across nine viewports reads as one item.
  const byProblem = new Map();
  for (const f of failures) {
    for (const p of f.problems) {
      const key = `${p.kind} | ${p.detail}`;
      if (!byProblem.has(key)) byProblem.set(key, new Set());
      byProblem.get(key).add(`${f.page}@${f.viewport}/${f.engine}`);
    }
  }

  console.log(`✗ ${byProblem.size} distinct problem(s):\n`);
  for (const [problem, where] of byProblem) {
    const list = [...where];
    console.log(`  ${problem}`);
    console.log(`      ${list.slice(0, 4).join(", ")}${list.length > 4 ? ` +${list.length - 4} more` : ""}\n`);
  }
  process.exitCode = 1;
}
