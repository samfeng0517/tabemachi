import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterRestaurants,
  facetOptions,
  sortRestaurants,
  cuisineGroup,
  computeStats,
  safeHref,
  formatMonthDay,
  isPending,
  parseFavorites,
} from "../assets/logic.js";

// Minimal restaurant fixture; only the fields logic.js reads.
function r(overrides = {}) {
  return {
    id: "x",
    name: "店",
    country: "台灣",
    area: "台北・大安",
    cuisine: "拉麵",
    price: "$$",
    meal: "晚餐",
    author: "甲",
    date: "2026-08-01",
    note: "",
    verified: true,
    ...overrides,
  };
}

const EMPTY = {
  country: "",
  area: "",
  cuisineGroup: "",
  cuisine: "",
  meal: "",
  query: "",
  favoritesOnly: false,
  favorites: new Set(),
};

const LIST = [
  r({ id: "a", country: "日本", area: "東京・新宿", cuisine: "拉麵" }),
  r({ id: "b", country: "日本", area: "大阪・新世界", cuisine: "串炸" }),
  r({ id: "c", country: "台灣", area: "台北・大安", cuisine: "拉麵" }),
  r({ id: "d", country: "台灣", area: "台北・信義", cuisine: "美式漢堡" }),
  r({
    id: "e",
    country: "越南",
    area: "越南・胡志明市",
    cuisine: "海鮮・螺貝料理",
  }),
];

const ids = (list) => list.map((item) => item.id);
const values = (options) => options.map((option) => option.value);

test("filterRestaurants should return only Japan restaurants when country is 日本", () => {
  const result = filterRestaurants(LIST, { ...EMPTY, country: "日本" });
  assert.deepEqual(ids(result), ["a", "b"]);
});

test("filterRestaurants should match name area cuisine and note case-insensitively when query is set", () => {
  const list = [
    r({ id: "a", name: "AFURI" }),
    r({ id: "b", note: "柚子鹽湯頭" }),
    r({ id: "c", area: "東京・新宿" }),
  ];
  assert.deepEqual(ids(filterRestaurants(list, { ...EMPTY, query: "afuri" })), [
    "a",
  ]);
  assert.deepEqual(
    ids(filterRestaurants(list, { ...EMPTY, query: " 柚子 " })),
    ["b"],
  );
  assert.deepEqual(ids(filterRestaurants(list, { ...EMPTY, query: "新宿" })), [
    "c",
  ]);
});

test("filterRestaurants should keep only favorites when favoritesOnly is true", () => {
  const filters = {
    ...EMPTY,
    favoritesOnly: true,
    favorites: new Set(["c", "e"]),
  };
  assert.deepEqual(ids(filterRestaurants(LIST, filters)), ["c", "e"]);
});

test("filterRestaurants should include 全時段 restaurants when meal is 午餐", () => {
  const list = [
    r({ id: "a", meal: "午餐" }),
    r({ id: "b", meal: "全時段" }),
    r({ id: "c", meal: "晚餐" }),
  ];
  assert.deepEqual(ids(filterRestaurants(list, { ...EMPTY, meal: "午餐" })), [
    "a",
    "b",
  ]);
});

test("filterRestaurants should match the cuisine group when cuisineGroup is set", () => {
  const result = filterRestaurants(LIST, {
    ...EMPTY,
    cuisineGroup: "拉麵・麵食",
  });
  assert.deepEqual(ids(result), ["a", "c"]);
});

test("facetOptions should exclude areas with no results when a cuisine filter is active", () => {
  const options = facetOptions(LIST, { ...EMPTY, cuisine: "拉麵" }, "area");
  assert.deepEqual(values(options).sort(), ["台北・大安", "東京・新宿"].sort());
});

test("facetOptions should include other areas with results when area filter is already set to one area", () => {
  const options = facetOptions(
    LIST,
    { ...EMPTY, country: "日本", area: "東京・新宿" },
    "area",
  );
  assert.deepEqual(
    values(options).sort(),
    ["大阪・新世界", "東京・新宿"].sort(),
  );
});

test("facetOptions should report result counts when options are listed", () => {
  const options = facetOptions(LIST, EMPTY, "country");
  assert.deepEqual(options, [
    { value: "台灣", count: 2 },
    { value: "日本", count: 2 },
    { value: "越南", count: 1 },
  ]);
});

test("facetOptions should list meals in canonical order when key is meal", () => {
  const list = [r({ id: "a", meal: "宵夜" }), r({ id: "b", meal: "午餐" })];
  assert.deepEqual(values(facetOptions(list, EMPTY, "meal")), ["午餐", "宵夜"]);
});

test("sortRestaurants should order by fewer price symbols when mode is price", () => {
  const list = [
    r({ id: "a", price: "$$$" }),
    r({ id: "b", price: "¥" }),
    r({ id: "c", price: "$$" }),
  ];
  assert.deepEqual(ids(sortRestaurants(list, "price")), ["b", "c", "a"]);
});

test("sortRestaurants should order names by zh-Hant collation when mode is name", () => {
  const list = [
    r({ id: "a", name: "鼎王" }),
    r({ id: "b", name: "一蘭" }),
    r({ id: "c", name: "八田" }),
  ];
  const expected = [...list].sort((x, y) =>
    x.name.localeCompare(y.name, "zh-Hant"),
  );
  assert.deepEqual(ids(sortRestaurants(list, "name")), ids(expected));
});

test("sortRestaurants should order by date desc then id when mode is newest", () => {
  const list = [
    r({ id: "b", date: "2026-08-01" }),
    r({ id: "c", date: "2026-09-01" }),
    r({ id: "a", date: "2026-08-01" }),
  ];
  assert.deepEqual(ids(sortRestaurants(list, "newest")), ["c", "a", "b"]);
});

test("sortRestaurants should not mutate the input when sorting", () => {
  const list = [r({ id: "b" }), r({ id: "a" })];
  sortRestaurants(list, "newest");
  assert.deepEqual(ids(list), ["b", "a"]);
});

test("cuisineGroup should return 其他 when cuisine is unknown", () => {
  assert.equal(cuisineGroup("分子料理"), "其他");
  assert.equal(cuisineGroup(""), "其他");
});

test("cuisineGroup should map known cuisines to their group when cuisine matches a keyword", () => {
  assert.equal(cuisineGroup("柚子鹽拉麵"), "拉麵・麵食");
  assert.equal(cuisineGroup("燒肉・火鍋吃到飽"), "鍋物・燒肉");
  assert.equal(cuisineGroup("壽司・海鮮丼"), "日式");
  assert.equal(cuisineGroup("生魚片・海鮮"), "海鮮");
  assert.equal(cuisineGroup("美式煙燻 BBQ"), "西式・美式");
  assert.equal(cuisineGroup("乾麵・小吃"), "台灣小吃");
  assert.equal(cuisineGroup("北印度料理"), "亞洲其他");
});

test("computeStats should count distinct city prefixes when areas share a city", () => {
  const data = {
    processed_message_count: 47,
    restaurants: [
      r({ id: "a", area: "台北・大安", author: "甲" }),
      r({ id: "b", area: "台北・信義", author: "乙" }),
      r({ id: "c", area: "東京・新宿", author: "甲" }),
    ],
  };
  assert.deepEqual(computeStats(data), {
    messages: 47,
    restaurants: 3,
    cities: 2,
    recommenders: 2,
  });
});

test("safeHref should return null when url uses javascript scheme", () => {
  assert.equal(safeHref("javascript:alert(1)"), null);
});

test("safeHref should return the url when it is a relative images path", () => {
  assert.equal(safeHref("images/afuri.webp"), "images/afuri.webp");
});

test("safeHref should return null when url is http empty or escapes the images folder", () => {
  assert.equal(safeHref("http://example.com"), null);
  assert.equal(safeHref(""), null);
  assert.equal(safeHref(undefined), null);
  assert.equal(safeHref("images/../secret"), null);
  assert.equal(safeHref("https://example.com/a"), "https://example.com/a");
});

test("formatMonthDay should drop leading zeros when date is ISO", () => {
  assert.equal(formatMonthDay("2026-08-09"), "8 月 9 日");
});

test("isPending should return true when restaurant is unverified or branch is undecided", () => {
  assert.equal(isPending(r({ verified: false })), true);
  assert.equal(isPending(r({ area: "台北・分店待選" })), true);
  assert.equal(isPending(r()), false);
});

test("parseFavorites should return an empty set when stored value is malformed", () => {
  assert.deepEqual(parseFavorites("not json"), new Set());
  assert.deepEqual(parseFavorites('{"a":1}'), new Set());
  assert.deepEqual(parseFavorites(null), new Set());
  assert.deepEqual(parseFavorites('["a", 3, "b"]'), new Set(["a", "b"]));
});
