/**
 * Whether this can live on somebody's home screen.
 *
 * The interesting half is the asymmetry between the two platforms, which is
 * what the code it tests exists for. Android offers the install itself and
 * notifies whether or not anybody accepts, so anything we add there is a nag.
 * iOS offers nothing: no prompt, and web push does not work at all until
 * somebody has found Share then Add to Home Screen by themselves. So the hint
 * has to appear on exactly one of them, and this is what says which.
 *
 * Run:  node scripts/e2e-pwa.mjs
 */

import { webkit, chromium, devices } from "playwright";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const results = [];
const check = (n, ok, d="") => { results.push({n,ok}); console.log(`  ${ok?"PASS":"FAIL"}  ${n}${d?` — ${d}`:""}`); };

// ---- iPhone: the hint must appear, once, and only when signed in.
const wk = await webkit.launch();
const iphone = await wk.newContext({ ...devices["iPhone 13"] });
const p = await iphone.newPage();

await p.goto(`${BASE}`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1200);
check("shown to a visitor on the public site",
  (await p.getByText(/Keep NaNanny on your home screen/).count()) === 1);

/**
 * The reason has to fit the reader.
 *
 * Notifications are the only honest argument for installing this on iOS, and
 * they are an argument you cannot make to somebody without an account: telling
 * a stranger we will let them know about "a new application" describes a thing
 * they do not have.
 */
const publicText = await p.locator("body").innerText();
check("and it does not promise a stranger news about their applications",
  !/new application/i.test(publicText),
  publicText.split("\n").find((l) => /home screen/i.test(l)) ?? "");

await p.goto(`${BASE}/login`);
await p.locator('input[name="email"]').fill("family1@nananny.example.test");
await p.locator('input[name="password"]').fill("NaNannyDev2026!");
await p.getByRole("button", { name: "Log in" }).click();
await p.waitForURL(u => !/\/login/.test(u.pathname), { timeout: 20000 });
await p.waitForTimeout(1500);

const hint = p.getByText(/Keep NaNanny on your home screen/);
check("shown to a signed in iPhone", (await hint.count()) === 1);
check("it says which button to press", /share button/i.test(await p.locator("main").innerText()));

await p.getByRole("button", { name: "Hide this" }).click();
await p.waitForTimeout(400);
check("dismissing hides it", (await hint.count()) === 0);
await p.reload();
await p.waitForTimeout(1200);
check("and it stays hidden after a reload", (await p.getByText(/Keep NaNanny/).count()) === 0);
await wk.close();

// ---- Android: the browser handles it, so we must not nag.
const cr = await chromium.launch();
const android = await cr.newContext({ ...devices["Pixel 7"] });
const a = await android.newPage();
await a.goto(`${BASE}/login`);
await a.locator('input[name="email"]').fill("family1@nananny.example.test");
await a.locator('input[name="password"]').fill("NaNannyDev2026!");
await a.getByRole("button", { name: "Log in" }).click();
await a.waitForURL(u => !/\/login/.test(u.pathname), { timeout: 20000 });
await a.waitForTimeout(1200);
check("not shown on Android, where the browser offers it",
  (await a.getByText(/Keep NaNanny on your home screen/).count()) === 0);

const m = await (await a.request.get(`${BASE}/manifest.webmanifest`)).json();
check("manifest names the app in twelve characters or fewer",
  m.short_name.length <= 12, `"${m.short_name}" is ${m.short_name.length}`);
check("it opens without browser chrome", m.display === "standalone");
check("it has a maskable icon", m.icons.some(i => i.purpose === "maskable"));
check("it starts somewhere useful", m.start_url === "/family", m.start_url);
await cr.close();

const bad = results.filter(r => !r.ok).length;
console.log(`\n${results.length - bad}/${results.length} checks passed.`);
process.exitCode = bad ? 1 : 0;
