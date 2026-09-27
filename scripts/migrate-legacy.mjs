#!/usr/bin/env node
// One-off migration script: fetches the legacy ChatGPT-hosted site's JS bundle,
// extracts its embedded restaurant/guide/credit-override data, converts it to
// the tabemachi data shape, writes data/restaurants.json, and downloads the
// restaurant photos into images/<id>.webp.
//
// This script is kept in the repo for audit purposes but is NOT run by CI;
// the legacy site may disappear at any time, and the output is committed.

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { cleanUrl } from "./lib/schema.mjs";

const LEGACY_BUNDLE_URL =
  "https://discord-channel-organizer.samfeng17.chatgpt.site/assets/page-CkXQyLSM.js";
const LEGACY_IMAGE_BASE_URL =
  "https://discord-channel-organizer.samfeng17.chatgpt.site/restaurants";
const PROCESSED_MESSAGE_COUNT = 47;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const DATA_PATH = path.join(REPO_ROOT, "data", "restaurants.json");
const IMAGES_DIR = path.join(REPO_ROOT, "images");

// area prefix -> country. Matches the legacy site's implicit grouping.
const COUNTRY_BY_AREA_PREFIX = {
  台北: "台灣",
  新北: "台灣",
  基隆: "台灣",
  台灣: "台灣",
  大阪: "日本",
  東京: "日本",
  札幌: "日本",
  沖繩: "日本",
  福岡: "日本",
  日本: "日本",
  越南: "越南",
};

// Legacy guide titles have no stable id; slugs are hand-picked here and must
// stay unique (checked by the validator against restaurant ids too).
const GUIDE_ID_BY_TITLE = {
  台灣約會餐廳等級表: "taiwan-dating-tier-list",
  "SOGO 台北大巨蛋美食情報": "sogo-taipei-dome-food-guide",
  東京旅行多店回顧: "tokyo-trip-multi-shop-review",
  胡志明市吃什麼: "ho-chi-minh-city-food-guide",
  "3 則名稱待確認的推薦": "three-unconfirmed-recommendations",
};

/**
 * Extracts a balanced `[...]` or `{...}` substring starting at `s[startIdx]`,
 * respecting backtick/single/double quoted strings (with backslash escapes)
 * so that brackets inside string literals don't throw off the count.
 */
function extractBalanced(s, startIdx) {
  const open = s[startIdx];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = null;
  for (let i = startIdx; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "`" || ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return s.slice(startIdx, i + 1);
    }
  }
  throw new Error(
    `Unbalanced ${open}...${close} starting at index ${startIdx}`,
  );
}

/** Finds `marker` in `s` and extracts the balanced expression that follows it. */
function extractAssignment(s, marker) {
  const idx = s.indexOf(marker);
  if (idx === -1) throw new Error(`Marker not found in bundle: ${marker}`);
  const bracketIdx = idx + marker.length - 1;
  return extractBalanced(s, bracketIdx);
}

/** Evaluates a JS array/object literal source string in a global-free vm sandbox. */
function evalLiteral(source) {
  const context = vm.createContext({});
  return vm.runInContext(`(${source})`, context);
}

/** Parses the legacy bundle text into { restaurants, guides, credits }. */
function parseLegacyBundle(bundleText) {
  const restaurantsSrc = extractAssignment(bundleText, "a=[");
  const guidesSrc = extractAssignment(bundleText, "],o=[");
  const creditsSrc = extractAssignment(bundleText, "],c={");

  return {
    restaurants: evalLiteral(restaurantsSrc),
    guides: evalLiteral(guidesSrc),
    credits: evalLiteral(creditsSrc),
  };
}

/** Converts a legacy `M 月 D 日` date to an ISO `YYYY-MM-DD` date (year 2026). */
function convertDate(legacyDate) {
  const match = legacyDate.match(/^(\d{1,2}) 月 (\d{1,2}) 日$/);
  if (!match) throw new Error(`Cannot parse legacy date: "${legacyDate}"`);
  const [, month, day] = match;
  return `2026-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** Derives the country from an area string like "台北・南港" via its prefix. */
function deriveCountry(area) {
  const prefix = area.split("・")[0];
  const country = COUNTRY_BY_AREA_PREFIX[prefix];
  if (!country) throw new Error(`Cannot derive country from area: "${area}"`);
  return country;
}

/** Builds the Google Maps search URL the legacy site used for a location string. */
function buildMapUrl(location) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

function convertRestaurant(legacy, credits) {
  return {
    id: legacy.id,
    name: legacy.name,
    country: deriveCountry(legacy.area),
    area: legacy.area,
    cuisine: legacy.cuisine,
    price: legacy.price,
    meal: legacy.meal,
    author: legacy.author,
    date: convertDate(legacy.date),
    location: legacy.location,
    note: legacy.note,
    verified: legacy.verified ?? false,
    source: cleanUrl(legacy.source),
    map_url: cleanUrl(buildMapUrl(legacy.location)),
    image_url: cleanUrl(`images/${legacy.id}.webp`),
    image_credit_url: cleanUrl(credits[legacy.id] ?? legacy.source),
    color: legacy.color,
    discord_message_ids: [],
  };
}

function convertGuide(legacy) {
  const id = GUIDE_ID_BY_TITLE[legacy.title];
  if (!id) throw new Error(`No slug mapped for guide title: "${legacy.title}"`);
  return {
    id,
    title: legacy.title,
    area: legacy.area,
    tag: legacy.tag,
    source: cleanUrl(legacy.source ?? ""),
    note: legacy.note,
    discord_message_ids: [],
  };
}

async function downloadImage(id) {
  const url = `${LEGACY_IMAGE_BASE_URL}/${id}.webp`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download image for "${id}": HTTP ${response.status} (${url})`,
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(path.join(IMAGES_DIR, `${id}.webp`), buffer);
  return buffer.length;
}

async function main() {
  console.log(`Fetching legacy bundle: ${LEGACY_BUNDLE_URL}`);
  const bundleResponse = await fetch(LEGACY_BUNDLE_URL);
  if (!bundleResponse.ok) {
    throw new Error(
      `Failed to fetch legacy bundle: HTTP ${bundleResponse.status}`,
    );
  }
  const bundleText = await bundleResponse.text();

  const {
    restaurants: legacyRestaurants,
    guides: legacyGuides,
    credits,
  } = parseLegacyBundle(bundleText);
  console.log(
    `Parsed ${legacyRestaurants.length} restaurants, ${legacyGuides.length} guides, ${Object.keys(credits).length} credit overrides.`,
  );

  const data = {
    processed_message_count: PROCESSED_MESSAGE_COUNT,
    restaurants: legacyRestaurants.map((r) => convertRestaurant(r, credits)),
    guides: legacyGuides.map(convertGuide),
  };

  await mkdir(path.dirname(DATA_PATH), { recursive: true });
  await writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Wrote ${DATA_PATH}`);

  await mkdir(IMAGES_DIR, { recursive: true });
  console.log(
    `Downloading ${data.restaurants.length} images to ${IMAGES_DIR}...`,
  );
  for (const restaurant of data.restaurants) {
    const size = await downloadImage(restaurant.id);
    console.log(`  ${restaurant.id}.webp (${size} bytes)`);
  }

  console.log("Migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
