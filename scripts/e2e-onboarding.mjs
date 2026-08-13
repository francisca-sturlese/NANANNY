/**
 * End-to-end walkthrough of Milestone 2, driven on a phone-sized viewport.
 *
 * Not a smoke test: it signs up a real account, pulls the real verification
 * email out of Mailpit, follows the real link, completes the real wizard and
 * asserts the values actually landed in the database.
 *
 * Requires the dev server on 3100 and the Supabase stack running.
 *
 * Run:  node scripts/e2e-onboarding.mjs [--shots]
 */

import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { webkit, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54424";
const SHOTS = new URL("../screenshots/", import.meta.url).pathname;
const WANT_SHOTS = process.argv.includes("--shots");

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

// A fresh address per run, so re-running never trips over an existing account.
const stamp = Date.now();
const FAMILY_EMAIL = `e2e-family-${stamp}@nananny.example.test`;
const NANNY_EMAIL = `e2e-nanny-${stamp}@nananny.example.test`;
const PASSWORD = "NaNannyE2E2026!";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Pulls the newest message for an address out of Mailpit and returns its links. */
async function verificationLink(email) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(email)}`);
    const json = await res.json();
    if (json.messages?.length) {
      const id = json.messages[0].ID;
      const body = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
      const source = `${body.HTML ?? ""}${body.Text ?? ""}`;
      const match = source.match(/https?:\/\/[^\s"'<>]*(?:token_hash|confirm)[^\s"'<>]*/i);
      if (match) return match[0].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

await mkdir(SHOTS, { recursive: true });

const browser = await webkit.launch();
const context = await browser.newContext({
  ...devices["iPhone 13"],
  baseURL: BASE,
});
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e)));
const failedRequests = [];
page.on("response", (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`); });

const shot = async (name) => {
  if (WANT_SHOTS) await page.screenshot({ path: `${SHOTS}e2e-${name}.png`, fullPage: true });
};

console.log("\n--- FAMILY ---\n");

// ---------------------------------------------------------------- signup
await page.goto("/signup");
await page.getByLabel("First name").fill("Aisha");
await page.getByLabel("Last name").fill("Testfamily");
await page.getByLabel("Email").fill(FAMILY_EMAIL);
await page.getByLabel("Password").fill(PASSWORD);
await shot("01-signup");
await page.getByRole("button", { name: "Create account" }).click();
await page.waitForURL(/verify-email/, { timeout: 20000 });
check("family signup lands on verify-email", true);
await shot("02-verify-email");

// The role must be what the database decided, not what the form claimed.
const { data: created } = await db
  .from("users")
  .select("role, status")
  .eq("email", FAMILY_EMAIL)
  .single();
check("role stored server-side as 'family'", created?.role === "family", `got ${created?.role}`);

// ------------------------------------------------- protected route while unverified
await page.goto("/family");
check(
  "unverified account is kept out of the dashboard",
  /verify-email|login/.test(page.url()) && !/\/family(\?|$)/.test(page.url()),
  page.url().replace(BASE, ""),
);

// ---------------------------------------------------------------- verify email
const link = await verificationLink(FAMILY_EMAIL);
check("verification email arrived with a link", Boolean(link));
if (!link) process.exit(1);

await page.goto(link);
await page.waitForURL(/onboarding/, { timeout: 20000 });
check(
  "verified link routes into family onboarding",
  /family\/onboarding/.test(page.url()),
  page.url(),
);
if (!/family\/onboarding/.test(page.url())) {
  console.log("    page title:", await page.title());
  console.log("    body head:", (await page.locator("body").innerText()).slice(0, 300).replace(/\n+/g, " | "));
}

// ---------------------------------------------------------------- onboarding
await shot("03-onboarding-about");
await page.getByLabel(/How should nannies refer/).fill("The Testfamily family");
await page.getByLabel("Emirate").selectOption("Dubai");
await page.getByLabel("Area").fill("Dubai Hills");
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForURL(/onboarding\/children/, { timeout: 15000 });
check("step 1 saved and advanced", true);

// Children
// The stepper is React state, so it only responds once the page has
// hydrated. Retry rather than assume: a real phone on a slow connection has
// the same brief window where a tap does nothing.
await page.getByRole("button", { name: "One more child" }).click();
const ageInputs = page.locator('input[name="childAge"]');
for (let i = 0; i < 20 && (await ageInputs.count()) < 2; i++) {
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "One more child" }).click();
}
check("child stepper adds an age field", (await ageInputs.count()) >= 2, `${await ageInputs.count()} fields`);
await ageInputs.nth(0).fill("2");
await ageInputs.nth(1).fill("5");
await shot("04-onboarding-children");
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForURL(/onboarding\/care/, { timeout: 15000 });

// Care
await page.getByText("Live out", { exact: true }).first().click();
await page.getByText("Full time", { exact: true }).first().click();
for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri"]) {
  await page.getByText(day, { exact: true }).first().click();
}
await shot("05-onboarding-care");
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForURL(/onboarding\/requirements/, { timeout: 15000 });

// Requirements
await page.getByLabel(/Monthly budget from/).fill("4000");
await page.getByLabel(/Up to \(AED\)/).fill("5000");
await page.getByText("English", { exact: true }).first().click();
await page.getByText(/Toddler \(1 to 3 years\)/).first().click();
await shot("06-onboarding-requirements");
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForURL(/onboarding\/finishing/, { timeout: 15000 });

// Finishing
await page.getByLabel(/When would you like her to start/).fill("2026-09-01");
await shot("07-onboarding-finishing");
await page.getByRole("button", { name: "Finish", exact: true }).click();
await page.waitForURL((u) => /^\/family\/?$/.test(u.pathname), { timeout: 20000 });
await page.waitForLoadState("networkidle");
check("onboarding completed and reached the dashboard", /\/family(\?|$)/.test(page.url()), page.url());
await shot("08-family-dashboard");

// ---------------------------------------------------------------- persistence
const { data: familyRow } = await db
  .from("family_profiles")
  .select("id, display_name, emirate, area, children_count, profile_completion, onboarding_completed_at")
  .eq("user_id", (await db.from("users").select("id").eq("email", FAMILY_EMAIL).single()).data.id)
  .single();

check("display name persisted", familyRow?.display_name === "The Testfamily family");
check("location persisted", familyRow?.emirate === "Dubai" && familyRow?.area === "Dubai Hills");
check("children count persisted", familyRow?.children_count === 2);
check("onboarding marked complete", Boolean(familyRow?.onboarding_completed_at));

const { count: childCount } = await db
  .from("family_children")
  .select("*", { count: "exact", head: true })
  .eq("family_id", familyRow.id);
check("both children stored", childCount === 2, `got ${childCount}`);

const { data: reqRow } = await db
  .from("family_requirements")
  .select("arrangement, salary_min_aed, salary_max_aed, languages, needs_toddler_care, working_days, start_date")
  .eq("family_id", familyRow.id)
  .eq("is_primary", true)
  .single();

check("arrangement persisted", reqRow?.arrangement === "live_out", `got ${reqRow?.arrangement}`);
check("salary range persisted", reqRow?.salary_min_aed === 4000 && reqRow?.salary_max_aed === 5000);
check("languages persisted", reqRow?.languages?.includes("English"));
check("toddler need persisted", reqRow?.needs_toddler_care === true);
check("working days persisted", reqRow?.working_days?.length === 5, `got ${reqRow?.working_days?.length}`);

// The percentage on screen must be the one the database computed.
const { data: recomputed } = await db.rpc("family_profile_completion", {
  p_family_id: familyRow.id,
});
check(
  "completion percentage is accurate",
  recomputed.percent === familyRow.profile_completion,
  `stored ${familyRow.profile_completion}, computed ${recomputed.percent}`,
);

const shownPercent = await page.locator("text=/\\d+%/").first().textContent();
check(
  "dashboard shows the same percentage",
  shownPercent?.trim() === `${recomputed.percent}%`,
  `shown ${shownPercent?.trim()}`,
);

// ---------------------------------------------------- cross-role authorization
await page.goto("/nanny");
check(
  "a family cannot open the nanny dashboard",
  !/\/nanny(\?|$)/.test(page.url()),
  page.url().replace(BASE, ""),
);

await page.goto("/admin");
check(
  "a family cannot open the admin queue",
  !/\/admin(\?|$)/.test(page.url()),
  page.url().replace(BASE, ""),
);

// ---------------------------------------------------------------- logout
await page.goto("/family");
await page.getByRole("button", { name: "Log out" }).click();
await page.waitForURL((u) => !/\/family/.test(u.pathname), { timeout: 15000 });
await page.goto("/family");
check("after logout the dashboard redirects to login", /login/.test(page.url()));

console.log("\n--- NANNY ---\n");

// ---------------------------------------------------------------- nanny signup
await page.goto("/signup?role=nanny");
await page.getByLabel("First name").fill("Grace");
await page.getByLabel("Last name").fill("Testnanny");
await page.getByLabel("Email").fill(NANNY_EMAIL);
await page.getByLabel("Password").fill(PASSWORD);
await page.getByRole("button", { name: "Create account" }).click();
await page.waitForURL(/verify-email/, { timeout: 20000 });

const { data: nannyUser } = await db
  .from("users")
  .select("id, role")
  .eq("email", NANNY_EMAIL)
  .single();
check("nanny role stored server-side", nannyUser?.role === "nanny", `got ${nannyUser?.role}`);

const nannyLink = await verificationLink(NANNY_EMAIL);
check("nanny verification email arrived", Boolean(nannyLink));
if (nannyLink) {
  await page.goto(nannyLink);
  await page.waitForURL(/nanny\/onboarding/, { timeout: 20000 });
  check("nanny lands in her own onboarding", /nanny\/onboarding/.test(page.url()));
  await shot("09-nanny-onboarding");

  // A brand-new nanny profile must start as a draft, invisible to families.
  const { data: nannyProfile } = await db
    .from("nanny_profiles")
    .select("status, profile_completion")
    .eq("user_id", nannyUser.id)
    .single();
  check("new nanny profile starts as draft", nannyProfile?.status === "draft", `got ${nannyProfile?.status}`);

  // And she cannot be found by an anonymous visitor.
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: publicRows } = await anon
    .from("nanny_profiles")
    .select("id")
    .eq("user_id", nannyUser.id);
  check(
    "a draft profile is invisible to anonymous visitors",
    !publicRows || publicRows.length === 0,
    `${publicRows?.length ?? 0} rows visible`,
  );

  // Submitting an empty profile must be refused by the database.
  await page.goto("/nanny/onboarding/review");
  const submitButton = page.getByRole("button", { name: /Submit profile for review/ });
  check("submit is disabled while the profile is incomplete", await submitButton.isDisabled());
  await shot("10-nanny-review-blocked");
}

await context.close();
await browser.close();

// ---------------------------------------------------------------- clean up
for (const email of [FAMILY_EMAIL, NANNY_EMAIL]) {
  const { data } = await db.from("users").select("id").eq("email", email).maybeSingle();
  if (data) await db.auth.admin.deleteUser(data.id);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  process.exitCode = 1;
}
