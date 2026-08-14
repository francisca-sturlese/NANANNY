/**
 * The back office, driven through the browser.
 *
 * Checks the things an operator actually relies on: that a pricing change
 * reaches the public site, that suspending an account really removes the
 * profile from search, that a badge appears where families see it, and that
 * every one of those actions is written to the audit log.
 *
 * Run:  node scripts/e2e-admin.mjs [--shots]
 */

import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { webkit, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const SHOTS = new URL("../screenshots/", import.meta.url).pathname;
const WANT_SHOTS = process.argv.includes("--shots");
const PASSWORD = "NaNannyDev2026!";
const ADMIN = "admin@nananny.example.test";

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

const originalPricing = (await db.from("pricing_config").select("*").single()).data;

const browser = await webkit.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const shot = async (n) => {
  if (WANT_SHOTS) await page.screenshot({ path: `${SHOTS}admin-${n}.png`, fullPage: true });
};

await page.goto(`${BASE}/login`);
await page.locator('input[name="email"]').fill(ADMIN);
await page.locator('input[name="password"]').fill(PASSWORD);
await page.getByRole("button", { name: "Log in" }).click();
await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });
check("admin lands in the back office", /\/admin/.test(page.url()), page.url().replace(BASE, ""));

console.log("\n--- SECTIONS ---\n");

for (const [path, heading] of [
  ["/admin", "Overview"],
  ["/admin/review", "Nanny review queue"],
  ["/admin/users", "Users"],
  ["/admin/reports", "Reports"],
  ["/admin/jobs", "Jobs"],
  ["/admin/pricing", "Pricing"],
  ["/admin/audit", "Audit log"],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const h1 = await page.locator("h1").first().innerText();
  check(`${path} loads`, h1.includes(heading), h1);
  if (path === "/admin") await shot("01-overview");
}

// The overview must show real numbers, not zeroes from a failed query.
await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
const overview = await page.locator("main").innerText();
const { count: nannyCount } = await db
  .from("nanny_profiles")
  .select("*", { count: "exact", head: true })
  .eq("status", "approved");
check(
  "the overview shows the real approved-nanny count",
  overview.includes(String(nannyCount)),
  `expected ${nannyCount}`,
);
check("the funnel section is present", /contact funnel/i.test(overview));

console.log("\n--- PRICING REACHES THE PUBLIC SITE ---\n");

await page.goto(`${BASE}/admin/pricing`, { waitUntil: "networkidle" });
await shot("02-pricing");

const newFree = 4;
const newWeekly = 99;
const newMonthly = 279;

await page.getByLabel("Free nanny contacts").fill(String(newFree));
await page.getByLabel("Weekly price (AED)").fill(String(newWeekly));
await page.getByLabel("Monthly price (AED)").fill(String(newMonthly));
await page.getByRole("button", { name: "Save pricing" }).click();
await page.getByText(/live everywhere immediately/).waitFor({ timeout: 15000 });

const stored = (await db.from("pricing_config").select("*").single()).data;
check(
  "pricing was stored",
  stored.free_contacts === newFree && Number(stored.monthly_price_aed) === newMonthly,
  `${stored.free_contacts} free, ${stored.monthly_price_aed} monthly`,
);

// The point of server-side pricing: the public page must change with no deploy.
const stripComments = (html) => html.replace(/<!--.*?-->/g, "");
const publicPricing = stripComments(await fetch(`${BASE}/pricing`).then((r) => r.text()));
check(
  "the public pricing page shows the new monthly price",
  publicPricing.includes(String(newMonthly)),
  `looking for ${newMonthly}`,
);
// The phrasing differs during a launch window, where the allowance is
// described as what happens afterwards rather than as the current state. What
// must hold in both is that the number came from the database and reached the
// page with no deploy, which is the thing this test is actually about.
check(
  "the public pricing page shows the new free allowance",
  publicPricing.includes(`first ${newFree} nanny contacts`),
  `looking for "first ${newFree} nanny contacts"`,
);

const home = stripComments(await fetch(BASE).then((r) => r.text()));
check("the homepage shows the new allowance too", home.includes(`first ${newFree}`));

// The gate itself must follow the configuration, not a hardcoded 3.
const { data: anyFamily } = await db.from("family_profiles").select("id").limit(1).single();
const { data: state } = await db.rpc("family_contact_state", { p_family_id: anyFamily.id });
check(
  "the contact gate uses the new allowance",
  state[0].free_contacts_limit === newFree,
  `limit is ${state[0].free_contacts_limit}`,
);

// Guardrail: both plans off would mean nobody could ever pay.
await page.getByLabel("Offer the weekly plan").uncheck();
await page.getByLabel("Offer the monthly plan").uncheck();
await page.getByRole("button", { name: "Save pricing" }).click();
await page.waitForTimeout(2000);
const afterBoth = (await db.from("pricing_config").select("*").single()).data;
check(
  "turning both plans off is refused",
  afterBoth.weekly_enabled || afterBoth.monthly_enabled,
  `weekly=${afterBoth.weekly_enabled} monthly=${afterBoth.monthly_enabled}`,
);

console.log("\n--- SUSPENDING AN ACCOUNT ---\n");

const { data: victim } = await db
  .from("nanny_profiles")
  .select("id, user_id, first_name, status")
  .eq("status", "approved")
  .order("user_id")
  .limit(1)
  .single();
const { data: victimUser } = await db
  .from("users")
  .select("email")
  .eq("id", victim.user_id)
  .single();

await page.goto(`${BASE}/admin/users?q=${encodeURIComponent(victimUser.email)}`, {
  waitUntil: "networkidle",
});
await page.getByRole("button", { name: "Suspend" }).first().click();
await page
  .locator('textarea[name="reason"]')
  .first()
  .fill("End-to-end test suspension. Reactivated immediately after.");
await page.getByRole("button", { name: "Suspend account" }).click();
await page.getByText(/Account suspended/).waitFor({ timeout: 15000 });
await shot("03-users");

const { data: afterSuspend } = await db
  .from("nanny_profiles")
  .select("status")
  .eq("id", victim.id)
  .single();
check(
  "suspending the account hides the nanny profile",
  afterSuspend.status === "suspended",
  `profile is ${afterSuspend.status}`,
);

// The real test: she must be gone from public search, not merely flagged.
const searchHtml = await fetch(`${BASE}/nannies`).then((r) => r.text());
check(
  "the suspended nanny is gone from public search",
  !searchHtml.includes(`/nannies/${victim.id}`),
);

const profileStatus = await fetch(`${BASE}/nannies/${victim.id}`).then((r) => r.status);
check("her profile page returns 404", profileStatus === 404, `got ${profileStatus}`);

// Reactivating must NOT auto-approve: it goes back to the review queue.
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: "Reactivate" }).first().click();
await page.waitForTimeout(1000);

let afterReactivate = null;
for (let i = 0; i < 20; i++) {
  const { data } = await db
    .from("nanny_profiles")
    .select("status")
    .eq("id", victim.id)
    .single();
  afterReactivate = data;
  if (afterReactivate?.status !== "suspended") break;
  await page.waitForTimeout(300);
}
check(
  "reactivating sends her back to review rather than straight live",
  afterReactivate?.status === "submitted",
  afterReactivate?.status === "suspended"
    ? `still suspended; screen says: ${(await page.locator("main").innerText()).split("\n").filter((l) => /error|could not|permitted|required/i.test(l)).join(" | ") || "no error shown"}`
    : `profile is ${afterReactivate?.status}`,
);

console.log("\n--- AUDIT ---\n");

const { data: audit } = await db
  .from("audit_logs")
  .select("action")
  .order("created_at", { ascending: false })
  .limit(20);
const actions = (audit ?? []).map((a) => a.action);

check("the pricing change was audited", actions.includes("pricing_changed"));
check("the suspension was audited", actions.includes("user_status_change"));

await page.goto(`${BASE}/admin/audit`, { waitUntil: "networkidle" });
const auditText = await page.locator("main").innerText();
check("the audit page shows the pricing change", auditText.includes("Pricing changed"));
check("the audit page shows the account change", auditText.includes("Account status"));
await shot("04-audit");

console.log("\n--- NON-ADMIN ACCESS ---\n");

await context.close();
const familyContext = await browser.newContext({ ...devices["iPhone 13"] });
const familyPage = await familyContext.newPage();
await familyPage.goto(`${BASE}/login`);
await familyPage.locator('input[name="email"]').fill("family1@nananny.example.test");
await familyPage.locator('input[name="password"]').fill(PASSWORD);
await familyPage.getByRole("button", { name: "Log in" }).click();
await familyPage.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });

for (const path of ["/admin", "/admin/pricing", "/admin/users", "/admin/audit"]) {
  await familyPage.goto(`${BASE}${path}`);
  const landed = new URL(familyPage.url()).pathname;
  check(`a family cannot open ${path}`, !landed.startsWith("/admin"), landed);
}

await familyContext.close();
await browser.close();

// ---------------------------------------------------------------- restore
await db.rpc("admin_update_pricing", {
  p_free_contacts: originalPricing.free_contacts,
  p_weekly_price: Number(originalPricing.weekly_price_aed),
  p_monthly_price: Number(originalPricing.monthly_price_aed),
  p_weekly_enabled: originalPricing.weekly_enabled,
  p_monthly_enabled: originalPricing.monthly_enabled,
  p_monthly_is_best_value: originalPricing.monthly_is_best_value,
});
await db.from("pricing_config").update({
  free_contacts: originalPricing.free_contacts,
  weekly_price_aed: originalPricing.weekly_price_aed,
  monthly_price_aed: originalPricing.monthly_price_aed,
  weekly_enabled: originalPricing.weekly_enabled,
  monthly_enabled: originalPricing.monthly_enabled,
}).eq("id", true);
await db.from("nanny_profiles").update({ status: "approved" }).eq("id", victim.id);
await db.from("users").update({ status: "active", suspended_at: null, suspended_reason: null })
  .eq("id", victim.user_id);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  process.exitCode = 1;
}
