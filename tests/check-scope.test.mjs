import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { outOfScope } from "../scripts/check-scope.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, "..", "scripts", "check-scope.mjs");

test("outOfScope should return empty when only the data file is changed", () => {
  const result = outOfScope([
    "data/restaurants.json",
    "./data/restaurants.json",
  ]);
  assert.deepEqual(result, []);
});

test("outOfScope should flag other files under data when they are changed", () => {
  const result = outOfScope(["data/restaurants.json", "data/evil.html"]);
  assert.deepEqual(result, ["data/evil.html"]);
});

test("outOfScope should return ROUTINE.md when it is modified", () => {
  const result = outOfScope(["data/restaurants.json", "ROUTINE.md"]);
  assert.deepEqual(result, ["ROUTINE.md"]);
});

test("outOfScope should flag images directory when routine changes it", () => {
  const result = outOfScope([
    "data/restaurants.json",
    "images/new-restaurant.webp",
  ]);
  assert.deepEqual(result, ["images/new-restaurant.webp"]);
});

// Builds a throwaway git repo in a directory whose name contains a space,
// with a single base commit containing `data/restaurants.json`, `ROUTINE.md`
// and `index.html`. Also copies
// the CLI script itself into that same space-containing parent directory —
// but *outside* the git repo itself (in a sibling `repo/` dir), so the copy
// isn't picked up as an untracked file by the checks being tested — so
// tests actually exercise the percent-encoding mismatch between
// `import.meta.url` (percent-encodes the space) and a raw `process.argv[1]`
// (does not) that the main-module guard must be robust against. Returns the
// repo dir, the base commit's SHA, and the copied script's path.
function makeTempRepo() {
  const parentDir = mkdtempSync(path.join(tmpdir(), "tabemachi scope test-"));
  const dir = path.join(parentDir, "repo");
  mkdirSync(dir);
  const run = (args) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  run(["init", "-b", "main"]);
  run(["config", "user.email", "test@example.com"]);
  run(["config", "user.name", "Test"]);
  mkdirSync(path.join(dir, "data"));
  writeFileSync(path.join(dir, "data", "restaurants.json"), "{}\n");
  writeFileSync(path.join(dir, "ROUTINE.md"), "rules\n");
  writeFileSync(path.join(dir, "index.html"), "<p>site</p>\n");
  run(["add", "."]);
  run(["commit", "-m", "base"]);
  const baseRef = run(["rev-parse", "HEAD"]).trim();
  const copiedScriptPath = path.join(parentDir, "check-scope.mjs");
  copyFileSync(scriptPath, copiedScriptPath);
  return { parentDir, dir, baseRef, copiedScriptPath, run };
}

function runCheckScope(scriptPath, dir, baseRef) {
  return spawnSync(process.execPath, [scriptPath, baseRef], {
    cwd: dir,
    encoding: "utf8",
  });
}

test("should exit 1 when a file outside data is changed", () => {
  const { parentDir, dir, baseRef, copiedScriptPath } = makeTempRepo();
  try {
    writeFileSync(path.join(dir, "ROUTINE.md"), "changed\n");
    const result = runCheckScope(copiedScriptPath, dir, baseRef);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ROUTINE\.md/);
  } finally {
    rmSync(parentDir, { recursive: true, force: true });
  }
});

test("should exit 0 when only data files are changed", () => {
  const { parentDir, dir, baseRef, copiedScriptPath } = makeTempRepo();
  try {
    writeFileSync(path.join(dir, "data", "restaurants.json"), '{"a":1}\n');
    const result = runCheckScope(copiedScriptPath, dir, baseRef);
    assert.equal(result.status, 0);
  } finally {
    rmSync(parentDir, { recursive: true, force: true });
  }
});

test("should exit 1 when a new file is added under data other than the data file", () => {
  const { parentDir, dir, baseRef, copiedScriptPath } = makeTempRepo();
  try {
    writeFileSync(path.join(dir, "data", "evil.html"), "<script></script>\n");
    const result = runCheckScope(copiedScriptPath, dir, baseRef);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /data\/evil\.html/);
  } finally {
    rmSync(parentDir, { recursive: true, force: true });
  }
});

test("should exit 1 when a rule file is moved into data with git mv", () => {
  const { parentDir, dir, baseRef, copiedScriptPath, run } = makeTempRepo();
  try {
    run(["mv", "ROUTINE.md", "data/ROUTINE.md"]);
    const result = runCheckScope(copiedScriptPath, dir, baseRef);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ROUTINE\.md/);
  } finally {
    rmSync(parentDir, { recursive: true, force: true });
  }
});

test("should exit 1 when a site file change is staged but the working tree is restored", () => {
  const { parentDir, dir, baseRef, copiedScriptPath, run } = makeTempRepo();
  try {
    writeFileSync(path.join(dir, "index.html"), "<p>hacked</p>\n");
    run(["add", "index.html"]);
    writeFileSync(path.join(dir, "index.html"), "<p>site</p>\n");
    const result = runCheckScope(copiedScriptPath, dir, baseRef);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /index\.html/);
  } finally {
    rmSync(parentDir, { recursive: true, force: true });
  }
});

test("should exit 1 when a committed site file change is reverted only in the working tree", () => {
  const { parentDir, dir, baseRef, copiedScriptPath, run } = makeTempRepo();
  try {
    writeFileSync(path.join(dir, "index.html"), "<p>hacked</p>\n");
    run(["commit", "-am", "sneak"]);
    writeFileSync(path.join(dir, "index.html"), "<p>site</p>\n");
    const result = runCheckScope(copiedScriptPath, dir, baseRef);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /index\.html/);
  } finally {
    rmSync(parentDir, { recursive: true, force: true });
  }
});

test("should exit 0 when a data-only change is committed and the base advanced with a site change", () => {
  const { parentDir, dir, copiedScriptPath, run } = makeTempRepo();
  try {
    run(["checkout", "-b", "remote-main"]);
    writeFileSync(path.join(dir, "index.html"), "<p>new design</p>\n");
    run(["commit", "-am", "site change on remote"]);
    run(["checkout", "main"]);
    writeFileSync(path.join(dir, "data", "restaurants.json"), '{"a":1}\n');
    run(["commit", "-am", "data change"]);
    const result = runCheckScope(copiedScriptPath, dir, "remote-main");
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(parentDir, { recursive: true, force: true });
  }
});
