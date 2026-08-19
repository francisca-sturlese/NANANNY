/**
 * Points this checkout's git hooks at the ones in the repository.
 *
 * Hooks live in `.git/hooks`, which is not versioned, so for a long time this
 * copied them into place from `npm install`. Copies drift: on 2026-08-19 a
 * migration collision reached the remote with the guard against it already
 * written and merged, because the installed copy was two days old and nobody
 * had run npm install in between. A guard that is only sometimes present is
 * worse than an absent one, because everybody believes it is there.
 *
 * So this sets `core.hooksPath` instead. Git then runs the file in the
 * repository directly, which means checking out a branch changes the hooks the
 * way it changes everything else, and there is no second copy to go stale.
 *
 * It matters more than it did: a push to main now applies migrations to the
 * production database by itself, so the version collision this hook refuses is
 * a production failure rather than a local one.
 *
 * Silent when it succeeds and silent when it cannot: a checkout without a .git
 * directory is a valid thing to have, and failing an install over a hook would
 * be a worse trade than going without one.
 */

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const source = "scripts/hooks";

try {
  if (!existsSync(".git")) process.exit(0);

  // Executable in the repository, since git runs these in place now.
  for (const name of readdirSync(source)) {
    chmodSync(join(source, name), 0o755);
  }

  execFileSync("git", ["config", "core.hooksPath", source], { stdio: "ignore" });

  /**
   * The old copies, removed once they are no longer what runs.
   *
   * Left behind they are a trap for the next person who reads .git/hooks to
   * find out what happens on commit, and finds a version from a week ago.
   */
  for (const name of readdirSync(source)) {
    const stale = join(".git/hooks", name);
    if (existsSync(stale)) rmSync(stale, { force: true });
  }
} catch {
  // Not worth failing an install over.
}
