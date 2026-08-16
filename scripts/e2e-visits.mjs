/**
 * Counting people, and only the ones we said we would count.
 *
 * The question this exists to answer is whether a quiet week means nobody
 * visited or means everybody visited and left, so the assertion that matters is
 * not "a row was written" but "one person reading three pages counts as one
 * person". A view counter answers nothing: five people reading one page each
 * and one person reading five look identical, and only the first means the site
 * is working.
 *
 * The rest is restraint. A path nobody asked to count writes nothing, a profile
 * is recorded as its shape and never its id, and the referrer is reduced to a
 * host before it is stored.
 *
 * Run:  node scripts/e2e-visits.mjs
 */

import { readFileSync } from "node:fs";
import { webkit } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";

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
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const views = async () =>
  (await db.from("analytics_events").select("properties, session_id").eq("event", "page_view")).data ??
  [];

console.log("\nVisits\n");

await db.from("analytics_events").delete().eq("event", "page_view");

// ------------------------------------------------------------- one person
const browser = await webkit.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

for (const path of ["/", "/for-families", "/pricing"]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
}

const afterOne = await views();
check("three pages were counted", afterOne.length === 3, `${afterOne.length} rows`);
check(
  "and they are one person, not three",
  new Set(afterOne.map((v) => v.session_id)).size === 1,
  `${new Set(afterOne.map((v) => v.session_id)).size} visitors`,
);

// ------------------------------------------------------- somebody else
const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
const otherPage = await other.newPage();
await otherPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
await otherPage.waitForTimeout(600);

const afterTwo = await views();
check(
  "a different browser is a different person",
  new Set(afterTwo.map((v) => v.session_id)).size === 2,
  `${new Set(afterTwo.map((v) => v.session_id)).size} visitors`,
);
await other.close();

// ------------------------------------------------------------- restraint
await db.from("analytics_events").delete().eq("event", "page_view");

const post = (path, headers = {}) =>
  fetch(`${BASE}/api/v`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ path }),
  });

await post("/family/subscription");
await post("/admin/users");
await post("/../etc/passwd");
check("a page nobody asked to count writes nothing", (await views()).length === 0);

await post("/nannies/9f1b0f2e-0000-4000-8000-000000000000");
const shaped = await views();
check(
  "a profile is counted as a profile, not as which one",
  shaped.length === 1 && shaped[0].properties.path === "/nannies/:id",
  shaped[0]?.properties?.path,
);

// ---------------------------------------------------------------- source
await db.from("analytics_events").delete().eq("event", "page_view");
await post("/", { referer: "https://www.instagram.com/p/abc123/?igshid=secret" });
const sourced = await views();
check(
  "the referrer is reduced to a host before it is stored",
  sourced[0]?.properties?.source === "instagram.com",
  sourced[0]?.properties?.source,
);
check(
  "and nothing from the address survives",
  !JSON.stringify(sourced).includes("igshid") && !JSON.stringify(sourced).includes("abc123"),
);

// ----------------------------------------------------------- the reading
/**
 * Read as an administrator, not with the service key.
 *
 * `admin_traffic` checks `is_admin()` itself, and the backend key has no
 * `auth.uid()` to check, so it is refused. That is the correct answer and worth
 * asserting on the way past: the list of everywhere people go is not something
 * a stolen key should return.
 */
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const { error: refusedForService } = await db.rpc("admin_traffic", { p_days: 14 });
check("the backend key alone cannot read where people went", Boolean(refusedForService));

const { error: signInError } = await anon.auth.signInWithPassword({
  email: "admin@nananny.example.test",
  password: "NaNannyDev2026!",
});
const { data: traffic } = signInError ? { data: null } : await anon.rpc("admin_traffic", { p_days: 14 });

const today = Array.isArray(traffic) ? traffic[0] : null;
check(
  "an administrator gets visitors, views and signups per day",
  Boolean(today && "visitors" in today && "views" in today && "signups" in today),
  JSON.stringify(today),
);

const { error: refusedForNanny } = await (async () => {
  const her = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  await her.auth.signInWithPassword({
    email: "nanny1@nananny.example.test",
    password: "NaNannyDev2026!",
  });
  return her.rpc("admin_traffic", { p_days: 14 });
})();
check("and a signed in user who is not an admin is refused", Boolean(refusedForNanny));

// --------------------------------------------------------- the admin page
await page.goto(`${BASE}/login`);
await page.locator('input[name="email"]').fill("admin@nananny.example.test");
await page.locator('input[name="password"]').fill("NaNannyDev2026!");
await page.getByRole("button", { name: "Log in" }).click();
await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });
await page.goto(`${BASE}/admin/insights`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);

const text = await page.locator("main").innerText();
check("an admin can read it", /Traffic/.test(text), page.url());
check("it says people rather than page views", /People, not page views/i.test(text));
check("no dash in the copy", !/[—–]/.test(text));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  ✗ ${f.name}`);
  process.exitCode = 1;
}
