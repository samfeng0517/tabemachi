#!/usr/bin/env node
// CLI + library: verify that every change stays within the single allowed
// file, data/restaurants.json. The weekly Discord sync routine is only
// allowed to touch that file; this guards against it accidentally editing
// site code, rule files, or dropping new files anywhere (including data/).
// Usage: node scripts/check-scope.mjs [base-ref]  (default base-ref: origin/main)
// Run it both before committing and again after committing (before pushing):
// it checks committed, staged, unstaged, and untracked changes relative to
// the merge base of base-ref and HEAD.

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";

const ALLOWED_PATH = "data/restaurants.json";

/**
 * Returns the subset of `paths` that are not the single allowed data file.
 * Paths are normalized by stripping a leading "./" before comparison.
 */
export function outOfScope(paths) {
  return paths
    .map((p) => p.replace(/^\.\//, ""))
    .filter((p) => p !== ALLOWED_PATH);
}

function git(args, options) {
  return execFileSync("git", args, { encoding: "utf8", ...options }).trim();
}

function splitLines(output) {
  return output ? output.split("\n") : [];
}

// Lists every changed path relative to the merge base of `baseRef` and HEAD
// (not `baseRef` itself, so a concurrent non-data push to `baseRef` after
// this run's HEAD diverged is not flagged). Collected separately so that no
// source can mask another:
//   - committed range (merge base -> HEAD),
//   - index vs merge base (catches staged changes whose working tree copy
//     was restored),
//   - working tree vs merge base (catches unstaged edits),
//   - untracked files.
// `--no-renames` reports a move as delete + add, so moving a file into the
// allowed location still flags the original path.
function listChangedPaths(baseRef) {
  const mergeBase = git(["merge-base", baseRef, "HEAD"]);
  const sources = [
    ["diff", "--name-only", "--no-renames", mergeBase, "HEAD"],
    ["diff", "--cached", "--name-only", "--no-renames", mergeBase],
    ["diff", "--name-only", "--no-renames", mergeBase],
    ["ls-files", "--others", "--exclude-standard"],
  ];
  const paths = sources.flatMap((args) => splitLines(git(args)));
  return [...new Set(paths)].filter(Boolean);
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
    console.error(
      `Out-of-scope changes detected (only ${ALLOWED_PATH} is allowed):`,
    );
    for (const path of offending) {
      console.error(`  ${path}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `OK: ${changedPaths.length} file(s) changed, all within ${ALLOWED_PATH}`,
  );
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
