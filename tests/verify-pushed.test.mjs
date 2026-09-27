import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, "..", "scripts", "verify-pushed.mjs");

// Builds a bare "origin" repo with one commit on main, plus a clone of it
// that has switched to a non-main branch (as a cloud session may start on a
// `claude/...` branch) and committed a data change there.
function makeCloneOnSideBranch() {
  const rootDir = mkdtempSync(path.join(tmpdir(), "tabemachi-verify-pushed-"));
  const originDir = path.join(rootDir, "origin.git");
  const seedDir = path.join(rootDir, "seed");
  const cloneDir = path.join(rootDir, "clone");
  const git = (cwd, args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" });

  git(rootDir, ["init", "--bare", "-b", "main", originDir]);
  mkdirSync(seedDir);
  git(seedDir, ["init", "-b", "main"]);
  git(seedDir, ["config", "user.email", "test@example.com"]);
  git(seedDir, ["config", "user.name", "Test"]);
  mkdirSync(path.join(seedDir, "data"));
  writeFileSync(path.join(seedDir, "data", "restaurants.json"), "{}\n");
  git(seedDir, ["add", "."]);
  git(seedDir, ["commit", "-m", "base"]);
  git(seedDir, ["push", originDir, "main"]);

  git(rootDir, ["clone", originDir, cloneDir]);
  git(cloneDir, ["config", "user.email", "test@example.com"]);
  git(cloneDir, ["config", "user.name", "Test"]);
  git(cloneDir, ["checkout", "-b", "claude/session-branch"]);
  writeFileSync(path.join(cloneDir, "data", "restaurants.json"), '{"a":1}\n');
  git(cloneDir, ["commit", "-am", "data change"]);
  return { rootDir, cloneDir, git };
}

function runVerifyPushed(cwd) {
  return spawnSync(process.execPath, [scriptPath], { cwd, encoding: "utf8" });
}

test("should exit 1 when push origin main was a no-op from a non-main branch", () => {
  const { rootDir, cloneDir, git } = makeCloneOnSideBranch();
  try {
    git(cloneDir, ["push", "origin", "main"]);
    const result = runVerifyPushed(cloneDir);
    assert.equal(result.status, 1);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("should exit 0 when HEAD was pushed to remote main", () => {
  const { rootDir, cloneDir, git } = makeCloneOnSideBranch();
  try {
    git(cloneDir, ["push", "origin", "HEAD:main"]);
    const head = git(cloneDir, ["rev-parse", "HEAD"]).trim();
    const result = runVerifyPushed(cloneDir);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(head));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("should exit 1 when the remote cannot be reached", () => {
  const { rootDir, cloneDir, git } = makeCloneOnSideBranch();
  try {
    git(cloneDir, [
      "remote",
      "set-url",
      "origin",
      path.join(rootDir, "missing.git"),
    ]);
    const result = runVerifyPushed(cloneDir);
    assert.equal(result.status, 1);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
