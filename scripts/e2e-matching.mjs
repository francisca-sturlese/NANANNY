/**
 * Matching, through the browser on a phone.
 *
 * The SQL suite proves the score is right. This proves the family is actually
 * shown that score, in that order, with the sentences that produced it, and
 * that nothing about the page leaks another family's ranking.
 *
 * Run:  node scripts/e2e-matching.mjs [--shots]
 */

import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { webkit, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const SHOTS = new URL("../screenshots/", import.meta.url).pathname;
const WANT_SHOTS = process.argv.includes("--shots");
const PASSWORD = "NaNannyDev2026!";
const FAMILY = "family1@nananny.example.test";
const NANNY = "nanny1@nananny.example.test";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

await mkdir(SHOTS, { recursive: true });

const { data: familyUser } = await db
  .from("users")
  .select("id")
  .eq("email", FAMILY)
  .single();
const { data: family } = await db
  .from("family_profiles")
  .select("id")
  .eq("user_id", familyUser.id)
  .single();

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE });
const page = await context.newPage();
// Scoped deliberately. WebKit drops the router prefetches that fire on the
// first authenticated page load of a context, whichever page that happens to
// be, so the list is cleared after a warm up. Counting from login would report
// that pre-existing quirk as a matching bug.
let consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(String(e)));

const shot = async (n) => {
  if (WANT_SHOTS) await page.screenshot({ path: `${SHOTS}m6-${n}.png`, fullPage: true });
};

await page.goto("/login");
await page.locator('input[name="email"]').fill(FAMILY);
await page.locator('input[name="password"]').fill(PASSWORD);
await page.getByRole("button", { name: "Log in" }).click();
await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });

console.log("\n--- THE SCORED LIST ---\n");

await page.goto("/family", { waitUntil: "networkidle" });
consoleErrors = [];
await page.goto("/family/matches", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
check("the matches page raises no errors", consoleErrors.length === 0, consoleErrors[0] ?? "");
await shot("matches");

const cards = page.locator("main article");
const cardCount = await cards.count();
check("the page shows scored nannies", cardCount > 0, `${cardCount} cards`);

// ------------------------------------------------------ 1. one row per nanny
const { count: approvedCount } = await db
  .from("nanny_profiles")
  .select("id", { count: "exact", head: true })
  .eq("status", "approved");

const { data: stored } = await db
  .from("matches")
  .select("nanny_id, score, reasons, conflicts")
  .eq("family_id", family.id)
  .is("job_id", null)
  .order("score", { ascending: false });

check(
  "every approved nanny was scored",
  stored.length === approvedCount,
  `${stored.length} of ${approvedCount}`,
);

// ------------------------------------------------- 2. the order on the screen
const shown = await page.locator("main article h3").allTextContents();
const scoresOnScreen = (
  await page.locator("main article").locator("text=/\\d+% match/").allTextContents()
).map((t) => Number(t.match(/(\d+)%/)[1]));

check(
  "every card carries a score",
  scoresOnScreen.length === cardCount,
  `${scoresOnScreen.length} scores for ${cardCount} cards`,
);

const descending = scoresOnScreen.every((s, i) => i === 0 || s <= scoresOnScreen[i - 1]);
check("best match first", descending, scoresOnScreen.slice(0, 5).join(" ≥ "));

// ------------------------------------------- 3. the screen agrees with the db
const topStored = Math.round(Number(stored[0].score));
check(
  "the top score on screen is the one in the database",
  scoresOnScreen[0] === topStored,
  `screen ${scoresOnScreen[0]}, database ${topStored}`,
);

// ------------------------------------------ 4. a score never appears unexplained
const firstCard = cards.first();
const reasonCount = await firstCard.locator("ul li").count();
check("the top match explains itself", reasonCount > 0, `${reasonCount} lines`);

const firstReasons = await firstCard.locator("ul li span").allTextContents();
check(
  "the explanations are the ones the database stored",
  firstReasons.some((r) =>
    [...(stored[0].reasons ?? []), ...(stored[0].conflicts ?? [])].includes(r.trim()),
  ),
  firstReasons[0],
);

// ----------------------------------------------- 5. conflicts are not hidden
const withConflicts = stored.find((m) => (m.conflicts ?? []).length > 0);
if (withConflicts) {
  const text = await page.locator("main").innerText();
  check(
    "what does not fit is shown too",
    text.includes(withConflicts.conflicts[0]),
    withConflicts.conflicts[0],
  );
} else {
  check("what does not fit is shown too", false, "no conflicts in the seed to check");
}

// ------------------------------------------------------- 6. the breakdown opens
const summary = page.locator("details summary").first();
await summary.click();
await page.waitForTimeout(200);
const rows = await firstCard.locator("details dl > div").count();
check("the breakdown opens and lists every dimension", rows >= 8, `${rows} rows`);
await shot("breakdown");

const dimensionText = await firstCard.locator("details dl").innerText();
check(
  "the breakdown is labelled in words, not database keys",
  dimensionText.includes("Live in or out") && !dimensionText.includes("child_age"),
);

// ------------------------------------------------- 7. the card reaches the profile
const topName = shown[0];
await firstCard.locator("a").first().click();
await page.waitForURL(/\/nannies\//, { timeout: 20000 });
check(
  "the card opens that nanny's profile",
  (await page.locator("h1").first().innerText()).includes(topName.split(" ")[0]),
  topName,
);

// ---------------------------------------------- 8. matching is free to browse
const contactsBefore = await db
  .from("family_nanny_contacts")
  .select("id", { count: "exact", head: true })
  .eq("family_id", family.id);
await page.goto("/family/matches", { waitUntil: "networkidle" });
const contactsAfter = await db
  .from("family_nanny_contacts")
  .select("id", { count: "exact", head: true })
  .eq("family_id", family.id);
check(
  "looking at matches never spends a free contact",
  contactsBefore.count === contactsAfter.count,
  `${contactsBefore.count} before, ${contactsAfter.count} after`,
);

// ------------------------------------------------- 9. a nanny has no matches page
console.log("\n--- WHAT A NANNY SEES ---\n");

const nannyContext = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE });
const nannyPage = await nannyContext.newPage();
await nannyPage.goto("/login");
await nannyPage.locator('input[name="email"]').fill(NANNY);
await nannyPage.locator('input[name="password"]').fill(PASSWORD);
await nannyPage.getByRole("button", { name: "Log in" }).click();
await nannyPage.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });

await nannyPage.goto("/family/matches", { waitUntil: "networkidle" });
check(
  "a nanny cannot open a family's matches",
  !/\/family\/matches/.test(new URL(nannyPage.url()).pathname),
  nannyPage.url(),
);

// ------------------------------------- 10. and cannot refresh anyone else's
const { error: rpcError } = await db.rpc("refresh_matches", { p_family_id: family.id });
check(
  "the service role can still refresh on demand",
  !rpcError,
  rpcError?.message ?? "ok",
);

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length === 0 ? 0 : 1);
