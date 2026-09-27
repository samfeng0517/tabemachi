import { test } from "node:test";
import assert from "node:assert/strict";
import { outOfScope } from "../scripts/check-scope.mjs";

test("outOfScope should return empty when all paths are under data", () => {
  const result = outOfScope([
    "data/restaurants.json",
    "data/nested/extra.json",
  ]);
  assert.deepEqual(result, []);
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
