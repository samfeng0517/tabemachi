#!/usr/bin/env node
// CLI: confirm that the local HEAD is exactly what the remote main branch
// points to. A plain `git push origin main` from a non-main branch reports
// "Everything up-to-date" without publishing anything, so the routine must
// treat a push as successful only when this check exits 0.
// Usage: node scripts/verify-pushed.mjs
// Exit 0 iff `git ls-remote origin refs/heads/main` equals `git rev-parse HEAD`.

import { execFileSync } from "node:child_process";

const REMOTE = "origin";
const REMOTE_REF = "refs/heads/main";

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

let localSha;
let remoteSha;
try {
  localSha = git(["rev-parse", "HEAD"]);
  // Output format: "<sha>\t<ref>"; empty when the ref does not exist.
  remoteSha = git(["ls-remote", REMOTE, REMOTE_REF]).split(/\s+/)[0] ?? "";
} catch (err) {
  console.error(`Error: failed to read local or remote SHA: ${err.message}`);
  process.exit(1);
}

console.log(`local HEAD:           ${localSha}`);
console.log(`${REMOTE} ${REMOTE_REF}: ${remoteSha || "(missing)"}`);

if (remoteSha !== "" && remoteSha === localSha) {
  console.log("OK: remote main matches HEAD");
  process.exit(0);
}

console.error("NOT PUSHED: remote main does not match HEAD");
process.exit(1);
