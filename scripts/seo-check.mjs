/**
 * What a crawler and a share preview actually get.
 *
 * Fetched from a running production build rather than read out of the source,
 * because the failures worth catching are the ones the framework introduces:
 * a canonical pointing at the wrong host, a sitemap listing a page that 404s,
 * a private route that quietly became indexable.
 *
 * Run:  npm run build && npx next start -p 3100 && node scripts/seo-check.mjs
 */

import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const text = async (path) => (await fetch(`${BASE}${path}`)).text();

// ------------------------------------------------------------------ robots
console.log("\n--- ROBOTS ---\n");

const robotsResponse = await fetch(`${BASE}/robots.txt`);
check("robots.txt is served", robotsResponse.ok, String(robotsResponse.status));
const robots = await robotsResponse.text();

for (const path of ["/family/", "/nanny/", "/admin/", "/media/", "/nannies/"]) {
  check(`robots.txt disallows ${path}`, robots.includes(`Disallow: ${path}`));
}
check("robots.txt points at the sitemap", /Sitemap:\s*https?:\/\/\S+\/sitemap\.xml/.test(robots));

// ----------------------------------------------------------------- sitemap
console.log("\n--- SITEMAP ---\n");

const sitemapResponse = await fetch(`${BASE}/sitemap.xml`);
check("sitemap.xml is served", sitemapResponse.ok, String(sitemapResponse.status));
const sitemap = await sitemapResponse.text();

const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
check("the sitemap lists pages", urls.length > 5, `${urls.length} urls`);

for (const page of ["/", "/for-families", "/for-nannies", "/pricing", "/nannies", "/jobs"]) {
  check(`the sitemap lists ${page}`, urls.some((u) => new URL(u).pathname === page));
}

// The point of the exclusion, asserted rather than assumed.
check(
  "no individual nanny profile is listed",
  !urls.some((u) => /^\/nannies\/.+/.test(new URL(u).pathname)),
  urls.find((u) => /^\/nannies\/.+/.test(new URL(u).pathname)) ?? "",
);

const jobUrls = urls.filter((u) => /^\/jobs\/.+/.test(new URL(u).pathname));
check("open jobs are listed", jobUrls.length > 0, `${jobUrls.length} jobs`);

// Every listed URL must actually resolve. A sitemap full of 404s is worse
// than no sitemap.
const statuses = await Promise.all(
  urls.slice(0, 30).map(async (u) => {
    const path = new URL(u).pathname;
    const response = await fetch(`${BASE}${path}`, { redirect: "manual" });
    return { path, status: response.status };
  }),
);
const broken = statuses.filter((s) => s.status >= 400);
check(
  "every listed page resolves",
  broken.length === 0,
  broken.map((b) => `${b.path} ${b.status}`).join(", "),
);

// -------------------------------------------------------------- canonicals
console.log("\n--- CANONICALS ---\n");

const siteOrigin = new URL(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .find((l) => l.startsWith("NEXT_PUBLIC_SITE_URL="))
    .split("=")[1]
    .trim(),
).origin;

for (const page of ["/", "/for-families", "/pricing", "/nannies", "/jobs"]) {
  const html = await text(page);
  const href = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)?.[1];
  const ok = href ? new URL(href).origin === siteOrigin && new URL(href).pathname === page : false;
  check(`${page} declares its canonical`, ok, href ?? "missing");
}

// ----------------------------------------------------------- share preview
console.log("\n--- SHARE PREVIEW ---\n");

const home = await text("/");

const og = Object.fromEntries(
  [...home.matchAll(/<meta property="(og:[^"]+)" content="([^"]*)"/g)].map((m) => [m[1], m[2]]),
);

for (const tag of ["og:title", "og:description", "og:image", "og:site_name", "og:url"]) {
  check(`${tag} is present`, Boolean(og[tag]), og[tag] ?? "missing");
}

check(
  "the share image is absolute",
  (og["og:image"] ?? "").startsWith("http"),
  og["og:image"] ?? "",
);

if (og["og:image"]) {
  const image = await fetch(`${BASE}${new URL(og["og:image"]).pathname}`);
  const bytes = Number(image.headers.get("content-length") ?? 0);
  check("the share image is served", image.ok, String(image.status));
  // Several platforms refuse to fetch anything over 5 MB.
  check("the share image is a sensible size", bytes > 0 && bytes < 5_000_000, `${Math.round(bytes / 1024)} KB`);
}

check(
  "a large twitter card is declared",
  /name="twitter:card" content="summary_large_image"/.test(home),
);

// --------------------------------------------------------- structured data
console.log("\n--- STRUCTURED DATA ---\n");

function structuredData(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
}

let homeData = [];
try {
  homeData = structuredData(home);
  check("the homepage structured data parses", true);
} catch (error) {
  check("the homepage structured data parses", false, String(error));
}
check(
  "the homepage declares the organisation",
  homeData.some((d) => d["@type"] === "Organization"),
);

const firstJob = jobUrls[0] ? new URL(jobUrls[0]).pathname : null;
if (firstJob) {
  const jobHtml = await text(firstJob);
  let jobData = [];
  try {
    jobData = structuredData(jobHtml);
    check("the job structured data parses", true);
  } catch (error) {
    check("the job structured data parses", false, String(error));
  }

  const posting = jobData.find((d) => d["@type"] === "JobPosting");
  check("a job page declares a JobPosting", Boolean(posting));
  if (posting) {
    for (const field of ["title", "description", "jobLocation", "hiringOrganization"]) {
      check(`the JobPosting has ${field}`, Boolean(posting[field]));
    }
    // The family behind a job is never named, on the page or in the markup.
    check(
      "the family is not named in the markup",
      posting.hiringOrganization?.name === "A family on NaNanny UAE",
      posting.hiringOrganization?.name ?? "",
    );
  }
} else {
  check("a job page declares a JobPosting", false, "no open job to check");
}

// ------------------------------------------------------------ noindex rules
console.log("\n--- WHAT STAYS OUT OF THE INDEX ---\n");

const nannyUrl = (await text("/nannies")).match(/href="(\/nannies\/[0-9a-f-]{36})"/)?.[1];
if (nannyUrl) {
  const profile = await fetch(`${BASE}${nannyUrl}`);
  const html = await profile.text();
  const meta = html.match(/<meta name="robots" content="([^"]+)"/)?.[1] ?? "";
  const header = profile.headers.get("x-robots-tag") ?? "";
  check(
    "an individual nanny profile is noindex",
    meta.includes("noindex") || header.includes("noindex"),
    meta || header || "neither",
  );
  check("but it is still readable without an account", profile.ok, String(profile.status));
} else {
  check("an individual nanny profile is noindex", false, "no profile link found");
}

const search = await fetch(`${BASE}/nannies`);
const searchMeta = (await search.text()).match(/<meta name="robots" content="([^"]+)"/)?.[1] ?? "";
check(
  "the search page itself stays indexable",
  !searchMeta.includes("noindex"),
  searchMeta || "no robots meta",
);

// ------------------------------------------------------- copy matches truth
console.log("\n--- THE CLAIM IN THE METADATA ---\n");

// The description promises a specific number of free contacts. That number
// lives in pricing_config, and the two drifting apart would put a false claim
// in every search result.
const { execSync } = await import("node:child_process");
const db = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const query = (sql) => execSync(`psql "${db}" -tA -c "${sql}"`).toString().trim();

const freeContacts = query("select free_contacts from pricing_config limit 1");
const promoActive = query("select promo_active()") === "t";

const description = home.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
const claimed = description.match(/first (\d+)/)?.[1];
check(
  "the free contact count in the description is the real one",
  claimed === freeContacts,
  `description says ${claimed ?? "nothing"}, pricing_config says ${freeContacts}`,
);

// During a launch window the pages a family reads before signing up must not
// present the allowance as the current state, because it is not. This is a
// conversion problem as much as an honesty one: a family told it has three
// contacts behaves as though it is on a meter when nothing is being counted.
if (promoActive) {
  const pricingPage = await text("/pricing");
  const leads = /free right now|costs nothing at all|it is all free/i.test(pricingPage);
  check(
    "the pricing page leads with the launch offer while the window is open",
    leads,
    leads ? "" : "found no promotional lead",
  );
  check(
    "and explains what happens when the window closes",
    /when the launch period ends|untouched/i.test(pricingPage),
  );
  const howItWorks = await text("/how-it-works");
  check(
    "how it works says the launch period is free",
    /while we are launching/i.test(howItWorks),
  );
} else {
  console.log("  SKIP  promotional copy checks, no window is open");
}

// ------------------------------------------------- the same claim, everywhere
console.log("\n--- THE ALLOWANCE, WHEREVER IT IS WRITTEN ---\n");

/**
 * The free contact allowance, checked on every page that mentions it.
 *
 * This started as three separate bug reports that were the same bug: the
 * pricing page, then how it works, then the signup card on the search page,
 * each stating "your first 3 nanny contacts are free" while a launch window was
 * open and contacting nannies was free for everybody. Fixing them one at a time
 * found the fourth only when a person happened to read it.
 *
 * So the check is on the category rather than on the page. Any marketing page
 * that names the allowance has to name the real one, and while a window is open
 * no page may present the allowance as the current state, because it is not
 * being counted. A family told it has three contacts behaves as if it is on a
 * meter when nothing is running.
 *
 * Not checked here: the description in the site metadata. It is static, it
 * cannot read the database without making every page dynamic, the number in it
 * is already checked above, and understating an offer in a search result is not
 * the failure this is about.
 */
const MARKETING_PAGES = ["/", "/pricing", "/how-it-works", "/nannies", "/jobs"];

// "your first 3 contacts", "3 free contacts", "first three nanny contacts".
const ALLOWANCE = /(?:first\s+(\d+|three)\b[^.]{0,40}?contacts?)|(?:(\d+|three)\s+free\s+contacts?)/gi;
const WORDS = { three: "3" };

for (const path of MARKETING_PAGES) {
  const body = (await text(path))
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ");

  const found = [...body.matchAll(ALLOWANCE)].map((m) => {
    const raw = (m[1] ?? m[2] ?? "").toLowerCase();
    return { text: m[0].trim(), number: WORDS[raw] ?? raw };
  });

  if (found.length === 0) continue;

  const wrong = found.filter((f) => f.number !== freeContacts);
  check(
    `${path} names the real allowance`,
    wrong.length === 0,
    wrong.map((f) => `"${f.text}"`).join(", "),
  );

  if (!promoActive) continue;

  /**
   * While a window is open, naming the allowance is fine. Naming it as the
   * current state is not.
   *
   * "Afterwards your first 3 contacts are free" is exactly right and should
   * stay. "Your first 3 nanny contacts are free" was the bug, three times over.
   * The difference is a qualifier near it, so that is what is looked for rather
   * than the phrase in isolation.
   *
   * A window of text around the match, not the sentence containing it. The
   * search page is a list of cards with no full stops in it, so splitting on
   * sentences produced one blob the length of the page: any qualifier anywhere
   * on it would have covered for a bare claim at the other end, and the failure
   * it did report quoted nineteen nannies rather than the sentence at fault.
   */
  const QUALIFIED =
    /while we are launching|launch period|launching|afterwards|after that|after \d|what happens after|does not use|none of|until|free for everyone|no cost right now/i;

  const bare = [];
  ALLOWANCE.lastIndex = 0;
  for (const match of body.matchAll(ALLOWANCE)) {
    const from = Math.max(0, match.index - 160);
    const context = body.slice(from, match.index + match[0].length + 80);
    if (!QUALIFIED.test(context)) {
      bare.push(body.slice(match.index, match.index + match[0].length + 60).trim());
    }
  }

  check(
    `${path} does not state the allowance as the current state during a launch window`,
    bare.length === 0,
    bare.map((s) => `"${s}"`).join(" / "),
  );
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length === 0 ? 0 : 1);
