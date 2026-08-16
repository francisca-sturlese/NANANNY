/**
 * The bell, end to end.
 *
 * The interesting assertion is the live one: something happens in the database
 * while a page is open and untouched, and the badge changes without a reload.
 * That path has four places to fail silently, and every one of them looks
 * identical from the outside, like a user who simply has no notifications.
 * The table has to be in the realtime publication, the socket has to carry a
 * token, row level security has to admit the subscriber to their own rows, and
 * the component has to be mounted. Only an end to end run distinguishes them.
 *
 * Run:  node scripts/e2e-notifications.mjs
 */

import { readFileSync } from "node:fs";
import { webkit } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const PASSWORD = "NaNannyDev2026!";
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

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Reads the count out of the bell's own label, which is what a screen reader gets. */
async function unreadFrom(page) {
  const label = await page.getByRole("button", { name: /Notifications/ }).getAttribute("aria-label");
  const match = /(\d+) unread/.exec(label ?? "");
  return match ? Number(match[1]) : 0;
}

// ----------------------------------------------------------------- baseline
const { data: nannyUser } = await db
  .from("users").select("id").eq("email", NANNY).single();
const { data: nanny } = await db
  .from("nanny_profiles").select("id, user_id, status").eq("user_id", nannyUser.id).single();
const { data: job } = await db
  .from("jobs").select("id, family_id").eq("status", "active").limit(1).single();

// A clean slate for this nanny only.
await db.from("notifications").delete().eq("user_id", nannyUser.id);
await db.from("job_applications").delete().eq("nanny_id", nanny.id).eq("job_id", job.id);

const browser = await webkit.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});

console.log("\nNotifications\n");

await page.goto(`${BASE}/login`);
await page.locator('input[name="email"]').fill(NANNY);
await page.locator('input[name="password"]').fill(PASSWORD);
await page.getByRole("button", { name: "Log in" }).click();
await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });

check("the bell is in the signed in header", await page.getByRole("button", { name: /Notifications/ }).count() === 1);
check("it starts with nothing unread", (await unreadFrom(page)) === 0);

/**
 * Wait for the subscription, do not sleep and hope.
 *
 * The bell marks itself `data-live` when the channel reports SUBSCRIBED. Making
 * something happen before that point tests nothing: the event is published to
 * nobody, the badge stays at zero, and the failure is indistinguishable from
 * realtime being broken. Which is exactly what happened the first time this was
 * run, and the bug was in the test.
 */
const subscribed = await page
  .locator('button[data-live="true"]')
  .waitFor({ timeout: 15000 })
  .then(() => true)
  .catch(() => false);
check("the socket subscribes", subscribed);

// --------------------------------------------------------------- live arrival
// She applies, then the family shortlists her. Both write a notification, and
// only the second one is hers.
await db.from("job_applications").insert({ job_id: job.id, nanny_id: nanny.id, cover_note: "hello" });
await db.from("job_applications").update({ status: "shortlisted" })
  .eq("job_id", job.id).eq("nanny_id", nanny.id);

// No reload, no click. Purely the socket.
await page.waitForFunction(
  () => /\d+ unread/.test(
    document.querySelector('button[aria-label^="Notifications"]')?.getAttribute("aria-label") ?? ""),
  { timeout: 15000 },
).catch(() => {});

check("the badge appears without a reload", (await unreadFrom(page)) === 1,
  `label was "${await page.getByRole("button", { name: /Notifications/ }).getAttribute("aria-label")}"`);

// The family's notification went to the family, not to her.
const { data: hers } = await db.from("notifications").select("kind").eq("user_id", nannyUser.id);
check("she was told she was shortlisted", hers.some((n) => n.kind === "application_shortlisted"));
check("the application notification was not sent to her",
  !hers.some((n) => n.kind === "application_received"),
  JSON.stringify(hers.map((n) => n.kind)));

const { data: familyProfile } = await db
  .from("family_profiles").select("user_id").eq("id", job.family_id).single();
const { data: theirs } = await db
  .from("notifications").select("kind").eq("user_id", familyProfile.user_id)
  .eq("kind", "application_received");
check("the family was told about the application", theirs.length >= 1);

// ------------------------------------------------------------------ the panel
await page.getByRole("button", { name: /Notifications/ }).click();
const panel = page.locator('[role="dialog"][aria-label="Notifications"]');
await panel.waitFor({ timeout: 5000 });

const box = await page.evaluate(() => {
  const r = document.querySelector('[role="dialog"][aria-label="Notifications"]').getBoundingClientRect();
  return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight };
});
check("the panel covers the viewport rather than the header it opened from",
  box.top <= 1 && box.left <= 1 && box.w >= box.vw - 1 && box.h >= box.vh - 1,
  JSON.stringify(box));

const panelText = await panel.innerText();
check("it says what happened in a sentence", /shortlisted/i.test(panelText), panelText.replace(/\n/g, " | "));
check("no dash in the copy", !/[—–]/.test(panelText));

// ------------------------------------------------------------------ read state
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check("escape closes it", (await panel.count()) === 0);
check("the badge clears once they have been read", (await unreadFrom(page)) === 0);

await page.reload();
check("and stays cleared after a reload", (await unreadFrom(page)) === 0);

const { data: afterRead } = await db
  .from("notifications").select("read_at").eq("user_id", nannyUser.id);
check("read_at was written in the database",
  afterRead.every((n) => n.read_at !== null));

// -------------------------------------------------------------- somebody else
// The subscription is filtered and the policy is per user. A row for another
// person must not reach this page.
const { data: otherUser } = await db
  .from("users").select("id").eq("email", "nanny2@nananny.example.test").single();
await db.from("notifications").insert({
  user_id: otherUser.id, kind: "new_message", href: "/nanny/messages", metadata: {},
});
await page.waitForTimeout(2500);
check("another person's notification never arrives", (await unreadFrom(page)) === 0);
await db.from("notifications").delete().eq("user_id", otherUser.id);

check("no console errors", consoleErrors.length === 0, consoleErrors[0]?.slice(0, 160) ?? "");

await browser.close();

console.log(`\n${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  console.log(`\n${failures.length} failure(s):`);
  for (const f of failures) console.log(`  ${f}`);
  process.exitCode = 1;
}
