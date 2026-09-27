#!/usr/bin/env node
// CLI: validate a tabemachi data JSON file against the schema.
// Usage: node scripts/validate.mjs <path>

import { readFileSync } from "node:fs";
import { validateData } from "./lib/schema.mjs";

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

const errors = validateData(data);

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
