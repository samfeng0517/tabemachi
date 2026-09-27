#!/usr/bin/env node
// CLI + library: verify that a set of changed files stays within data/.
// The weekly Discord sync routine is only allowed to touch data/restaurants.json
// (or other files under data/); this guards against it accidentally editing
// site code or rule files.
// Usage: node scripts/check-scope.mjs [base-ref]  (default base-ref: origin/main)

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";

const IN_SCOPE_PREFIX = "data/";

/**
 * Returns the subset of `paths` that fall outside the allowed `data/` scope.
 * Paths are normalized by stripping a leading "./" before comparison.
 */
export function outOfScope(paths) {
  return paths
    .map((p) => p.replace(/^\.\//, ""))
    .filter((p) => p !== "data" && !p.startsWith(IN_SCOPE_PREFIX));
}

function git(args, options) {
  return execFileSync("git", args, { encoding: "utf8", ...options }).trim();
}

// Lists every changed path relative to the merge base of `baseRef` and HEAD
// (not `baseRef` itself): committed differences since the two branches
// diverged, staged/unstaged working tree changes (all covered by
// `git diff <merge-base>`), plus untracked new files. Diffing against the
// merge base (rather than the possibly-moving `baseRef` tip) avoids flagging
// unrelated files that a concurrent, non-data push to `baseRef` may have
// touched after this run's HEAD diverged from it.
function listChangedPaths(baseRef) {
  const mergeBase = git(["merge-base", baseRef, "HEAD"]);
  const diffOutput = git(["diff", "--name-only", mergeBase]);
  const untrackedOutput = git(["ls-files", "--others", "--exclude-standard"]);
  const diffPaths = diffOutput ? diffOutput.split("\n") : [];
  const untrackedPaths = untrackedOutput ? untrackedOutput.split("\n") : [];
  return [...new Set([...diffPaths, ...untrackedPaths])].filter(Boolean);
}

function main() {
  const baseRef = process.argv[2] || "origin/main";

  let changedPaths;
  try {
    changedPaths = listChangedPaths(baseRef);
  } catch (err) {
    console.error(
      `Error: failed to list changes against "${baseRef}": ${err.message}`,
    );
    process.exitCode = 1;
    return;
  }

  const offending = outOfScope(changedPaths);

  if (offending.length > 0) {
    console.error("Out-of-scope changes detected (only data/ is allowed):");
    for (const path of offending) {
      console.error(`  ${path}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`OK: ${changedPaths.length} file(s) changed, all under data/`);
  process.exitCode = 0;
}

// Percent-encode-safe, symlink-safe comparison: `import.meta.url` percent-
// encodes spaces/non-ASCII characters and reflects the resolved real path,
// while a raw `process.argv[1]` does neither (e.g. on macOS, `os.tmpdir()`
// paths live under `/var/...`, a symlink to `/private/var/...`). Resolve
// `process.argv[1]` with `realpathSync` and convert with `pathToFileURL`
// instead of a raw string template so both sides compare equal.
function isMainModule() {
  if (process.argv[1] == null) return false;
  try {
    return (
      import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
    );
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main();
}
