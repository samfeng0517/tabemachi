#!/usr/bin/env node
// CLI + library: verify that a set of changed files stays within data/.
// The weekly Discord sync routine is only allowed to touch data/restaurants.json
// (or other files under data/); this guards against it accidentally editing
// site code or rule files.
// Usage: node scripts/check-scope.mjs [base-ref]  (default base-ref: origin/main)

import { execFileSync } from "node:child_process";

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

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

// Lists every changed path relative to `baseRef`: committed differences,
// staged/unstaged working tree changes (all covered by `git diff <ref>`),
// plus untracked new files.
function listChangedPaths(baseRef) {
  const diffOutput = git(["diff", "--name-only", baseRef]);
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

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
