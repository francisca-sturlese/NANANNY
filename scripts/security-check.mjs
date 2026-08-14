/**
 * The security surface, checked rather than remembered.
 *
 * Headers are easy to add and easy to lose: a refactor of next.config.ts drops
 * one and nothing fails until someone thinks to look. The same goes for the
 * assumptions the CSP rests on, which are written down in
 * `lib/security/headers.ts` and are only true while nobody adds a third party
 * script or renders user text as HTML.
 *
 * Run against a production build:
 *   npm run build && npx next start -p 3100 && node scripts/security-check.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const SRC = new URL("../src/", import.meta.url).pathname;

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const sourceFiles = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));

// ---------------------------------------------------------------- headers
console.log("\n--- HEADERS ---\n");

const home = await fetch(`${BASE}/`, { redirect: "manual" });

const required = {
  "content-security-policy": null,
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": null,
  "cross-origin-opener-policy": "same-origin",
};

for (const [header, expected] of Object.entries(required)) {
  const value = home.headers.get(header);
  check(
    `${header} is set`,
    expected ? value === expected : Boolean(value),
    value ? "" : "missing",
  );
}

check(
  "the framework version is not advertised",
  !home.headers.get("x-powered-by"),
  home.headers.get("x-powered-by") ?? "",
);

const csp = home.headers.get("content-security-policy") ?? "";
for (const directive of [
  "default-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
]) {
  check(`CSP: ${directive}`, csp.includes(directive));
}

check(
  "CSP does not allow scripts from anywhere",
  !/script-src[^;]*\*/.test(csp),
  csp.match(/script-src[^;]*/)?.[0] ?? "",
);

// -------------------------------------------------------------- indexing
console.log("\n--- WHAT A CRAWLER SEES ---\n");

for (const path of ["/family", "/nanny", "/admin", "/login", "/media/nanny-photos/x/y.png"]) {
  const response = await fetch(`${BASE}${path}`, { redirect: "manual" });
  const tag = response.headers.get("x-robots-tag") ?? "";
  check(`${path} is noindex`, tag.includes("noindex"), tag || "missing");
}

const publicPage = await fetch(`${BASE}/pricing`, { redirect: "manual" });
check(
  "a public page is left indexable",
  !(publicPage.headers.get("x-robots-tag") ?? "").includes("noindex"),
);

const media = await fetch(`${BASE}/media/nanny-photos/x/y.png`, { redirect: "manual" });
const cache = media.headers.get("cache-control") ?? "";
check(
  "private files are never cached by anything shared",
  cache.includes("no-store") && cache.includes("private"),
  cache,
);

// ----------------------------------------------------- the CSP assumptions
console.log("\n--- THE ASSUMPTIONS THE CSP RESTS ON ---\n");

// Matched as JSX rather than as a bare word, so the prose in
// lib/security/headers.ts explaining why we do not use it is not a finding.
const withInnerHtml = sourceFiles.filter((f) =>
  /dangerouslySetInnerHTML\s*=\s*\{/.test(readFileSync(f, "utf8")),
);
check(
  "no component renders raw HTML",
  withInnerHtml.length === 0,
  withInnerHtml.map((f) => f.replace(SRC, "")).join(", "),
);

const withExternalScript = sourceFiles.filter((f) => {
  const body = readFileSync(f, "utf8");
  return /<script[^>]+src=["']https?:/.test(body) || /next\/script/.test(body);
});
check(
  "no third party scripts",
  withExternalScript.length === 0,
  withExternalScript.map((f) => f.replace(SRC, "")).join(", "),
);

// --------------------------------------------------------- secret handling
console.log("\n--- SECRETS ---\n");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

// Anything not prefixed NEXT_PUBLIC_ must never reach the browser. Checked
// against the real served HTML and every script it pulls in, not against the
// source, because the mistake that matters is one the bundler made.
const secrets = Object.entries(env)
  .filter(([key, value]) => !key.startsWith("NEXT_PUBLIC_") && value.length > 16)
  .map(([key, value]) => ({ key, value }));

const html = await (await fetch(`${BASE}/`)).text();
const scriptUrls = [...html.matchAll(/src="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
const bundles = await Promise.all(
  scriptUrls.slice(0, 40).map(async (u) => (await fetch(`${BASE}${u}`)).text()),
);
const served = [html, ...bundles].join("\n");

for (const { key, value } of secrets) {
  check(`${key} never reaches the browser`, !served.includes(value));
}
check("there is a secret to check", secrets.length > 0, `${secrets.length} found`);

// The service client is import-guarded, but the guard only works if it is
// there. A missing "server-only" fails at runtime in production, not at build.
const service = readFileSync(join(SRC, "lib/supabase/service.ts"), "utf8");
check("the service role client is server only", service.includes('import "server-only"'));

const usesService = sourceFiles.filter((f) => {
  const body = readFileSync(f, "utf8");
  return body.includes("createServiceClient") && body.includes('"use client"');
});
check(
  "no client component reaches for the service role",
  usesService.length === 0,
  usesService.map((f) => f.replace(SRC, "")).join(", "),
);

// ------------------------------------------------------------- action guards
console.log("\n--- SERVER ACTIONS ---\n");

// Every server action file must re-check the caller itself. A route guard is
// not a substitute: an action is a public endpoint reachable by POST.
const actionFiles = sourceFiles.filter((f) =>
  readFileSync(f, "utf8").startsWith('"use server"'),
);

const unguarded = actionFiles.filter((f) => {
  const body = readFileSync(f, "utf8");
  return !/require(User|Role|Admin|VerifiedUser)|getSession/.test(body);
});
check(
  "every server action module checks the caller",
  unguarded.length === 0,
  unguarded.map((f) => f.replace(SRC, "")).join(", "),
);
check("there are server action modules to check", actionFiles.length > 0, `${actionFiles.length}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length === 0 ? 0 : 1);
