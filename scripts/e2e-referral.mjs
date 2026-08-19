/**
 * A family brings a family, driven through the browser.
 *
 * The SQL suite proves the arithmetic. This proves the part that arithmetic
 * cannot: that the link a family sends actually turns into a fourth contact
 * for a real person clicking real buttons on a phone.
 *
 * The order matters and mirrors what happens in life. The inviter opens their
 * dashboard and finds a code; a second family follows the link, signs up and
 * finishes setting up; only then does the inviter get anything. In between,
 * the case that would cost real money if it were wrong: a family that signed
 * up through the link and stopped must pay nobody.
 *
 * Run:  node scripts/e2e-referral.mjs [--shots]
 */

import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { webkit, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const SHOTS = new URL("../screenshots/", import.meta.url).pathname;
const WANT_SHOTS = process.argv.includes("--shots");
const PASSWORD = "NaNannyDev2026!";
const INVITER = "family3@nananny.example.test";
const GUEST = "family4@nananny.example.test";

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

// The launch window suspends the very thing this measures: while it is open
// nothing is consumed, so a fourth contact would go through with or without a
// referral and every check below would pass for the wrong reason. Saved and
// restored, never merely cleared, so running the tests cannot switch off a
// live promotion silently.
const { data: configBefore } = await db
  .from("pricing_config")
  .select("promo_starts_at, promo_ends_at, promo_label, referral_enabled, referral_bonus_contacts, referral_bonus_max")
  .eq("id", true)
  .single();

async function restoreConfig() {
  if (configBefore) await db.from("pricing_config").update(configBefore).eq("id", true);
}

await db
  .from("pricing_config")
  .update({
    promo_starts_at: null,
    promo_ends_at: null,
    referral_enabled: true,
    referral_bonus_contacts: 1,
    referral_bonus_max: 10,
  })
  .eq("id", true);

async function familyOf(email) {
  const { data: user } = await db.from("users").select("id").eq("email", email).single();
  const { data: family } = await db
    .from("family_profiles")
    .select("id, onboarding_completed_at")
    .eq("user_id", user.id)
    .single();
  return family;
}

const inviter = await familyOf(INVITER);
const guest = await familyOf(GUEST);

// A repeatable starting point: no prior invitation, no spent allowance, and a
// guest who has not finished setting up.
await db.from("family_referrals").delete().in("referred_family_id", [inviter.id, guest.id]);
await db.from("family_referrals").delete().in("referrer_family_id", [inviter.id, guest.id]);
for (const f of [inviter, guest]) {
  const { data: convos } = await db.from("conversations").select("id").eq("family_id", f.id);
  await db.from("messages").delete().in("conversation_id", convos?.map((c) => c.id) ?? []);
  await db.from("family_nanny_contacts").delete().eq("family_id", f.id);
  await db.from("conversations").delete().eq("family_id", f.id);
  await db.from("subscriptions").delete().eq("family_id", f.id);
}
await db.from("family_profiles").update({ referral_code: null }).eq("id", inviter.id);
const guestOnboarding = guest.onboarding_completed_at;
await db.from("family_profiles").update({ onboarding_completed_at: null }).eq("id", guest.id);

const { data: config } = await db.from("pricing_config").select("free_contacts").single();
const free = config.free_contacts;

const { data: nannies } = await db
  .from("nanny_profiles")
  .select("id, first_name")
  .eq("status", "approved")
  .order("user_id")
  .limit(free + 2);

check(
  `enough approved nannies to spend ${free} plus the earned one`,
  nannies.length >= free + 1,
  `${nannies.length} available`,
);

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE });
const page = await context.newPage();
const shot = async (n) => {
  if (WANT_SHOTS) await page.screenshot({ path: `${SHOTS}ref-${n}.png`, fullPage: true });
};

async function logIn(email) {
  await context.clearCookies();
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });
}

try {
  // ------------------------------------------------ 1. the inviter gets a code
  console.log("\n--- THE INVITER FINDS THE CARD ---\n");
  await logIn(INVITER);
  await page.goto("/family", { waitUntil: "networkidle" });

  const card = page.getByRole("heading", { name: "Invite another family" });
  check("the invite card is on the family dashboard", await card.isVisible().catch(() => false));
  await shot("01-invite-card");

  const { data: afterVisit } = await db
    .from("family_profiles")
    .select("referral_code")
    .eq("id", inviter.id)
    .single();
  const code = afterVisit.referral_code;
  check("a code was minted by looking at the page", /^[A-Z0-9]{6}$/.test(code ?? ""), code ?? "none");
  check(
    "the code avoids characters that look alike",
    !/[O0I1]/.test(code ?? "X"),
    code ?? "",
  );

  // ------------------------------------------------ 2. the guest follows it
  console.log("\n--- A SECOND FAMILY FOLLOWS THE LINK ---\n");
  await context.clearCookies();
  await page.goto(`/invite/${code}`);
  await page.waitForURL(/\/signup/, { timeout: 20000 });
  check("the invite link lands on the ordinary signup", /\/signup/.test(page.url()), page.url());

  // React names its own server action plumbing $ACTION_REF_1 and friends, which
  // an eager substring match reads as an invite field and fails on. Those are
  // not fields anybody fills in, so they are dropped before the check rather
  // than the check being loosened.
  const fields = (
    await page.locator("input[name], select[name]").evaluateAll((els) =>
      els.map((e) => e.getAttribute("name")),
    )
  ).filter((f) => f && !f.startsWith("$ACTION"));

  check(
    "signup asks for nothing extra because of the invitation",
    fields.every((f) => ["role", "firstName", "lastName", "email", "phone", "password"].includes(f)),
    fields.join(", "),
  );

  // The seeded guest already has an account, so signing up again is not the
  // path. What matters is that the cookie set by the link is attached to
  // whoever signs in next, which is exactly what happens when somebody
  // confirms their email and comes back.
  await logInKeepingCookies(GUEST);
  await page.goto("/family", { waitUntil: "networkidle" });

  const { data: link } = await db
    .from("family_referrals")
    .select("referrer_family_id")
    .eq("referred_family_id", guest.id)
    .maybeSingle();
  check("the invitation was recorded against the guest", link?.referrer_family_id === inviter.id);

  // ------------------------------------------------ 3. a signup alone pays nothing
  console.log("\n--- BEFORE THE GUEST FINISHES ---\n");
  const { data: earlyState } = await db.rpc("family_contact_state", { p_family_id: inviter.id });
  check(
    "an invitation that produced only a signup pays nothing",
    earlyState[0].free_contacts_limit === free && earlyState[0].referral_bonus === 0,
    `limit ${earlyState[0].free_contacts_limit}, bonus ${earlyState[0].referral_bonus}`,
  );

  // ------------------------------------------------ 4. finishing pays both
  console.log("\n--- THE GUEST FINISHES SETTING UP ---\n");
  await db
    .from("family_profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", guest.id);

  for (const [who, id] of [["inviter", inviter.id], ["guest", guest.id]]) {
    const { data: state } = await db.rpc("family_contact_state", { p_family_id: id });
    check(
      `the ${who} now has ${free + 1} free contacts`,
      state[0].free_contacts_limit === free + 1 && state[0].referral_bonus === 1,
      `limit ${state[0].free_contacts_limit}, bonus ${state[0].referral_bonus}`,
    );
  }

  // ------------------------------------------------ 5. the extra one is spendable
  console.log("\n--- THE INVITER SPENDS ALL FOUR ---\n");
  await logIn(INVITER);

  let opened = 0;
  let paywalled = false;
  let trouble = "";

  for (let i = 0; i < free + 2 && i < nannies.length; i++) {
    await page.goto(`/nannies/${nannies[i].id}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^Message / }).click();
    await page.getByRole("dialog").waitFor({ timeout: 5000 });

    await page
      .locator('textarea[name="firstMessage"]')
      .fill(`Hello ${nannies[i].first_name}, we are looking for weekday care.`);
    await page.getByRole("button", { name: "Send message" }).click();

    /**
     * The sheet always offers the message box, and becomes the paywall in
     * place only once the server has refused. So the answer is whichever of
     * the two arrives, and asking before submitting reads every contact as
     * allowed. An earlier version of this checked the heading first, filled
     * the box on a family with nothing left, and hung on a navigation that was
     * never going to happen.
     */
    const sent = page.waitForURL(/\/family\/messages\/[0-9a-f-]{36}/, { timeout: 20000 });
    const refused = page
      .getByText("You've found somebody else worth talking to.")
      .waitFor({ timeout: 20000 });

    try {
      const outcome = await Promise.race([
        sent.then(() => "sent"),
        refused.then(() => "refused"),
      ]);
      if (outcome === "sent") {
        opened += 1;
      } else {
        paywalled = true;
        await shot("02-paywall");
        break;
      }
    } catch {
      trouble = `contact ${i + 1} neither opened nor hit the paywall: still on ${page.url()}`;
      await shot(`02-stuck-${i + 1}`);
      break;
    }
  }

  if (trouble) check("every contact within the allowance opened", false, trouble);

  check(
    `the earned contact is real: ${free + 1} conversations opened before the paywall`,
    opened === free + 1,
    `${opened} opened, paywall ${paywalled ? "reached" : "never reached"}`,
  );
  check("the paywall still arrives after the earned one", paywalled);

  // ------------------------------------------------ 6. switching it off
  console.log("\n--- THE SWITCH ---\n");
  await db.from("pricing_config").update({ referral_enabled: false }).eq("id", true);
  const { data: offState } = await db.rpc("family_contact_state", { p_family_id: guest.id });
  check(
    "switched off, the allowance is back to the configured number",
    offState[0].free_contacts_limit === free && offState[0].referral_bonus === 0,
    `limit ${offState[0].free_contacts_limit}`,
  );
} finally {
  await db.from("family_profiles")
    .update({ onboarding_completed_at: guestOnboarding })
    .eq("id", guest.id);
  await restoreConfig();
  await browser.close();
}

/**
 * Signing in without throwing the cookies away.
 *
 * The invitation lives in a cookie set by the link, and the whole point of
 * this step is that it survives from the click to the moment there is an
 * account. Clearing cookies here, as the other sign-ins do, would silently
 * delete the thing under test.
 */
async function logInKeepingCookies(email) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
