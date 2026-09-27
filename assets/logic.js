// Pure data helpers for the 食候 site. No DOM access so they run in Node tests.

export const MEAL_ORDER = ["午餐", "晚餐", "宵夜", "全時段"];
export const COUNTRY_ORDER = ["台灣", "日本", "越南"];
export const ALL_DAY = "全時段";
export const OTHER_GROUP = "其他";

// Ordered keyword rules: the first group whose keyword appears in the cuisine
// wins, so more specific groups (hot pot, street food) come before broader ones.
const CUISINE_RULES = [
  ["鍋物・燒肉", ["鍋", "燒肉", "涮涮", "壽喜燒", "烤肉"]],
  ["台灣小吃", ["小吃", "滷肉", "魯肉", "便當", "雞排", "豆花", "夜市"]],
  ["拉麵・麵食", ["拉麵", "麵", "餃"]],
  [
    "日式",
    [
      "日本料理",
      "日式",
      "壽司",
      "居酒屋",
      "關東煮",
      "爐端燒",
      "串炸",
      "炸豬排",
      "丼",
      "天婦羅",
      "燒鳥",
      "割烹",
      "定食",
    ],
  ],
  ["海鮮", ["海鮮", "生魚片", "螺", "蟹", "蝦", "蚵"]],
  [
    "西式・美式",
    [
      "美式",
      "漢堡",
      "法式",
      "義",
      "牛排",
      "餐酒",
      "BBQ",
      "披薩",
      "早午餐",
      "西式",
    ],
  ],
  ["亞洲其他", ["印度", "泰", "越南", "韓", "河粉", "星馬", "港式", "粵"]],
];

export const CUISINE_GROUPS = [
  ...CUISINE_RULES.map(([group]) => group),
  OTHER_GROUP,
];

// Facet keys shown in the filter panel, in display order.
export const FACET_KEYS = [
  "country",
  "area",
  "cuisineGroup",
  "cuisine",
  "meal",
];

export function cuisineGroup(cuisine) {
  const text = typeof cuisine === "string" ? cuisine : "";
  for (const [group, keywords] of CUISINE_RULES) {
    if (keywords.some((keyword) => text.includes(keyword))) return group;
  }
  return OTHER_GROUP;
}

export function emptyFilters() {
  return {
    country: "",
    area: "",
    cuisineGroup: "",
    cuisine: "",
    meal: "",
    query: "",
    favoritesOnly: false,
    favorites: new Set(),
  };
}

function facetValue(restaurant, key) {
  return key === "cuisineGroup"
    ? cuisineGroup(restaurant.cuisine)
    : restaurant[key];
}

function matchesMeal(restaurant, meal) {
  if (!meal) return true;
  if (restaurant.meal === meal) return true;
  // All-day places also serve any specific meal.
  return meal !== ALL_DAY && restaurant.meal === ALL_DAY;
}

function matchesQuery(restaurant, query) {
  const terms = (query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    restaurant.name,
    restaurant.area,
    restaurant.cuisine,
    restaurant.note,
  ]
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function matches(restaurant, filters, skipKey) {
  for (const key of FACET_KEYS) {
    if (key === skipKey || !filters[key]) continue;
    if (key === "meal") {
      if (!matchesMeal(restaurant, filters.meal)) return false;
    } else if (facetValue(restaurant, key) !== filters[key]) {
      return false;
    }
  }
  if (filters.favoritesOnly && !filters.favorites?.has(restaurant.id))
    return false;
  return matchesQuery(restaurant, filters.query);
}

export function filterRestaurants(list, filters) {
  return list.filter((restaurant) => matches(restaurant, filters, null));
}

function compareZh(a, b) {
  return a.localeCompare(b, "zh-Hant");
}

function optionOrder(key) {
  if (key === "country") return COUNTRY_ORDER;
  if (key === "meal") return MEAL_ORDER;
  if (key === "cuisineGroup") return CUISINE_GROUPS;
  return null;
}

// Returns `{ value, count }` for every value of `key` that still yields at
// least one restaurant when all *other* active filters are applied.
export function facetOptions(list, filters, key) {
  const pool = list.filter((restaurant) => matches(restaurant, filters, key));
  const counts = new Map();
  if (key === "meal") {
    // A meal option counts every restaurant it would actually show.
    for (const meal of MEAL_ORDER) {
      const count = pool.filter((restaurant) =>
        matchesMeal(restaurant, meal),
      ).length;
      if (count > 0) counts.set(meal, count);
    }
  } else {
    for (const restaurant of pool) {
      const value = facetValue(restaurant, key);
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  const options = [...counts].map(([value, count]) => ({ value, count }));
  const order = optionOrder(key);
  if (order) {
    const rank = (value) => {
      const index = order.indexOf(value);
      return index === -1 ? order.length : index;
    };
    return options.sort(
      (a, b) => rank(a.value) - rank(b.value) || compareZh(a.value, b.value),
    );
  }
  return options.sort(
    (a, b) => b.count - a.count || compareZh(a.value, b.value),
  );
}

function byNewest(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortRestaurants(list, mode) {
  const sorted = [...list];
  if (mode === "name") {
    return sorted.sort((a, b) => compareZh(a.name, b.name) || byNewest(a, b));
  }
  if (mode === "price") {
    return sorted.sort(
      (a, b) => [...a.price].length - [...b.price].length || byNewest(a, b),
    );
  }
  return sorted.sort(byNewest);
}

export function cityOf(area) {
  return (area ?? "").split("・")[0];
}

export function computeStats(data) {
  const restaurants = data.restaurants ?? [];
  const cities = new Set(
    restaurants.map((restaurant) => cityOf(restaurant.area)).filter(Boolean),
  );
  const recommenders = new Set(
    restaurants.map((restaurant) => restaurant.author).filter(Boolean),
  );
  return {
    messages: data.processed_message_count ?? 0,
    restaurants: restaurants.length,
    cities: cities.size,
    recommenders: recommenders.size,
  };
}

// Returns the url when it is safe to put in href/src: absolute https URLs or
// relative paths inside images/. Anything else (javascript:, http:, "") → null.
export function safeHref(url) {
  if (typeof url !== "string" || url === "") return null;
  if (/^images\/[A-Za-z0-9._-]+$/.test(url) && !url.includes("..")) return url;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function dateParts(iso) {
  const [year, month, day] = (iso ?? "").split("-").map(Number);
  return { year, month, day };
}

export function formatMonthDay(iso) {
  const { month, day } = dateParts(iso);
  return `${month} 月 ${day} 日`;
}

export function formatFullDate(iso) {
  const { year, month, day } = dateParts(iso);
  return `${year} 年 ${month} 月 ${day} 日`;
}

export function latestDate(restaurants) {
  return restaurants.reduce(
    (max, restaurant) => (restaurant.date > max ? restaurant.date : max),
    "",
  );
}

export function isPending(restaurant) {
  return !restaurant.verified || (restaurant.area ?? "").includes("分店待選");
}

export function parseFavorites(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id) => typeof id === "string"));
  } catch {
    return new Set();
  }
}
