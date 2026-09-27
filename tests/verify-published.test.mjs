import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(
  __dirname,
  "..",
  "scripts",
  "verify-published.mjs",
);

const PUBLISHED_ID = "11111111111111111";
const NEW_ID = "22222222222222222";

function dataWithIds(ids) {
  return `${JSON.stringify(
    {
      processed_message_count: ids.length,
      restaurants: [],
      guides: [{ id: "g", discord_message_ids: ids }],
    },
    null,
    2,
  )}\n`;
}

// Builds a bare "origin" whose main already publishes PUBLISHED_ID, plus a
// clone (on main) where the routine would work.
function makeClone() {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "tabemachi-verify-published-"),
  );
  const originDir = path.join(rootDir, "origin.git");
  const seedDir = path.join(rootDir, "seed");
  const cloneDir = path.join(rootDir, "clone");
  const git = (cwd, args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" });
  const configure = (cwd) => {
    git(cwd, ["config", "user.email", "test@example.com"]);
    git(cwd, ["config", "user.name", "Test"]);
  };

  git(rootDir, ["init", "--bare", "-b", "main", originDir]);
  mkdirSync(seedDir);
  git(seedDir, ["init", "-b", "main"]);
  configure(seedDir);
  mkdirSync(path.join(seedDir, "data"));
  writeFileSync(
    path.join(seedDir, "data", "restaurants.json"),
    dataWithIds([PUBLISHED_ID]),
  );
  git(seedDir, ["add", "."]);
  git(seedDir, ["commit", "-m", "base"]);
  git(seedDir, ["push", originDir, "main"]);

  git(rootDir, ["clone", originDir, cloneDir]);
  configure(cloneDir);
  const writeData = (ids) =>
    writeFileSync(
      path.join(cloneDir, "data", "restaurants.json"),
      dataWithIds(ids),
    );
  return { rootDir, cloneDir, git, writeData };
}

function runVerifyPublished(cwd, ids) {
  return spawnSync(process.execPath, [scriptPath, ...ids], {
    cwd,
    encoding: "utf8",
  });
}

test("should exit 1 when an id to delete is missing from remote data after a rebase reset", () => {
  const { rootDir, cloneDir, git, writeData } = makeClone();
  try {
    writeData([PUBLISHED_ID, NEW_ID]);
    git(cloneDir, ["commit", "-am", "data change"]);
    // Post-rebase gate failed: the routine resets to the remote tip.
    git(cloneDir, ["reset", "--hard", "origin/main"]);
    const result = runVerifyPublished(cloneDir, [PUBLISHED_ID, NEW_ID]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(NEW_ID));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("should exit 1 when the commit was empty and the ids were never published", () => {
  const { rootDir, cloneDir, git } = makeClone();
  try {
    git(cloneDir, ["commit", "--allow-empty", "-m", "empty"]);
    git(cloneDir, ["push", "origin", "HEAD:main"]);
    const result = runVerifyPublished(cloneDir, [NEW_ID]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(NEW_ID));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("should exit 0 when every id is in the remote data", () => {
  const { rootDir, cloneDir, git, writeData } = makeClone();
  try {
    writeData([PUBLISHED_ID, NEW_ID]);
    git(cloneDir, ["commit", "-am", "data change"]);
    git(cloneDir, ["push", "origin", "HEAD:main"]);
    const result = runVerifyPublished(cloneDir, [PUBLISHED_ID, NEW_ID]);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("should exit 1 when no ids are given", () => {
  const { rootDir, cloneDir } = makeClone();
  try {
    const result = runVerifyPublished(cloneDir, []);
    assert.equal(result.status, 1);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("should exit 1 when the remote cannot be fetched", () => {
  const { rootDir, cloneDir, git } = makeClone();
  try {
    git(cloneDir, [
      "remote",
      "set-url",
      "origin",
      path.join(rootDir, "missing.git"),
    ]);
    const result = runVerifyPublished(cloneDir, [PUBLISHED_ID]);
    assert.equal(result.status, 1);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
