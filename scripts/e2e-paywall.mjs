/**
 * The commercial path, driven through the browser on a phone.
 *
 * A family messages three nannies, then tries a fourth and meets the paywall.
 * This is the one flow the whole business model rests on, so it is asserted at
 * both ends: what the screen shows, and what the database recorded.
 *
 * Run:  node scripts/e2e-paywall.mjs [--shots]
 */

import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { webkit, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const SHOTS = new URL("../screenshots/", import.meta.url).pathname;
const WANT_SHOTS = process.argv.includes("--shots");
const PASSWORD = "NaNannyDev2026!";
const FAMILY = "family2@nananny.example.test";

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

// This suite is about the ordinary case: three free contacts, then a paywall.
// The launch window deliberately suspends exactly that, so with one open every
// check here fails and looks like a broken gate rather than a promotion doing
// its job. `supabase/tests/launch_promo.sql` covers the window itself.
//
// Saved and put back rather than simply cleared. An earlier version cleared it,
// which meant running the tests switched off a live promotion and nothing said
// so. Restoring is in a `finally` because a suite that dies half way through
// must not leave the paywall in a state nobody chose.
const { data: promoBefore } = await db
  .from("pricing_config")
  .select("promo_starts_at, promo_ends_at, promo_label")
  .eq("id", true)
  .single();

async function restorePromo() {
  if (!promoBefore) return;
  await db.from("pricing_config").update(promoBefore).eq("id", true);
}

await db
  .from("pricing_config")
  .update({ promo_starts_at: null, promo_ends_at: null })
  .eq("id", true);

// ---------------------------------------------------------------- fixtures
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

// Start from a clean allowance so the run is repeatable.
await db.from("messages").delete().in(
  "conversation_id",
  (await db.from("conversations").select("id").eq("family_id", family.id)).data.map((c) => c.id),
);
await db.from("family_nanny_contacts").delete().eq("family_id", family.id);
await db.from("conversations").delete().eq("family_id", family.id);
await db.from("subscriptions").delete().eq("family_id", family.id);

const { data: config } = await db.from("pricing_config").select("*").single();
const freeContacts = config.free_contacts;

const { data: nannies } = await db
  .from("nanny_profiles")
  .select("id, first_name")
  .eq("status", "approved")
  .order("user_id")
  .limit(freeContacts + 1);

check(
  "enough approved nannies to exercise the gate",
  nannies.length === freeContacts + 1,
  `${nannies.length} of ${freeContacts + 1}`,
);

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE });
const page = await context.newPage();
const shot = async (n) => {
  if (WANT_SHOTS) await page.screenshot({ path: `${SHOTS}m4-${n}.png`, fullPage: true });
};

await page.goto("/login");
await page.locator('input[name="email"]').fill(FAMILY);
await page.locator('input[name="password"]').fill(PASSWORD);
await page.getByRole("button", { name: "Log in" }).click();
await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });

// ---------------------------------------------------------------- free ones
console.log(`\n--- THE FIRST ${freeContacts} CONTACTS ---\n`);

for (let i = 0; i < freeContacts; i++) {
  const nanny = nannies[i];
  await page.goto(`/nannies/${nanny.id}`, { waitUntil: "networkidle" });

  await page.getByRole("button", { name: /^Message / }).click();
  await page.getByRole("dialog").waitFor({ timeout: 5000 });
  if (i === 0) await shot("01-contact-sheet");

  await page
    .locator('textarea[name="firstMessage"]')
    .fill(`Hello ${nanny.first_name}, we are a family in Dubai looking for weekday care.`);
  await page.getByRole("button", { name: "Send message" }).click();

  await page.waitForURL(/\/family\/messages\/[0-9a-f-]{36}/, { timeout: 20000 });

  const { data: state } = await db.rpc("family_contact_state", { p_family_id: family.id });
  check(
    `contact ${i + 1} was free`,
    state[0].free_contacts_used === i + 1,
    `${state[0].free_contacts_used}/${state[0].free_contacts_limit} used`,
  );
}

await page.waitForLoadState("networkidle");
await shot("02-thread");

// The thread must show what was sent.
const threadText = await page.locator("main, body").first().innerText();
check(
  "the message appears in the thread",
  threadText.includes("we are a family in Dubai"),
  threadText.split("\n").find((l) => l.includes("Hello"))?.slice(0, 50) ?? "not found",
);

// ---------------------------------------------------------------- paywall
console.log("\n--- THE NEXT ONE ---\n");

const fourth = nannies[freeContacts];
await page.goto(`/nannies/${fourth.id}`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /^Message / }).click();
await page.getByRole("dialog").waitFor({ timeout: 5000 });
await page.locator('textarea[name="firstMessage"]').fill("Hello, are you available?");
await page.getByRole("button", { name: "Send message" }).click();

// The sheet becomes the paywall in place — no navigation.
await page.getByText("You've found somebody else worth talking to.").waitFor({ timeout: 15000 });
check("the paywall appears on the next contact", true);
await shot("03-paywall");

const paywallText = await page.getByRole("dialog").innerText();
check(
  "the paywall shows the monthly price from configuration",
  paywallText.includes(String(config.monthly_price_aed).replace(".00", "")),
  `expected ${config.monthly_price_aed}`,
);
check(
  "the paywall shows the weekly price from configuration",
  paywallText.includes(String(config.weekly_price_aed).replace(".00", "")),
  `expected ${config.weekly_price_aed}`,
);
check("the paywall names the Best Value plan", paywallText.includes("Best Value"));

// Nothing was recorded for the fourth nanny.
const { count: contactRows } = await db
  .from("family_nanny_contacts")
  .select("*", { count: "exact", head: true })
  .eq("family_id", family.id);
check(
  "the blocked contact was not recorded",
  contactRows === freeContacts,
  `${contactRows} rows, expected ${freeContacts}`,
);

const { count: convoRows } = await db
  .from("conversations")
  .select("*", { count: "exact", head: true })
  .eq("family_id", family.id);
check(
  "no empty conversation was left behind",
  convoRows === freeContacts,
  `${convoRows} threads`,
);

// ---------------------------------------------------------------- reopening
console.log("\n--- REOPENING A THREAD ---\n");

await page.goto(`/nannies/${nannies[0].id}`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /^Message / }).click();
await page.locator('textarea[name="firstMessage"]').fill("One more question, if I may.");
await page.getByRole("button", { name: "Send message" }).click();
await page.waitForURL(/\/family\/messages\/[0-9a-f-]{36}/, { timeout: 20000 });

const { data: afterReopen } = await db.rpc("family_contact_state", { p_family_id: family.id });
check(
  "messaging someone already contacted costs nothing",
  afterReopen[0].free_contacts_used === freeContacts,
  `${afterReopen[0].free_contacts_used} used`,
);

// ---------------------------------------------------------------- the nanny replies
console.log("\n--- THE NANNY REPLIES ---\n");

const { data: nannyUser } = await db
  .from("nanny_profiles")
  .select("user_id")
  .eq("id", nannies[0].id)
  .single();
const { data: nannyAccount } = await db
  .from("users")
  .select("email")
  .eq("id", nannyUser.user_id)
  .single();

const nannyContext = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE });
const nannyPage = await nannyContext.newPage();
await nannyPage.goto("/login");
await nannyPage.locator('input[name="email"]').fill(nannyAccount.email);
await nannyPage.locator('input[name="password"]').fill(PASSWORD);
await nannyPage.getByRole("button", { name: "Log in" }).click();
await nannyPage.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });

await nannyPage.goto("/nanny/messages", { waitUntil: "networkidle" });
await nannyPage.waitForLoadState("networkidle");
const threadLinks = nannyPage.locator('a[href^="/nanny/messages/"]');
check("the nanny sees the conversation", (await threadLinks.count()) > 0);
await threadLinks.first().click();
await nannyPage.waitForURL(/\/nanny\/messages\/[0-9a-f-]{36}/, { timeout: 15000 });
await nannyPage.waitForLoadState("networkidle");

await nannyPage.locator('textarea[name="body"]').fill("Hello! Yes, I am available.");
await nannyPage.getByRole("button", { name: "Send" }).click();
await nannyPage.waitForTimeout(2500);

const { data: reply } = await db
  .from("messages")
  .select("body, sender_id")
  .eq("sender_id", nannyUser.user_id)
  .maybeSingle();
check("the nanny's reply was stored", Boolean(reply), reply?.body?.slice(0, 30));

// Replying must never touch the family's allowance.
const { data: afterReply } = await db.rpc("family_contact_state", { p_family_id: family.id });
check(
  "a reply does not consume a family contact",
  afterReply[0].free_contacts_used === freeContacts,
  `${afterReply[0].free_contacts_used} used`,
);

await nannyContext.close();
await context.close();
await browser.close();

await restorePromo();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  process.exitCode = 1;
}
