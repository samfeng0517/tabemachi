import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateData, cleanUrl } from "../scripts/lib/schema.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, "..", "data", "restaurants.json");
const imagesDir = path.join(__dirname, "..", "images");

// Builds a minimal valid restaurant object, overridable via `overrides`.
// `image_url` defaults to matching whatever `id` ends up being so that
// overriding just `id` still produces a valid object.
function makeRestaurant(overrides = {}) {
  const id = overrides.id ?? "test-restaurant";
  return {
    id,
    name: "Test Restaurant",
    country: "台灣",
    area: "台北・南港",
    cuisine: "測試料理",
    price: "$$",
    meal: "午餐",
    author: "tester",
    date: "2026-08-09",
    location: "台北市南港區",
    note: "測試備註",
    verified: true,
    source: "https://example.com/source",
    map_url: "https://www.google.com/maps/search/?api=1&query=test",
    image_url: `images/${id}.webp`,
    image_credit_url: "https://example.com/credit",
    color: "clay",
    discord_message_ids: [],
    ...overrides,
  };
}

// Builds a minimal valid guide object, overridable via `overrides`.
function makeGuide(overrides = {}) {
  return {
    id: "test-guide",
    title: "Test Guide",
    area: "台北・多地",
    tag: "測試標籤",
    source: "https://example.com/guide-source",
    note: "測試備註",
    discord_message_ids: [],
    ...overrides,
  };
}

function makeData(overrides = {}) {
  return {
    processed_message_count: 47,
    restaurants: [makeRestaurant()],
    guides: [makeGuide()],
    ...overrides,
  };
}

test("validateData should return no errors when given the migrated data file", () => {
  const data = JSON.parse(readFileSync(dataPath, "utf8"));
  const errors = validateData(data);
  assert.deepEqual(errors, []);
});

test("validateData should report an error when a url uses http scheme", () => {
  const data = makeData({
    restaurants: [makeRestaurant({ source: "http://example.com/source" })],
  });
  const errors = validateData(data);
  assert.ok(errors.length > 0);
});

test("validateData should report an error when a url uses javascript scheme", () => {
  const data = makeData({
    restaurants: [makeRestaurant({ source: "javascript:alert(1)" })],
  });
  const errors = validateData(data);
  assert.ok(errors.length > 0);
});

test("validateData should report an error when two items share an id", () => {
  const data = makeData({
    restaurants: [makeRestaurant({ id: "dup-id" })],
    guides: [makeGuide({ id: "dup-id" })],
  });
  const errors = validateData(data);
  assert.ok(errors.some((e) => e.includes("dup-id")));
});

test("validateData should report an error when an item repeats a discord message id", () => {
  const data = makeData({
    restaurants: [
      makeRestaurant({
        discord_message_ids: ["12345678901234567", "12345678901234567"],
      }),
    ],
  });
  const errors = validateData(data);
  assert.ok(errors.length > 0);
});

test("validateData should accept the same discord message id when it appears on two different items", () => {
  const data = makeData({
    restaurants: [
      makeRestaurant({
        id: "restaurant-a",
        discord_message_ids: ["12345678901234567"],
      }),
      makeRestaurant({
        id: "restaurant-b",
        discord_message_ids: ["12345678901234567"],
      }),
    ],
  });
  const errors = validateData(data);
  assert.deepEqual(errors, []);
});

test("validateData should report an error when meal is not an allowed value", () => {
  const data = makeData({
    restaurants: [makeRestaurant({ meal: "早午餐" })],
  });
  const errors = validateData(data);
  assert.ok(errors.length > 0);
});

test("validateData should report an error when country is an empty string", () => {
  const data = makeData({
    restaurants: [makeRestaurant({ country: "" })],
  });
  const errors = validateData(data);
  assert.ok(errors.length > 0);
});

test("validateData should report an error when price mixes currency symbols", () => {
  const data = makeData({
    restaurants: [makeRestaurant({ price: "$¥" })],
  });
  const errors = validateData(data);
  assert.ok(errors.length > 0);
});

test("cleanUrl should strip igsh and utm params when present", () => {
  const result = cleanUrl(
    "https://example.com/post?igsh=abc123&utm_source=ig&utm_medium=share&id=42",
  );
  assert.equal(result, "https://example.com/post?id=42");
});

test("cleanUrl should keep non-tracking params when present", () => {
  const result = cleanUrl("https://example.com/search?q=ramen&page=2#section");
  assert.equal(result, "https://example.com/search?q=ramen&page=2#section");
});

test("should contain 36 restaurants and 5 guides when migration is complete", () => {
  const data = JSON.parse(readFileSync(dataPath, "utf8"));
  assert.equal(data.restaurants.length, 36);
  assert.equal(data.guides.length, 5);
});

test("should reference an existing image file for every restaurant when migration is complete", () => {
  const data = JSON.parse(readFileSync(dataPath, "utf8"));
  for (const restaurant of data.restaurants) {
    const imagePath = path.join(imagesDir, `${restaurant.id}.webp`);
    assert.ok(existsSync(imagePath), `missing image for ${restaurant.id}`);
  }
});
