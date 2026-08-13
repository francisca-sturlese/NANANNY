/**
 * Crawls every internal link the app renders and fails on anything broken.
 *
 * A 404 behind a navigation item is the kind of thing that survives every unit
 * test and is the first thing a real visitor finds. Runs signed out, then as a
 * family, then as a nanny, so private navigation is covered too.
 *
 * Run:  node scripts/link-check.mjs
 */

import { webkit, devices } from "playwright";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const PASSWORD = "NaNannyDev2026!";

/** Paths that are expected to bounce a signed-out visitor to the login page. */
const PRIVATE_PREFIXES = ["/family", "/nanny", "/admin", "/account"];

const AUDIENCES = [
  { name: "signed out", email: null, start: ["/", "/nannies", "/jobs", "/pricing"] },
  {
    name: "family",
    email: "family1@nananny.example.test",
    start: ["/family", "/family/jobs", "/family/saved", "/family/profile", "/nannies"],
  },
  {
    name: "nanny",
    email: "nanny1@nananny.example.test",
    start: ["/nanny", "/nanny/applications", "/nanny/profile", "/jobs"],
  },
  { name: "admin", email: "admin@nananny.example.test", start: ["/admin"] },
];

const browser = await webkit.launch();
const problems = [];
let checked = 0;

for (const audience of AUDIENCES) {
  const context = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE });
  const page = await context.newPage();

  if (audience.email) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(audience.email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });
  }

  // Collect every internal href this audience can see from its starting pages.
  const targets = new Set(audience.start);
  for (const start of audience.start) {
    await page.goto(start, { waitUntil: "networkidle" });
    const hrefs = await page.$$eval("a[href]", (as) =>
      as.map((a) => a.getAttribute("href")).filter(Boolean),
    );
    for (const href of hrefs) {
      if (!href.startsWith("/") || href.startsWith("//")) continue;
      // Query strings are the same page; strip them to keep the crawl bounded.
      targets.add(href.split("?")[0].split("#")[0]);
    }
  }

  for (const path of [...targets].sort()) {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    checked++;
    const status = response?.status() ?? 0;
    const landed = new URL(page.url()).pathname;

    const isPrivate = PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
    const bouncedToLogin = /\/login/.test(landed);

    if (status >= 400) {
      problems.push(`${audience.name}: ${path} → HTTP ${status}`);
    } else if (path === "/login" || path === "/signup") {
      // Landing on the login page from a link to the login page is not a bounce.
    } else if (bouncedToLogin && !(isPrivate && !audience.email)) {
      // Being sent to login is correct for a signed-out visitor on a private
      // path, and a bug for anyone else.
      problems.push(`${audience.name}: ${path} → redirected to login`);
    }
  }

  await context.close();
}

await browser.close();

console.log(`\nChecked ${checked} links across ${AUDIENCES.length} audiences.\n`);

if (problems.length === 0) {
  console.log("✓ No broken or unexpectedly gated links.");
} else {
  console.log(`✗ ${problems.length} problem(s):\n`);
  for (const p of problems) console.log(`  ${p}`);
  process.exitCode = 1;
}
