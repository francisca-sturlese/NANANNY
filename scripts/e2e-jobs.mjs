/**
 * End-to-end walkthrough of Milestone 3, on a phone viewport.
 *
 * Search → save → shortlist, then a family posts a job, a nanny applies, and
 * the family reviews it. Asserts against the database at each step, and checks
 * the invariant the whole business model rests on: none of this spends a free
 * contact.
 *
 * Uses the seeded accounts, so run after `npm run db:reset`.
 *
 * Run:  node scripts/e2e-jobs.mjs [--shots]
 */

import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { webkit, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const SHOTS = new URL("../screenshots/", import.meta.url).pathname;
const WANT_SHOTS = process.argv.includes("--shots");
const PASSWORD = "NaNannyDev2026!";

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

const browser = await webkit.launch();

async function session() {
  const context = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE });
  return { context, page: await context.newPage() };
}

async function login(page, email) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });
}

const shot = async (page, name) => {
  if (WANT_SHOTS) await page.screenshot({ path: `${SHOTS}m3-${name}.png`, fullPage: true });
};

// ---------------------------------------------------------------- baseline
const { data: familyUser } = await db
  .from("users")
  .select("id")
  .eq("email", "family1@nananny.example.test")
  .single();
const { data: familyProfile } = await db
  .from("family_profiles")
  .select("id")
  .eq("user_id", familyUser.id)
  .single();

await db.from("saved_profiles").delete().eq("family_id", familyProfile.id);

const contactsBefore = (
  await db.rpc("family_contact_state", { p_family_id: familyProfile.id })
).data[0].free_contacts_used;

console.log("\n--- SEARCH & SHORTLIST (family) ---\n");

const fam = await session();
await login(fam.page, "family1@nananny.example.test");

// ---------------------------------------------------------------- search
await fam.page.goto("/nannies");
await fam.page.waitForLoadState("networkidle");
const cardCount = await fam.page.locator("article").count();
check("search lists approved nannies", cardCount > 0, `${cardCount} cards`);
await shot(fam.page, "01-search");

// The filter sheet is the phone's whole filtering experience.
await fam.page.getByRole("button", { name: /Filters/ }).click();
await fam.page.getByRole("dialog", { name: "Filters" }).waitFor({ timeout: 5000 });
check("filter sheet opens on mobile", true);
await shot(fam.page, "02-filter-sheet");

await fam.page.locator('select[name="experience"]').selectOption("5");
await fam.page.getByRole("button", { name: /Show \d+ nann/ }).click();
await fam.page.waitForURL(/experience=5/, { timeout: 10000 });
await fam.page.waitForLoadState("networkidle");

const filteredCount = await fam.page.locator("article").count();
check(
  "applying a filter narrows the list",
  filteredCount > 0 && filteredCount <= cardCount,
  `${cardCount} → ${filteredCount}`,
);

// Every remaining nanny really does have 5+ years.
const { count: expected } = await db
  .from("nanny_profiles")
  .select("*", { count: "exact", head: true })
  .eq("status", "approved")
  .gte("years_experience", 5);
check("filtered count matches the database", filteredCount === expected, `db says ${expected}`);

// ---------------------------------------------------------------- save
await fam.page.goto("/nannies");
await fam.page.waitForLoadState("networkidle");
await fam.page.locator('button[aria-label="Save this profile"]').first().click();
await fam.page.waitForTimeout(1500);

const { count: savedCount } = await db
  .from("saved_profiles")
  .select("*", { count: "exact", head: true })
  .eq("family_id", familyProfile.id);
check("saving a profile persists", savedCount > 0, `${savedCount} saved`);

await fam.page.goto("/family/saved");
await fam.page.waitForLoadState("networkidle");
check(
  "the saved profile appears on the shortlist",
  (await fam.page.locator("article").count()) > 0,
);
await shot(fam.page, "03-shortlist");

// Move it to a later stage, then poll rather than guess at a fixed delay.
await fam.page.locator('select[name="stage"]').first().selectOption("interview");

let stageRow = null;
for (let i = 0; i < 20; i++) {
  await fam.page.waitForTimeout(300);
  const { data } = await db
    .from("saved_profiles")
    .select("stage")
    .eq("family_id", familyProfile.id)
    .limit(1)
    .maybeSingle();
  stageRow = data;
  if (stageRow?.stage === "interview") break;
}
check("shortlist stage change persists", stageRow?.stage === "interview", `stage ${stageRow?.stage}`);

// And the screen must agree with the database, not lag a step behind it.
// Polled rather than waited on a fixed delay: the router refresh that pulls the
// saved row is asynchronous, and a fixed timeout only encodes today's speed.
let shownStage = "";
for (let i = 0; i < 25; i++) {
  shownStage = await fam.page.locator('select[name="stage"]').first().inputValue();
  if (shownStage === "interview") break;
  await fam.page.waitForTimeout(200);
}
check("the shortlist screen shows the saved stage", shownStage === "interview", shownStage);

// ---------------------------------------------------------------- post a job
console.log("\n--- JOB POSTING (family) ---\n");

await fam.page.goto("/family/jobs/new");
await fam.page.waitForLoadState("networkidle");

const jobTitle = `E2E live-out nanny ${Date.now()}`;
await fam.page.getByLabel("Job title").fill(jobTitle);
await fam.page.getByLabel("Emirate").selectOption("Dubai");
await fam.page
  .getByLabel("What the role involves")
  .fill(
    "School runs each morning, lunch and afternoon play, then the bedtime routine. Two children, both settled.",
  );
await fam.page.getByLabel("Salary from (AED)").fill("4000");
await fam.page.getByLabel("Up to (AED)").fill("5200");
await shot(fam.page, "04-job-form");

await fam.page.getByRole("button", { name: "Publish job" }).click();
await fam.page.waitForURL((u) => /^\/family\/jobs\/?$/.test(u.pathname), { timeout: 20000 });
await fam.page.waitForLoadState("networkidle");

const { data: job } = await db
  .from("jobs")
  .select("id, status, salary_min_aed, salary_max_aed, emirate")
  .eq("title", jobTitle)
  .maybeSingle();

check("job was created", Boolean(job));
check("job is published as active", job?.status === "active", `status ${job?.status}`);
check("job salary persisted", job?.salary_min_aed === 4000 && job?.salary_max_aed === 5200);
await shot(fam.page, "05-family-jobs");

// It must now be publicly visible.
const publicJobs = await fetch(`${BASE}/jobs`).then((r) => r.text());
check("the published job is visible on the public jobs page", publicJobs.includes(jobTitle));

await fam.context.close();

// ---------------------------------------------------------------- apply
console.log("\n--- APPLYING (nanny) ---\n");

const nan = await session();
await login(nan.page, "nanny1@nananny.example.test");

await nan.page.goto(`/jobs/${job.id}`);
await nan.page.waitForLoadState("networkidle");
await shot(nan.page, "06-job-detail");

await nan.page.getByRole("button", { name: "Apply for this job" }).click();
await nan.page.getByRole("button", { name: "Send application" }).click();
await nan.page.waitForTimeout(2000);

const { data: application } = await db
  .from("job_applications")
  .select("id, status, nanny_id")
  .eq("job_id", job.id)
  .maybeSingle();

check("application was recorded", Boolean(application), `status ${application?.status}`);

await nan.page.goto("/nanny/applications");
await nan.page.waitForLoadState("networkidle");
check(
  "the application appears in her list",
  (await nan.page.getByText(jobTitle).count()) > 0,
);
await shot(nan.page, "07-nanny-applications");

// THE invariant: none of that touched the family's allowance.
const contactsAfter = (
  await db.rpc("family_contact_state", { p_family_id: familyProfile.id })
).data[0].free_contacts_used;
check(
  "applying did not consume a free contact",
  contactsAfter === contactsBefore,
  `${contactsBefore} → ${contactsAfter}`,
);

const { count: contactRows } = await db
  .from("family_nanny_contacts")
  .select("*", { count: "exact", head: true })
  .eq("family_id", familyProfile.id);
check("no contact row was created", contactRows === 0, `${contactRows} rows`);

// A nanny must not reach family-only screens.
await nan.page.goto("/family/jobs");
check(
  "a nanny cannot open the family job manager",
  !/\/family\/jobs/.test(nan.page.url()),
  nan.page.url().replace(BASE, ""),
);

await nan.context.close();

// ---------------------------------------------------------------- review
console.log("\n--- REVIEWING (family) ---\n");

const fam2 = await session();
await login(fam2.page, "family1@nananny.example.test");

await fam2.page.goto(`/family/jobs/${job.id}/applications`);
await fam2.page.waitForLoadState("networkidle");
check(
  "the family sees the application",
  (await fam2.page.locator("li").filter({ hasText: "Maria" }).count()) > 0 ||
    (await fam2.page.getByText(/1 application/).count()) > 0,
);
await shot(fam2.page, "08-applications");

await fam2.page.locator('select[name="status"]').first().selectOption("shortlisted");
await fam2.page.waitForTimeout(1500);

const { data: updated } = await db
  .from("job_applications")
  .select("status")
  .eq("id", application.id)
  .single();
check("application stage change persists", updated.status === "shortlisted", updated.status);

const contactsFinal = (
  await db.rpc("family_contact_state", { p_family_id: familyProfile.id })
).data[0].free_contacts_used;
check(
  "reviewing did not consume a free contact either",
  contactsFinal === contactsBefore,
  `${contactsBefore} → ${contactsFinal}`,
);

await fam2.context.close();
await browser.close();

// ---------------------------------------------------------------- clean up
await db.from("job_applications").delete().eq("job_id", job.id);
await db.from("jobs").delete().eq("id", job.id);
await db.from("saved_profiles").delete().eq("family_id", familyProfile.id);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  process.exitCode = 1;
}
