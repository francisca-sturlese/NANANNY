/**
 * Installs the repository's git hooks into this checkout.
 *
 * Hooks live in `.git/hooks`, which is not versioned, so a hook committed to
 * the repository protects nobody until it is copied into place. This runs from
 * `npm install`, which is the one command everybody working here has already
 * run.
 *
 * Silent when it succeeds and silent when it cannot: a checkout without a .git
 * directory is a valid thing to have, and failing an install over a hook would
 * be a worse trade than going without one.
 */

import { copyFileSync, chmodSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const source = new URL("./hooks/", import.meta.url).pathname;
const target = ".git/hooks";

try {
  if (!existsSync(".git")) process.exit(0);
  mkdirSync(target, { recursive: true });

  for (const name of readdirSync(source)) {
    copyFileSync(join(source, name), join(target, name));
    chmodSync(join(target, name), 0o755);
  }
} catch {
  // Not worth failing an install over.
}
