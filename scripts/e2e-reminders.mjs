/**
 * The reminders, from the scheduler's end to somebody's inbox.
 *
 * The SQL suite proves who is due. This proves the half that lives outside the
 * database: the endpoint refuses strangers, the words a real person will read
 * are the right ones, calling it twice does not write twice, and the settings
 * can be changed from the admin screen by somebody who is not a developer.
 *
 * The last one matters more than it looks. Every threshold here is a guess, and
 * the reason they are in a row rather than in code is so that finding out the
 * real numbers does not need a deploy. A control nobody can reach is the same
 * as a constant.
 *
 * Run:  node scripts/e2e-reminders.mjs
 */

import { readFileSync } from "node:fs";
import { webkit } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
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
  results.push({ name, ok });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const run = (headers) => fetch(`${BASE}/api/cron/reminders`, { method: "POST", headers });

console.log("\nReminders\n");

// ------------------------------------------------------------------ the guard
// The URL is guessable and the endpoint makes us send mail. Without a secret it
// is a button any stranger can press as often as they like.
check("no credentials is refused", (await run({})).status === 401);
check("the wrong secret is refused", (await run({ authorization: "Bearer nope" })).status === 401);

const AUTH = { authorization: `Bearer ${env.CRON_SECRET}` };
check("the right secret is accepted", (await run(AUTH)).ok);

// -------------------------------------------------------------- a real sender
// Somebody who signed up, posted nothing, and has been quiet for a week.
const stamp = Date.now();
const EMAIL = `e2e-quiet-${stamp}@nananny.example.test`;

const { data: created, error: createError } = await db.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
  user_metadata: { role: "family", first_name: "Quiet" },
});
check("a test family was created", !createError, createError?.message ?? "");

const userId = created?.user?.id;

// Backdated past the threshold. The profile row is what the nudge measures, not
// the account.
await db.from("family_profiles").insert({
  user_id: userId,
  emirate: "Dubai",
  area: "Marina",
  children_count: 1,
  display_name: "The Quiet family",
  created_at: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
});

// Onboarding publishes a job now, and a family with a job is not quiet. This
// one never finished, which is the case the nudge is for.
await db.from("jobs").delete().eq("family_id", (
  await db.from("family_profiles").select("id").eq("user_id", userId).single()
).data.id);

const { data: before } = await db.from("reminder_config").select("*").single();
await db.from("reminder_config").update({ audience: "everyone" }).eq("id", true);

const first = await (await run(AUTH)).json();
check("the run reports what it did", typeof first.sent === "number", JSON.stringify(first));

/**
 * The email is read off the row rather than out of an inbox.
 *
 * Nothing is actually delivered from a development machine: there is no mail
 * key here, and the sender refuses to reach a live provider from a build that
 * is not on https, which is what stops an end to end run posting real mail to
 * whatever address a fixture invented. The composed subject and body are kept
 * on the event instead, so the words a real person will read are under test on
 * a machine that cannot send them. Before this they were not read by anybody at
 * any point.
 */
const { data: composed } = await db
  .from("email_events")
  .select("status, metadata, recipient")
  .eq("recipient", EMAIL)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

check("the reminder was composed for them", Boolean(composed), JSON.stringify(first));
check(
  "and recorded as skipped rather than failed",
  composed?.status === "skipped",
  `status ${composed?.status}, ${composed?.metadata?.skipped ?? ""}`,
);

const text = composed?.metadata?.text ?? "";
check("it is addressed to a person, not to a list", /Quiet/.test(text), text.slice(0, 60));
check("it links back into the product", /https?:\/\//.test(text));
check("no dash in the copy", !/[—–]/.test(text));
check(
  "it says why they are hearing from us",
  /profile|post|job/i.test(text),
  text.replace(/\n/g, " ").slice(0, 120),
);

// ------------------------------------------------------------------- restraint
// A scheduler that fires twice, or two of them firing at once, is ordinary.
const second = await (await run(AUTH)).json();
const { count: afterCount } = await db
  .from("email_events")
  .select("id", { count: "exact", head: true })
  .eq("recipient", EMAIL);
check(
  "running it again composes nothing new for the same person",
  afterCount === 1,
  `${afterCount} events after the second run, which reported ${JSON.stringify(second)}`,
);

// ------------------------------------------------------------- the switch off
await db.from("reminder_config").update({ audience: "off" }).eq("id", true);
const offRun = await (await run(AUTH)).json();
check("with the switch off nothing is due at all", offRun.due === 0, JSON.stringify(offRun));

// --------------------------------------------------------------- the settings
const browser = await webkit.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await context.newPage();

await page.goto(`${BASE}/login`);
await page.locator('input[name="email"]').fill("admin@nananny.example.test");
await page.locator('input[name="password"]').fill(PASSWORD);
await page.getByRole("button", { name: "Log in" }).click();
await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });

await page.goto(`${BASE}/admin/reminders`);
check("an admin can reach the settings", /admin\/reminders/.test(page.url()), page.url());

await page.getByRole("radio", { name: /Everyone/ }).check();
await page.getByLabel(/Least time between/).fill("72");
await page.getByRole("button", { name: "Save" }).click();
await page.getByText(/Saved/).waitFor({ timeout: 10000 }).catch(() => {});

const { data: saved } = await db.from("reminder_config").select("*").single();
check(
  "changing them from the screen changes them in the database",
  saved.audience === "everyone" && saved.min_gap_hours === 72,
  `${saved.audience}, gap ${saved.min_gap_hours}`,
);

const { data: audit } = await db
  .from("audit_logs")
  .select("action")
  .eq("action", "reminders_changed")
  .limit(1);
check("and the change is audited", (audit ?? []).length === 1);

// A gap shorter than the wait would let somebody be written to again before the
// reason for the first email has had a chance to change.
await page.getByLabel(/Least time between/).fill("1");
await page.getByRole("button", { name: "Save" }).click();
await page.waitForTimeout(1500);
const { data: unchanged } = await db.from("reminder_config").select("min_gap_hours").single();
check("a gap shorter than the wait is refused", unchanged.min_gap_hours === 72, `${unchanged.min_gap_hours}`);

await browser.close();

// ------------------------------------------------------------------ clean up
if (userId) await db.auth.admin.deleteUser(userId);
await db
  .from("reminder_config")
  .update({
    audience: before.audience,
    nudge_after_hours: before.nudge_after_hours,
    unread_after_hours: before.unread_after_hours,
    min_gap_hours: before.min_gap_hours,
  })
  .eq("id", true);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  ✗ ${f.name}`);
  process.exitCode = 1;
}
