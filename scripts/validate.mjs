#!/usr/bin/env node
// CLI: validate a tabemachi data JSON file against the schema.
// Usage: node scripts/validate.mjs <path>

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateData } from "./lib/schema.mjs";

// Local image paths ("images/<id>.webp") are resolved against the repo root,
// i.e. the parent of this scripts/ directory, regardless of the data path.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fileExists = (relativePath) => existsSync(join(repoRoot, relativePath));

const path = process.argv[2];

if (!path) {
  console.error("Usage: node scripts/validate.mjs <path>");
  process.exit(1);
}

let data;
try {
  const text = readFileSync(path, "utf8");
  data = JSON.parse(text);
} catch (err) {
  console.error(
    `Error: could not read or parse JSON file "${path}": ${err.message}`,
  );
  process.exit(1);
}

const errors = validateData(data, { fileExists });

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log(
  `OK: ${data.restaurants.length} restaurants, ${data.guides.length} guides`,
);
process.exit(0);
