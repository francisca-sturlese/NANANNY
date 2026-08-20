/**
 * Text that does not fit, or does not spread, on a wide screen.
 *
 * The mobile audit has always guarded the narrow end: nothing overflows, no
 * tap target under 44px, no text under 12px. Nobody was guarding the wide end,
 * and it fails differently. A phone shows too little space and things spill; a
 * desktop shows too much and things huddle, so a sentence written for a column
 * wraps after six words with half the screen empty beside it.
 *
 * Three faults, all measured rather than judged:
 *
 *   CLIPPED   an element that hides its own text. scrollWidth beyond
 *             clientWidth with overflow hidden, which is a name or a title cut
 *             mid word with room to spare on the row.
 *   CLAMPED   a line-clamp actually clamping: text present in the DOM that
 *             nobody can read.
 *   HUDDLED   a paragraph whose lines end far short of the space it has. Read
 *             as: the longest line uses less than 55% of the container, over
 *             at least three lines, in a container at least 480px wide. Two of
 *             those together are what "does not distribute well" looks like.
 *
 * Run:  node scripts/desktop-text-audit.mjs [--width 1440] [--only /pricing]
 */

import { readFileSync } from "node:fs";
import { webkit } from "playwright";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const PASSWORD = "NaNannyDev2026!";
const widthArg = process.argv.indexOf("--width");
const WIDTH = widthArg > -1 ? Number(process.argv[widthArg + 1]) : 1440;
const onlyArg = process.argv.indexOf("--only");
const ONLY = onlyArg > -1 ? process.argv[onlyArg + 1] : null;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

/** Every page a person can reach, by the account that reaches it. */
const PAGES = {
  anon: [
    "/", "/for-families", "/for-nannies", "/how-it-works", "/pricing", "/find",
    "/nannies", "/jobs", "/blog", "/blog/nanny-salary-dubai-2026",
    "/blog/live-in-vs-live-out-nanny-dubai", "/blog/nanny-interview-questions",
    "/guides/hire-a-nanny-in-dubai-without-an-agency", "/partnerships",
    "/support", "/terms", "/privacy", "/login", "/signup", "/forgot-password",
    "/nanny-in/dubai", "/nanny-in/abu-dhabi",
  ],
  family: [
    "/family", "/family/matches", "/family/jobs", "/family/jobs/new",
    "/family/saved", "/family/profile", "/family/messages", "/family/subscription",
    "/account",
  ],
  nanny: [
    "/nanny", "/nanny/applications", "/nanny/messages", "/nanny/profile",
    "/nanny/settings",
  ],
  admin: [
    "/admin", "/admin/review", "/admin/users", "/admin/invites", "/admin/reports",
    "/admin/support", "/admin/jobs", "/admin/blog", "/admin/pricing",
    "/admin/referral", "/admin/reminders", "/admin/insights", "/admin/audit",
  ],
};

const ACCOUNTS = {
  family: "family1@nananny.example.test",
  nanny: "nanny1@nananny.example.test",
  admin: "admin@nananny.example.test",
};

const findings = [];

const browser = await webkit.launch();

for (const [role, paths] of Object.entries(PAGES)) {
  const list = ONLY ? paths.filter((p) => p === ONLY) : paths;
  if (list.length === 0) continue;

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: 1000 },
    baseURL: BASE,
  });
  const page = await context.newPage();

  if (role !== "anon") {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(ACCOUNTS[role]);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });
  }

  for (const path of list) {
    try {
      await page.goto(path, { waitUntil: "networkidle", timeout: 45000 });
    } catch {
      console.log(`  SKIP  ${path} did not settle`);
      continue;
    }
    await page.waitForTimeout(250);

    const problems = await page.evaluate(() => {
      const out = [];
      const label = (el) => {
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
        return text.length > 70 ? `${text.slice(0, 70)}...` : text;
      };

      /**
       * Form controls, which the first version of this walked straight past.
       *
       * It looked at "body *" and read scrollWidth, and a <select> does not
       * report its chosen option that way: the option can need 108px in a
       * 99px cell and scrollWidth still says everything fits. So the site had
       * one genuinely truncated control on the homepage and this tool called
       * the site clean. Measured here by rendering the selected option's text
       * into a canvas at the element's own font and comparing.
       */
      const fit = document.createElement("canvas").getContext("2d");
      for (const el of document.querySelectorAll("select, button, option")) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0) continue;

        const shown = el.tagName === "SELECT"
          ? (el.options[el.selectedIndex]?.text ?? "")
          : (el.textContent ?? "").trim();
        if (!shown) continue;

        fit.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const needed = fit.measureText(shown).width;
        const padding =
          parseFloat(style.paddingLeft || "0") + parseFloat(style.paddingRight || "0");
        /**
         * The arrow, counted once.
         *
         * A native select draws its arrow outside the padding box; this one is
         * `appearance-none` with `pr-10`, so the room for the chevron is
         * already in paddingRight. Subtracting a fixed allowance on top of
         * that took 24px away twice and reported five perfectly fine filters
         * as truncated. Only allow for an arrow when the padding is too small
         * to be holding one.
         */
        const chrome = el.tagName === "SELECT" && parseFloat(style.paddingRight || "0") < 24 ? 20 : 0;
        const room = rect.width - padding - chrome;

        if (needed > room + 1) {
          out.push({
            kind: "CLIPPED",
            text: shown,
            detail: `${el.tagName.toLowerCase()} needs ${Math.round(needed)}px, has ${Math.round(room)}px`,
          });
        }
      }

      for (const el of document.querySelectorAll("body *")) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const text = (el.textContent ?? "").trim();
        if (!text) continue;

        /**
         * Screen reader labels are 1px on purpose and are not a fault.
         *
         * The first run of this reported "Where", "Sort by" and "Job status"
         * as clipped text. They are sr-only labels: a real label for somebody
         * using a screen reader, sized to nothing for everybody else. Counting
         * them would train whoever reads this output to skim past it, which is
         * how a real finding gets missed.
         */
        const srOnly = rect.width <= 2 || rect.height <= 2 || style.clipPath !== "none";
        if (srOnly) continue;

        // CLIPPED: the element hides its own text sideways.
        const hidesX = style.overflowX === "hidden" || style.overflow === "hidden";
        if (hidesX && el.scrollWidth > el.clientWidth + 1 && el.children.length === 0) {
          out.push({ kind: "CLIPPED", text: label(el), detail: `${el.scrollWidth}px of text in ${el.clientWidth}px` });
          continue;
        }

        // CLAMPED: a line-clamp actually cutting lines off.
        if (style.webkitLineClamp && style.webkitLineClamp !== "none") {
          if (el.scrollHeight > el.clientHeight + 1) {
            out.push({ kind: "CLAMPED", text: label(el), detail: `clamped to ${style.webkitLineClamp} lines`, deliberate: true });
            continue;
          }
        }

        // HUDDLED: a paragraph using a fraction of the room it has.
        const isText = ["P", "H1", "H2", "H3", "LI", "SPAN", "DIV"].includes(el.tagName);
        const leaf = el.children.length === 0;
        if (isText && leaf && text.length > 60) {
          const parent = el.parentElement;
          if (!parent) continue;
          const room = parent.getBoundingClientRect().width;
          if (room < 480) continue;
          /**
           * Real lines, not text nodes.
           *
           * getClientRects() returns one rect per text fragment, so a sentence
           * built from three expressions came back as "three lines" of 312px
           * each when it was one line of 940px. That artefact reported the
           * audit log as the worst offender on the site while it was perfectly
           * fine. Rects are merged by their top edge, which is what a line
           * actually is.
           */
          const range = document.createRange();
          range.selectNodeContents(el);
          const tops = new Map();
          for (const r of range.getClientRects()) {
            if (r.width === 0) continue;
            const key = Math.round(r.top);
            const seen = tops.get(key);
            tops.set(key, seen ? { left: Math.min(seen.left, r.left), right: Math.max(seen.right, r.right) } : { left: r.left, right: r.right });
          }
          const lines = [...tops.values()].map((l) => l.right - l.left);
          if (lines.length < 3) continue;
          const longest = Math.max(...lines);

          /**
           * Measured against the element's own box, not its parent's.
           *
           * A paragraph capped at a reading measure is a decision, not a
           * defect: 576px of text inside a 900px column is how prose is meant
           * to be set. What is worth reporting is text that fails to fill the
           * box it was actually given, which is what ragged wrapping looks
           * like.
           */
          const own = rect.width;
          const use = longest / own;
          if (use < 0.75 && own > 480) {
            out.push({
              kind: "HUDDLED",
              text: label(el),
              detail: `longest line ${Math.round(longest)}px in a ${Math.round(own)}px box (${Math.round(use * 100)}%), ${lines.length} lines`,
            });
          }
        }
      }
      return out;
    });

    if (problems.length > 0) {
      console.log(`\n  ${path}  (${role})`);
      for (const p of problems) {
        console.log(`    ${p.kind}  ${p.detail}\n      "${p.text}"`);
        findings.push({ path, role, ...p });
      }
    }
  }

  await context.close();
}

await browser.close();

/**
 * A clamp is a decision somebody made, so it is listed and not counted.
 *
 * Cards in a grid clamp their description to keep every card the same height,
 * which is the whole reason the grid reads as a grid. Failing on it would mean
 * failing on the design rather than on a defect.
 */
const faults = findings.filter((f) => !f.deliberate);
const byKind = faults.reduce((acc, f) => ({ ...acc, [f.kind]: (acc[f.kind] ?? 0) + 1 }), {});
const clamps = findings.length - faults.length;
console.log(`\n${faults.length} faults at ${WIDTH}px:`, JSON.stringify(byKind), `(plus ${clamps} deliberate clamps, listed above and not counted)`);
process.exit(faults.length ? 1 : 0);
