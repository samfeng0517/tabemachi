#!/usr/bin/env node
// CLI: the deletion gate for the weekly routine. Fetches remote main and
// confirms that every given Discord message id appears in some restaurant or
// guide `discord_message_ids` of the *published* data file (FETCH_HEAD). A matching HEAD
// alone is not enough (e.g. after a reset to origin/main or an empty commit),
// so this checks the ids themselves.
// Usage: node scripts/verify-published.mjs <message-id> [<message-id> ...]
// Exit 0 iff every id is published; otherwise prints the missing ids, exit 1.

import { execFileSync } from "node:child_process";

// Read what `git fetch origin main` just fetched. FETCH_HEAD cannot be
// shadowed by a local branch or tag named "origin/main".
const DATA_REF = "FETCH_HEAD:data/restaurants.json";

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function publishedIds(data) {
  const items = [
    ...(Array.isArray(data.restaurants) ? data.restaurants : []),
    ...(Array.isArray(data.guides) ? data.guides : []),
  ];
  return new Set(
    items.flatMap((item) =>
      Array.isArray(item?.discord_message_ids) ? item.discord_message_ids : [],
    ),
  );
}

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("Usage: node scripts/verify-published.mjs <message-id> ...");
  process.exit(1);
}

let data;
try {
  git(["fetch", "origin", "main"]);
  data = JSON.parse(git(["show", DATA_REF]));
} catch (err) {
  console.error(`Error: could not read published data: ${err.message}`);
  process.exit(1);
}

const published = publishedIds(data);
const missing = ids.filter((id) => !published.has(id));

if (missing.length > 0) {
  console.error(
    "NOT PUBLISHED: these ids are missing from the fetched remote main data:",
  );
  for (const id of missing) console.error(`  ${id}`);
  process.exit(1);
}

console.log(`OK: all ${ids.length} id(s) are in the fetched remote main data`);
process.exit(0);
