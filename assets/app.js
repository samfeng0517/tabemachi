// DOM layer for the 食候 site. All data-derived text goes through textContent
// or attributes; innerHTML is never used.
import {
  CUISINE_GROUPS,
  FACET_KEYS,
  computeStats,
  cuisineGroup,
  emptyFilters,
  facetOptions,
  filterRestaurants,
  formatFullDate,
  formatMonthDay,
  isPending,
  latestDate,
  parseFavorites,
  safeHref,
  sortRestaurants,
} from "./logic.js";

const DATA_URL = "data/restaurants.json";
const FAVORITES_KEY = "tabemachi:favorites";
const LOAD_ERROR = "資料載入失敗，請稍後重新整理";
const SVG_NS = "http://www.w3.org/2000/svg";
const MOBILE_QUERY = window.matchMedia("(max-width: 640px)");

const $ = (selector) => document.querySelector(selector);

const els = {
  query: $("#query"),
  sort: $("#sort"),
  filterToggle: $("#filter-toggle"),
  filterCount: $("#filter-count"),
  filters: $("#filters"),
  scrim: $("#filters-scrim"),
  clear: $("#clear-filters"),
  done: $("#filters-done"),
  favoritesOnly: $("#favorites-only"),
  area: $("#area"),
  cuisine: $("#cuisine"),
  list: $("#restaurant-list"),
  summary: $("#result-summary"),
  empty: $("#empty-state"),
  emptyClear: $("#empty-clear"),
  guides: $("#guide-list"),
  lastUpdated: $("#last-updated"),
  viewButtons: document.querySelectorAll("[data-view]"),
};

const state = {
  restaurants: [],
  filters: emptyFilters(),
  sort: "newest",
  cards: new Map(),
};

// ---------- storage (every access guarded: private mode / disabled storage) ----------

function loadFavorites() {
  try {
    return parseFavorites(window.localStorage.getItem(FAVORITES_KEY));
  } catch {
    return new Set();
  }
}

function saveFavorites(favorites) {
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  } catch {
    // Storage unavailable: favorites still work for this page view.
  }
}

// ---------- small DOM helpers ----------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgIcon(className, pathData) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", className);
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", pathData);
  svg.append(path);
  return svg;
}

const HEART_PATH =
  "M12 20.5s-7.5-4.4-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.7-7.5 10.1-7.5 10.1Z";

function externalLink(label, url, extraClass = "") {
  const href = safeHref(url);
  if (!href) return null;
  const link = el("a", `card-link ${extraClass}`.trim(), `${label} ↗`);
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

// ---------- restaurant cards ----------

function buildMedia(restaurant) {
  const media = el("div", `card-media tone-${restaurant.color}`);
  const fallback = el(
    "span",
    "media-fallback",
    restaurant.cuisine || restaurant.name,
  );
  media.append(fallback);

  const src = safeHref(restaurant.image_url);
  if (src) {
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.width = 640;
    img.height = 480;
    // Handler must be attached before src so an early failure is still caught.
    img.onerror = () => {
      img.onerror = null;
      img.hidden = true;
      media.classList.add("is-fallback");
    };
    img.src = src;
    media.append(img);
  } else {
    media.classList.add("is-fallback");
  }

  if (isPending(restaurant))
    media.append(el("span", "badge-pending", "待確認"));
  media.append(el("span", "price-tag", restaurant.price));
  return media;
}

function buildFavoriteButton(restaurant) {
  const button = el("button", "fav");
  button.type = "button";
  button.setAttribute("aria-label", `收藏 ${restaurant.name}`);
  button.append(svgIcon("fav-icon", HEART_PATH));
  button.addEventListener("click", () => toggleFavorite(restaurant.id));
  return button;
}

function buildCard(restaurant) {
  const item = el("li", "card");
  if (isPending(restaurant)) item.classList.add("is-pending");

  const article = el("article", "card-inner");
  const body = el("div", "card-body");

  body.append(
    el("p", "card-meta", `${restaurant.area}・${restaurant.cuisine}`),
  );
  body.append(el("h3", "card-title", restaurant.name));
  if (restaurant.note) body.append(el("p", "card-note", restaurant.note));

  const facts = el("p", "card-facts");
  facts.append(
    el("span", "fact", restaurant.meal),
    el("span", "fact fact-price", restaurant.price),
  );
  body.append(facts);

  const byline = el("p", "card-by");
  byline.append(`由 ${restaurant.author || "朋友"} 推薦・`);
  const time = el("time", "", formatMonthDay(restaurant.date));
  time.dateTime = restaurant.date;
  byline.append(time);
  body.append(byline);

  const links = [
    externalLink("地圖", restaurant.map_url),
    externalLink("原始推薦", restaurant.source),
    externalLink("圖片來源", restaurant.image_credit_url, "card-link-credit"),
  ].filter(Boolean);
  if (links.length) {
    const linkRow = el("div", "card-links");
    linkRow.append(...links);
    body.append(linkRow);
  }

  const favorite = buildFavoriteButton(restaurant);
  article.append(buildMedia(restaurant), favorite, body);
  item.append(article);
  return { item, favorite };
}

function syncFavoriteButton(id) {
  const card = state.cards.get(id);
  if (!card) return;
  const pressed = state.filters.favorites.has(id);
  card.favorite.setAttribute("aria-pressed", String(pressed));
}

function toggleFavorite(id) {
  const { favorites } = state.filters;
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  saveFavorites(favorites);
  syncFavoriteButton(id);
  if (state.filters.favoritesOnly) render();
}

// ---------- filter controls ----------

function optionsWithSelection(key) {
  const options = facetOptions(state.restaurants, state.filters, key);
  const selected = state.filters[key];
  // Keep the active choice visible even when the query hides all its results.
  if (selected && !options.some((option) => option.value === selected)) {
    options.unshift({ value: selected, count: 0 });
  }
  return options;
}

function chip(label, count, pressed, onSelect) {
  const button = el("button", "chip");
  button.type = "button";
  button.setAttribute("aria-pressed", String(pressed));
  button.append(el("span", "chip-label", label));
  if (count !== null) button.append(el("span", "chip-count", String(count)));
  button.addEventListener("click", onSelect);
  return button;
}

function renderChips(key) {
  const container = document.querySelector(`[data-facet="${key}"]`);
  const selected = state.filters[key];
  const chips = [chip("全部", null, !selected, () => setFacet(key, ""))];
  for (const { value, count } of optionsWithSelection(key)) {
    chips.push(
      chip(value, count, value === selected, () =>
        setFacet(key, value === selected ? "" : value),
      ),
    );
  }
  container.replaceChildren(...chips);
}

function option(value, label) {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = label;
  return node;
}

function renderAreaSelect() {
  const nodes = [option("", "全部地區")];
  for (const { value, count } of optionsWithSelection("area")) {
    nodes.push(option(value, `${value}（${count}）`));
  }
  els.area.replaceChildren(...nodes);
  els.area.value = state.filters.area;
}

function renderCuisineSelect() {
  const nodes = [option("", "全部料理細項")];
  const byGroup = new Map(CUISINE_GROUPS.map((group) => [group, []]));
  for (const { value, count } of optionsWithSelection("cuisine")) {
    byGroup
      .get(cuisineGroup(value))
      .push(option(value, `${value}（${count}）`));
  }
  for (const [group, options] of byGroup) {
    if (!options.length) continue;
    const optgroup = document.createElement("optgroup");
    optgroup.label = group;
    optgroup.append(...options);
    nodes.push(optgroup);
  }
  els.cuisine.replaceChildren(...nodes);
  els.cuisine.value = state.filters.cuisine;
}

function activeFilterCount() {
  const facets = FACET_KEYS.filter((key) => state.filters[key]).length;
  return facets + (state.filters.favoritesOnly ? 1 : 0);
}

function renderFilterCount() {
  const count = activeFilterCount();
  els.filterCount.hidden = count === 0;
  els.filterCount.textContent = String(count);
  els.filterToggle.setAttribute(
    "aria-label",
    count ? `篩選，已套用 ${count} 個條件` : "篩選",
  );
}

// Drops other facet selections that no longer have results after `changedKey`
// changed, e.g. picking 日本 clears a previously chosen 台北 area.
function reconcile(changedKey) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of FACET_KEYS) {
      const value = state.filters[key];
      if (key === changedKey || !value) continue;
      const options = facetOptions(state.restaurants, state.filters, key);
      if (!options.some((entry) => entry.value === value)) {
        state.filters[key] = "";
        changed = true;
      }
    }
  }
}

function setFacet(key, value) {
  state.filters[key] = value;
  reconcile(key);
  render();
}

function clearFilters() {
  const { favorites } = state.filters;
  state.filters = { ...emptyFilters(), favorites };
  els.query.value = "";
  els.favoritesOnly.checked = false;
  render();
}

// ---------- mobile filter sheet ----------

function setSheetOpen(open) {
  els.filterToggle.setAttribute("aria-expanded", String(open));
  els.filters.toggleAttribute("data-open", open);
  els.scrim.hidden = !open;
  document.body.classList.toggle("sheet-open", open && MOBILE_QUERY.matches);
  if (open && MOBILE_QUERY.matches) {
    // Focus the panel itself so Enter cannot accidentally hit 清除.
    els.filters.focus();
  }
}

function closeSheet() {
  if (els.filterToggle.getAttribute("aria-expanded") !== "true") return;
  setSheetOpen(false);
  els.filterToggle.focus();
}

// ---------- rendering ----------

function renderList() {
  const total = state.restaurants.length;
  const visible = sortRestaurants(
    filterRestaurants(state.restaurants, state.filters),
    state.sort,
  );
  els.list.replaceChildren(
    ...visible.map((restaurant) => state.cards.get(restaurant.id).item),
  );
  els.empty.hidden = visible.length > 0;
  els.summary.textContent =
    visible.length === total
      ? `共 ${total} 間，依${els.sort.selectedOptions[0].textContent}排列`
      : `符合條件 ${visible.length} / ${total} 間`;
  els.done.textContent = `顯示 ${visible.length} 間`;
}

function render() {
  renderChips("country");
  renderChips("cuisineGroup");
  renderChips("meal");
  renderAreaSelect();
  renderCuisineSelect();
  renderFilterCount();
  renderList();
}

function renderStats(stats) {
  for (const [key, value] of Object.entries(stats)) {
    const node = document.querySelector(`[data-stat="${key}"]`);
    if (node) node.textContent = String(value);
  }
}

function renderGuides(guides) {
  const items = guides.map((guide) => {
    const item = el("li", "guide");
    const head = el("div", "guide-head");
    if (guide.tag) head.append(el("span", "guide-tag", guide.tag));
    head.append(el("span", "guide-area", guide.area));
    item.append(head, el("h3", "guide-title", guide.title));
    if (guide.note) item.append(el("p", "guide-note", guide.note));
    const link = externalLink("原始連結", guide.source);
    if (link) item.append(link);
    return item;
  });
  els.guides.replaceChildren(...items);
}

function setView(view) {
  els.list.dataset.view = view;
  for (const button of els.viewButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.view === view));
  }
}

function showLoadError() {
  els.summary.textContent = "";
  els.list.replaceChildren(el("li", "load-error", LOAD_ERROR));
}

// ---------- wiring ----------

function bindEvents() {
  els.query.addEventListener("input", () => {
    state.filters.query = els.query.value;
    render();
  });
  els.sort.addEventListener("change", () => {
    state.sort = els.sort.value;
    renderList();
  });
  els.area.addEventListener("change", () => setFacet("area", els.area.value));
  els.cuisine.addEventListener("change", () =>
    setFacet("cuisine", els.cuisine.value),
  );
  els.favoritesOnly.addEventListener("change", () => {
    state.filters.favoritesOnly = els.favoritesOnly.checked;
    render();
  });
  els.clear.addEventListener("click", clearFilters);
  els.emptyClear.addEventListener("click", clearFilters);
  for (const button of els.viewButtons) {
    button.addEventListener("click", () => setView(button.dataset.view));
  }

  els.filterToggle.addEventListener("click", () => {
    setSheetOpen(els.filterToggle.getAttribute("aria-expanded") !== "true");
  });
  els.done.addEventListener("click", closeSheet);
  els.scrim.addEventListener("click", closeSheet);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSheet();
  });
  MOBILE_QUERY.addEventListener("change", () => setSheetOpen(false));
}

async function init() {
  bindEvents();
  state.filters.favorites = loadFavorites();

  let data;
  try {
    const response = await fetch(DATA_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
    if (!Array.isArray(data?.restaurants)) throw new Error("Malformed data");
  } catch {
    showLoadError();
    return;
  }

  state.restaurants = data.restaurants;
  for (const restaurant of state.restaurants) {
    state.cards.set(restaurant.id, buildCard(restaurant));
    syncFavoriteButton(restaurant.id);
  }

  renderStats(computeStats(data));
  const updated = latestDate(state.restaurants);
  if (updated) {
    els.lastUpdated.textContent = formatFullDate(updated);
    els.lastUpdated.dateTime = updated;
  }
  renderGuides(Array.isArray(data.guides) ? data.guides : []);
  render();
}

init();
