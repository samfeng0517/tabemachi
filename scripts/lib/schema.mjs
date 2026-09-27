// Shared schema constants and validation helpers for the 食候 (tabemachi) data file.
// Used by both scripts/validate.mjs (CLI) and the frontend.

export const COLORS = ["clay", "indigo", "matcha", "ocean", "plum", "saffron"];

export const MEALS = ["午餐", "晚餐", "宵夜", "全時段"];

// Extendable list of known countries. The validator accepts any non-empty
// string for `country`; this list is provided for callers (e.g. the
// frontend) that want a canonical set of known values.
export const COUNTRIES = ["台灣", "日本", "越南"];

const ID_PATTERN = /^[a-z0-9-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// 1-4 dollar signs OR 1-3 yen signs; mixing currency symbols is not allowed.
const PRICE_PATTERN = /^(\${1,4}|¥{1,3})$/;
const MESSAGE_ID_PATTERN = /^\d{17,20}$/;
const TRACKING_PARAM_PATTERN = /^utm_/i;
const TRACKING_PARAM_NAMES = new Set(["fbclid", "igsh", "igshid"]);
// Discord links (message permalinks, attachment CDN) expose private channel
// content or expire, so no URL field may point at them. Subdomains such as
// cdn.discordapp.com and media.discordapp.net are covered by suffix match.
const DISCORD_DOMAINS = ["discord.com", "discordapp.com", "discordapp.net"];
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Strips tracking query params (utm_*, fbclid, igsh, igshid) from a URL,
 * keeping all other params and the hash intact. Returns the input unchanged
 * if it cannot be parsed as a URL (e.g. a relative path or empty string).
 */
export function cleanUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const keysToDelete = [];
  for (const key of parsed.searchParams.keys()) {
    if (TRACKING_PARAM_PATTERN.test(key) || TRACKING_PARAM_NAMES.has(key)) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    parsed.searchParams.delete(key);
  }

  return parsed.toString();
}

function isHttpsUrl(value) {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isDiscordUrl(value) {
  let hostname;
  try {
    hostname = new URL(value).hostname.toLowerCase();
  } catch {
    return false;
  }
  return DISCORD_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

function rejectDiscordUrl(value, field, label, errors) {
  if (isDiscordUrl(value)) {
    errors.push(
      `${label}: "${field}" must not point to discord (got "${value}")`,
    );
  }
}

function requireString(obj, field, label, errors) {
  if (typeof obj[field] !== "string") {
    errors.push(`${label}: "${field}" must be a string`);
  }
}

function requireBoolean(obj, field, label, errors) {
  if (typeof obj[field] !== "boolean") {
    errors.push(`${label}: "${field}" must be a boolean`);
  }
}

function requireNonEmptyString(obj, field, label, errors) {
  if (typeof obj[field] !== "string" || obj[field] === "") {
    errors.push(`${label}: "${field}" must be a non-empty string`);
  }
}

function validateId(id, label, errors, idCounts) {
  if (typeof id !== "string") {
    errors.push(`${label}: "id" must be a string`);
    return;
  }
  if (!ID_PATTERN.test(id)) {
    errors.push(`${label}: id "${id}" must match ${ID_PATTERN}`);
  }
  idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
}

function validatePrice(price, label, errors) {
  if (typeof price !== "string" || !PRICE_PATTERN.test(price)) {
    errors.push(`${label}: price "${price}" must match ${PRICE_PATTERN}`);
  }
}

function validateEnum(value, allowed, field, label, errors) {
  if (!allowed.includes(value)) {
    errors.push(
      `${label}: "${field}" value "${value}" is not one of [${allowed.join(", ")}]`,
    );
  }
}

function validateDate(date, label, errors) {
  if (typeof date !== "string" || !DATE_PATTERN.test(date)) {
    errors.push(`${label}: date "${date}" must match YYYY-MM-DD`);
    return;
  }
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isValidCalendarDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
  if (!isValidCalendarDate) {
    errors.push(`${label}: date "${date}" is not a valid calendar date`);
    return;
  }
  // Allow one day of slack so a Taipei-local date (UTC+8) is never rejected.
  const latestAllowed = new Date(Date.now() + DAY_MS)
    .toISOString()
    .slice(0, 10);
  if (date > latestAllowed) {
    errors.push(
      `${label}: date "${date}" must not be later than ${latestAllowed} (today + 1 day, UTC)`,
    );
  }
}

function validateHttpsUrl(value, field, label, errors) {
  if (!isHttpsUrl(value)) {
    errors.push(`${label}: "${field}" must be an https URL (got "${value}")`);
  }
  rejectDiscordUrl(value, field, label, errors);
}

function validateHttpsOrEmptyUrl(value, field, label, errors) {
  if (value === "") return;
  rejectDiscordUrl(value, field, label, errors);
  if (!isHttpsUrl(value)) {
    errors.push(
      `${label}: "${field}" must be an https URL or an empty string (got "${value}")`,
    );
  }
}

function validateImageUrl(value, id, label, errors) {
  if (value === "") return;
  rejectDiscordUrl(value, "image_url", label, errors);
  if (isHttpsUrl(value)) return;
  if (typeof id === "string" && value === `images/${id}.webp`) return;
  errors.push(
    `${label}: "image_url" must be an https URL, "images/<id>.webp", or an empty string (got "${value}")`,
  );
}

function validateMessageIds(value, label, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${label}: "discord_message_ids" must be an array`);
    return;
  }
  const seen = new Set();
  for (const id of value) {
    if (typeof id !== "string" || !MESSAGE_ID_PATTERN.test(id)) {
      errors.push(
        `${label}: discord_message_ids contains an invalid id "${id}"`,
      );
      continue;
    }
    if (seen.has(id)) {
      errors.push(
        `${label}: discord_message_ids contains duplicate id "${id}"`,
      );
    }
    seen.add(id);
  }
}

function validateRestaurant(restaurant, index, errors, idCounts) {
  if (typeof restaurant !== "object" || restaurant === null) {
    errors.push(`restaurant[${index}]: must be an object`);
    return;
  }
  const label = `restaurant[${index}]${typeof restaurant.id === "string" ? ` (${restaurant.id})` : ""}`;

  validateId(restaurant.id, label, errors, idCounts);
  requireNonEmptyString(restaurant, "name", label, errors);
  requireNonEmptyString(restaurant, "country", label, errors);
  requireNonEmptyString(restaurant, "area", label, errors);
  requireString(restaurant, "cuisine", label, errors);
  validatePrice(restaurant.price, label, errors);
  validateEnum(restaurant.meal, MEALS, "meal", label, errors);
  requireString(restaurant, "author", label, errors);
  validateDate(restaurant.date, label, errors);
  requireString(restaurant, "location", label, errors);
  requireString(restaurant, "note", label, errors);
  requireBoolean(restaurant, "verified", label, errors);
  validateHttpsUrl(restaurant.source, "source", label, errors);
  validateHttpsUrl(restaurant.map_url, "map_url", label, errors);
  validateImageUrl(restaurant.image_url, restaurant.id, label, errors);
  validateHttpsOrEmptyUrl(
    restaurant.image_credit_url,
    "image_credit_url",
    label,
    errors,
  );
  validateEnum(restaurant.color, COLORS, "color", label, errors);
  validateMessageIds(restaurant.discord_message_ids, label, errors);
}

function validateGuide(guide, index, errors, idCounts) {
  if (typeof guide !== "object" || guide === null) {
    errors.push(`guide[${index}]: must be an object`);
    return;
  }
  const label = `guide[${index}]${typeof guide.id === "string" ? ` (${guide.id})` : ""}`;

  validateId(guide.id, label, errors, idCounts);
  requireNonEmptyString(guide, "title", label, errors);
  requireNonEmptyString(guide, "area", label, errors);
  requireString(guide, "tag", label, errors);
  validateHttpsOrEmptyUrl(guide.source, "source", label, errors);
  requireString(guide, "note", label, errors);
  validateMessageIds(guide.discord_message_ids, label, errors);
}

/**
 * Validates the top-level tabemachi data shape (`{ processed_message_count,
 * restaurants, guides }`). Returns an array of human-readable error strings;
 * an empty array means the data is valid.
 */
export function validateData(data) {
  const errors = [];

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    errors.push("data must be an object");
    return errors;
  }

  if (
    !Number.isInteger(data.processed_message_count) ||
    data.processed_message_count < 0
  ) {
    errors.push('"processed_message_count" must be a non-negative integer');
  }

  const restaurants = Array.isArray(data.restaurants) ? data.restaurants : null;
  if (restaurants === null) {
    errors.push('"restaurants" must be an array');
  }

  const guides = Array.isArray(data.guides) ? data.guides : null;
  if (guides === null) {
    errors.push('"guides" must be an array');
  }

  const idCounts = new Map();
  (restaurants ?? []).forEach((restaurant, index) =>
    validateRestaurant(restaurant, index, errors, idCounts),
  );
  (guides ?? []).forEach((guide, index) =>
    validateGuide(guide, index, errors, idCounts),
  );

  for (const [id, count] of idCounts) {
    if (count > 1) {
      errors.push(
        `duplicate id "${id}" appears ${count} times across restaurants and guides`,
      );
    }
  }

  return errors;
}
