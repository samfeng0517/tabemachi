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

test("validateData should report an error when a url points to discord", () => {
  const discordUrls = [
    "https://discord.com/channels/1/2/3",
    "https://discordapp.com/channels/1/2/3",
    "https://cdn.discordapp.com/attachments/1/2/photo.jpg",
    "https://media.discordapp.net/attachments/1/2/photo.jpg",
    "https://images-ext-1.discordapp.net/external/abc/photo.jpg",
  ];
  for (const url of discordUrls) {
    for (const field of [
      "source",
      "map_url",
      "image_url",
      "image_credit_url",
    ]) {
      const data = makeData({
        restaurants: [makeRestaurant({ [field]: url })],
      });
      const errors = validateData(data);
      assert.ok(
        errors.some((e) => e.includes(field) && e.includes("discord")),
        `expected a discord error for restaurant ${field}=${url}`,
      );
    }
    const data = makeData({ guides: [makeGuide({ source: url })] });
    const errors = validateData(data);
    assert.ok(
      errors.some((e) => e.includes("source") && e.includes("discord")),
      `expected a discord error for guide source=${url}`,
    );
  }
});

test("validateData should accept a url when its host only resembles discord", () => {
  const data = makeData({
    restaurants: [makeRestaurant({ source: "https://notdiscord.com/post" })],
  });
  const errors = validateData(data);
  assert.deepEqual(errors, []);
});

test("validateData should report an error when date is later than tomorrow", () => {
  const data = makeData({
    restaurants: [makeRestaurant({ date: "2999-01-01" })],
  });
  const errors = validateData(data);
  assert.ok(errors.some((e) => e.includes("2999-01-01")));
});

test("validateData should accept a date when it is today in UTC", () => {
  const today = new Date().toISOString().slice(0, 10);
  const data = makeData({ restaurants: [makeRestaurant({ date: today })] });
  const errors = validateData(data);
  assert.deepEqual(errors, []);
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

// Ids present when the legacy site was migrated. New items may be added by
// the routine or by hand; these must never disappear.
const LEGACY_RESTAURANT_IDS = [
  "bogarts",
  "top-seafood",
  "orange",
  "ikki",
  "kinkan",
  "nonkiya",
  "matsuya",
  "yaekatsu",
  "mura",
  "nekomasa",
  "maikoga",
  "burnt",
  "mensho",
  "tsukimi",
  "kumo",
  "afuri",
  "zhishuang",
  "shingen",
  "butayama",
  "benjamin",
  "laomiandian",
  "karasemitei",
  "kohinoor",
  "burning-burger",
  "tsuruichi",
  "la-brasserie",
  "sushi-ichida",
  "sakanakun-taipei-station",
  "menya-hanabi-taipei",
  "erbensong",
  "newbabe",
  "koronagirai",
  "quan-oc-63",
  "luigi-laundry-anhe",
  "agito-hirao",
  "the-refinery-saigon",
];
const LEGACY_GUIDE_IDS = [
  "taiwan-dating-tier-list",
  "sogo-taipei-dome-food-guide",
  "tokyo-trip-multi-shop-review",
  "ho-chi-minh-city-food-guide",
  "three-unconfirmed-recommendations",
];

// Checks are parameterized by data so they run on both the real file and
// an augmented copy that simulates a routine run.
function assertLegacyItemsPresent(data) {
  const restaurantIds = new Set(data.restaurants.map((r) => r.id));
  const guideIds = new Set(data.guides.map((g) => g.id));
  for (const id of LEGACY_RESTAURANT_IDS) {
    assert.ok(restaurantIds.has(id), `missing legacy restaurant ${id}`);
  }
  for (const id of LEGACY_GUIDE_IDS) {
    assert.ok(guideIds.has(id), `missing legacy guide ${id}`);
  }
}

// Only local images (committed under images/) must exist on disk; external
// https images are allowed to be missing locally.
function assertLocalImagesExist(data) {
  for (const restaurant of data.restaurants) {
    if (!restaurant.image_url.startsWith("images/")) continue;
    const imagePath = path.join(
      imagesDir,
      restaurant.image_url.slice("images/".length),
    );
    assert.ok(existsSync(imagePath), `missing image for ${restaurant.id}`);
  }
}

// Real data plus one routine-style restaurant with an external image.
function makeAugmentedData() {
  const data = JSON.parse(readFileSync(dataPath, "utf8"));
  data.restaurants.push(
    makeRestaurant({
      id: "routine-added-restaurant",
      image_url: "https://example.com/photo.jpg",
      discord_message_ids: ["12345678901234567"],
    }),
  );
  data.processed_message_count += 1;
  return data;
}

test("should keep every migrated legacy item when new items are added", () => {
  assertLegacyItemsPresent(JSON.parse(readFileSync(dataPath, "utf8")));
});

test("should reference an existing image file when image_url is a local path", () => {
  assertLocalImagesExist(JSON.parse(readFileSync(dataPath, "utf8")));
});

test("should pass the data checks when a restaurant with an external image is appended", () => {
  const data = makeAugmentedData();
  assert.deepEqual(validateData(data), []);
  assertLegacyItemsPresent(data);
  assertLocalImagesExist(data);
});
