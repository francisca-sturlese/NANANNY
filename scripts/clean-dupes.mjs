/**
 * Removes the copies macOS leaves behind, and says so.
 *
 * A duplicated file here is not cosmetic. `supabase db reset` reads every file
 * in the migrations directory, so "20260814320000_notification_events 2.sql"
 * is a second migration claiming a version already in the ledger, and the reset
 * fails on a unique violation that names nothing useful. That has cost an hour
 * three times.
 *
 * This used to be a silent `find -delete` inside db:reset, and the silence was
 * its own bug: the copies were removed locally before anybody saw them, so they
 * survived only in the one place nobody looks, which is a commit. Twelve of
 * them reached the remote that way, one being a copy of a migration whose
 * version was already applied, which the next db push would have picked up.
 *
 * So it prints what it removed, and warns when git is still tracking one, which
 * is the case a delete on disk cannot fix on its own.
 */

import { readdirSync, statSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

// "bell 2.tsx", "copy 3.ts", "notification_events 2.sql".
const COPY = /\s\d+\.[a-z]+$/i;
// `public` is on the list because a copy of a service worker was staged
// there and the sweep did not look: the roots were written before anything
// lived outside src, supabase and scripts.
const ROOTS = ["supabase", "src", "scripts", "public"];
const SKIP = new Set(["node_modules", ".next", ".git"]);

const removed = [];

function sweep(directory) {
  for (const entry of readdirSync(directory)) {
    if (SKIP.has(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      sweep(path);
    } else if (COPY.test(entry)) {
      unlinkSync(path);
      removed.push(path);
    }
  }
}

for (const root of ROOTS) sweep(root);

if (removed.length) {
  console.log(`Removed ${removed.length} duplicate file(s):`);
  for (const path of removed) console.log(`  ${path}`);
}

// The half a delete cannot do. A tracked copy comes back on the next checkout,
// and a tracked copy of a migration is the one that breaks a deploy.
let tracked = [];
try {
  tracked = execSync("git ls-files", { encoding: "utf8" })
    .split("\n")
    .filter((path) => COPY.test(path));
} catch {
  // Not a git checkout. Nothing to warn about.
}

if (tracked.length) {
  console.error(`\n${tracked.length} duplicate file(s) are still tracked by git:`);
  for (const path of tracked) console.error(`  ${path}`);
  console.error("\nRun: git rm --cached the paths above, then commit.");
  console.error("A tracked copy of a migration claims a version already in the ledger.");
  process.exit(1);
}
