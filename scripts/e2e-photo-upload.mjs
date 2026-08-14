/**
 * Uploading a real photo, through the real form.
 *
 * Written after production found what no suite did: Next caps a server action
 * body at 1 MB by default and nothing had ever set it, while the app accepted
 * photos up to 5 MB. Every nanny who chose a real photo from a phone was
 * rejected on a required field at the first step of onboarding.
 *
 * No suite caught it because none of them ever uploaded a file: the seed
 * avatars are written straight to storage. This one goes through the form, with
 * a picture the size a phone actually produces.
 *
 * Run:  node scripts/e2e-photo-upload.mjs
 */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { webkit, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

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
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// A picture the size a phone camera produces, not a 2 KB fixture.
const dir = mkdtempSync(join(tmpdir(), "nananny-photo-"));
const big = join(dir, "phone-photo.jpg");
// Random pixels, because a flat colour compresses to nothing and the whole
// point of the fixture is that it is large.
const w = 4032;
const h = 3024;
const noise = Buffer.alloc(w * h * 3);
for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 2654435761) % 251;
await sharp(noise, { raw: { width: w, height: h, channels: 3 } })
  .jpeg({ quality: 92 })
  .toFile(big);
const bytes = readFileSync(big).length;
check("the fixture is the size a phone produces", bytes > 1_000_000, `${Math.round(bytes / 1024)} KB`);

const email = `photo-${Date.now()}@example.test`;
const { error: createError } = await db.auth.admin.createUser({
  email,
  password: PASSWORD,
  email_confirm: true,
  user_metadata: { role: "nanny", first_name: "Melody", last_name: "Test" },
});
check("a confirmed nanny exists to test with", !createError, createError?.message ?? "");

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE });
const page = await context.newPage();
const failures = [];
page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 160)));
page.on("response", (r) => {
  if (r.status() >= 400) failures.push(`${r.status()} ${new URL(r.url()).pathname}`);
});

await page.goto("/login");
await page.locator('input[name="email"]').fill(email);
await page.locator('input[name="password"]').fill(PASSWORD);
await page.getByRole("button", { name: "Log in" }).click();
await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });

// The onboarding index redirects to the current step. Playwright treats that
// redirect as an interrupted navigation, so the goto is allowed to throw and
// the wait below is what actually decides we arrived.
await page.goto("/nanny/onboarding").catch(() => {});
await page.waitForURL(/onboarding\/about/, { timeout: 20000 });
await page.waitForLoadState("networkidle");

await page.locator('input[name="firstName"]').fill("Melody");
await page.locator('input[name="lastName"]').fill("Test");
await page.locator('select[name="nationality"]').selectOption({ index: 1 });
await page.locator('select[name="visaStatus"]').selectOption({ index: 1 });
await page.locator('select[name="emirate"]').selectOption({ index: 1 });

// The date field may be a native input or three selects, depending on which
// version of the form is deployed. Both submit dateOfBirth.
if (await page.locator('input[name="dateOfBirth"]').count()) {
  await page.locator('input[name="dateOfBirth"]').fill("1995-04-12");
} else {
  await page.locator('select[name="dobDay"]').selectOption("12");
  await page.locator('select[name="dobMonth"]').selectOption("4");
  await page.locator('select[name="dobYear"]').selectOption("1995");
}

console.log("  form:", JSON.stringify(await page.evaluate(() => {
  const f = {};
  document.querySelectorAll("select, input[name]").forEach((e) => {
    if (e.name && e.type !== "file") f[e.name] = e.value;
  });
  return f;
})));

await page.locator('input[name="photo"]').setInputFiles(big);

// The component shrinks the picture and says so while it works. Waiting for
// that to finish is what makes this deterministic; a fixed sleep is a race on
// a slower machine.
await page.getByText("Preparing your photo").waitFor({ state: "hidden", timeout: 30000 })
  .catch(() => {});

const sent = await page.evaluate(() => {
  const input = document.querySelector('input[name="photo"]');
  return input?.files?.[0] ? { name: input.files[0].name, size: input.files[0].size } : null;
});
check(
  "the browser shrank the picture before sending it",
  Boolean(sent) && sent.size < bytes / 3,
  sent ? `${Math.round(sent.size / 1024)} KB as ${sent.name}` : "no file on the input",
);

await page.getByRole("button", { name: "Continue" }).click();
await page.waitForTimeout(6000);

check(
  "saving with a real photo does not fail the request",
  failures.length === 0,
  failures.join(", "),
);
const shown = await page.locator("body").innerText();
console.log("  page after submit:", shown.replace(/\n+/g, " | ").slice(0, 400));
const complaint = shown
  .split("\n")
  .find((l) => /required|must|Choose|too large|could not/i.test(l));
check(
  "and moves on to the next step",
  /onboarding\/experience/.test(page.url()),
  `${new URL(page.url()).pathname}${complaint ? ` — ${complaint}` : ""}`,
);

const { data: user } = await db.from("users").select("id").eq("email", email).single();
const { data: profile } = await db
  .from("nanny_profiles")
  .select("photo_url, nationality, visa_status")
  .eq("user_id", user.id)
  .maybeSingle();

check("the photo was stored", Boolean(profile?.photo_url), profile?.photo_url ?? "nothing");
check("and so was the rest of the step", Boolean(profile?.nationality && profile?.visa_status));

if (profile?.photo_url) {
  const { data: file } = await db.storage.from("nanny-photos").download(profile.photo_url);
  const stored = file ? (await file.arrayBuffer()).byteLength : 0;
  // Shrunk in the browser before sending, so what arrives is a fraction of
  // what was chosen. This is the saving that made the limit survivable.
  check(
    "what was stored is far smaller than what was chosen",
    stored > 0 && stored < bytes / 4,
    `${Math.round(stored / 1024)} KB from ${Math.round(bytes / 1024)} KB`,
  );
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length === 0 ? 0 : 1);
