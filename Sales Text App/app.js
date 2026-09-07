const elements = {
  search: document.querySelector("#searchInput"),
  clearSearch: document.querySelector("#clearSearch"),
  typeFilter: document.querySelector("#typeFilter"),
  availabilityFilter: document.querySelector("#availabilityFilter"),
  resetFilters: document.querySelector("#resetFilters"),
  resultCount: document.querySelector("#resultCount"),
  resultList: document.querySelector("#resultList"),
  emptyResults: document.querySelector("#emptyResults"),
  loadMore: document.querySelector("#loadMore"),
  sourceLabel: document.querySelector("#sourceLabel"),
  loadingState: document.querySelector("#loadingState"),
  detailEmpty: document.querySelector("#detailEmpty"),
  detailContent: document.querySelector("#detailContent"),
  breadcrumb: document.querySelector("#breadcrumb"),
  itemId: document.querySelector("#itemId"),
  itemType: document.querySelector("#itemType"),
  itemName: document.querySelector("#itemName"),
  quickMeta: document.querySelector("#quickMeta"),
  shortTab: document.querySelector("#shortTab"),
  longTab: document.querySelector("#longTab"),
  textLength: document.querySelector("#textLength"),
  salesText: document.querySelector("#salesText"),
  copyCurrent: document.querySelector("#copyCurrent"),
  copyCurrentTop: document.querySelector("#copyCurrentTop"),
  salesFlag: document.querySelector("#salesFlag"),
  detailsGrid: document.querySelector("#detailsGrid"),
  toast: document.querySelector("#toast"),
  openComposer: document.querySelector("#openComposer"),
  closeComposer: document.querySelector("#closeComposer"),
  composerBackdrop: document.querySelector("#composerBackdrop"),
  composerPanel: document.querySelector("#composerPanel"),
  historyList: document.querySelector("#historyList"),
  historyEmpty: document.querySelector("#historyEmpty"),
  historyCount: document.querySelector("#historyCount"),
  composerForm: document.querySelector("#composerForm"),
  localStatus: document.querySelector("#localStatus"),
  generateDraft: document.querySelector("#generateDraft"),
  generateLabel: document.querySelector(".generate-label"),
  generateLoading: document.querySelector(".generate-loading"),
  draftItemName: document.querySelector("#draftItemName"),
  draftKeywords: document.querySelector("#draftKeywords"),
  draftFacts: document.querySelector("#draftFacts"),
  sourceFactStatus: document.querySelector("#sourceFactStatus"),
  draftAudience: document.querySelector("#draftAudience"),
  draftEmpty: document.querySelector("#draftEmpty"),
  draftResult: document.querySelector("#draftResult"),
  draftError: document.querySelector("#draftError"),
  draftShortTab: document.querySelector("#draftShortTab"),
  draftLongTab: document.querySelector("#draftLongTab"),
  draftEditor: document.querySelector("#draftEditor"),
  draftCount: document.querySelector("#draftCount"),
  copyDraft: document.querySelector("#copyDraft"),
  draftModel: document.querySelector("#draftModel"),
  draftTrace: document.querySelector("#draftTrace"),
  draftReferences: document.querySelector("#draftReferences"),
  technicalSourceSummary: document.querySelector("#technicalSourceSummary"),
  technicalFacts: document.querySelector("#technicalFacts"),
  factWarnings: document.querySelector("#factWarnings"),
};

const state = {
  items: [],
  filtered: [],
  selected: null,
  activeText: "short",
  visible: 50,
  query: "",
  type: "all",
  availability: "all",
  drafts: null,
  activeDraft: "short",
  technicalSource: null,
  technicalFacts: [],
  history: [],
  currentHistoryId: null,
};

const normalize = (value) => String(value ?? "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

const GUIDANCE_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it",
  "of", "on", "or", "that", "the", "this", "to", "with", "your", "new", "item", "product",
]);

const TECHNICAL_STOP_WORDS = new Set([
  ...GUIDANCE_STOP_WORDS,
  "azurion", "philips", "system", "systems", "offering", "solution", "equipment", "feature", "features",
]);

const formatNumber = new Intl.NumberFormat("en-US");
const historyDateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const HISTORY_STORAGE_KEY = "igt-sales-text-history-v1";
const HISTORY_LIMIT = 100;
const GUIDANCE_LABEL = "Product Description and Sales Text Guidelines, pages 15-29";
const displayValue = (value) => value || "—";
let toastTimer;
let searchTimer;
let historyUpdateTimer;

function catalogueSourceLabel(metadata) {
  const count = formatNumber.format(metadata?.itemCount || 0);
  const vintage = String(metadata?.source || "").match(/_([A-Za-z]+\s+\d{4})\.xlsx$/i)?.[1];
  return `${count} catalogue items${vintage ? ` · ${vintage}` : ""}`;
}

function makeSearchIndex(item) {
  return normalize([
    item.id, item.name, item.shortText, item.longText, item.magCode, item.magName,
    item.agCode, item.agName, item.itemType, item.businessCategory, item.mru,
  ].join(" \u241f "));
}

function scoreItem(item, normalizedQuery, tokens) {
  if (!tokens.every((token) => item._search.includes(token))) return -1;
  if (!normalizedQuery) return 0;

  const id = normalize(item.id);
  const name = normalize(item.name);
  const shortText = normalize(item.shortText);
  const longText = normalize(item.longText);
  const mag = normalize(`${item.magCode} ${item.magName}`);
  const ag = normalize(`${item.agCode} ${item.agName}`);

  let score = 0;
  if (id === normalizedQuery) score += 1200;
  else if (id.startsWith(normalizedQuery)) score += 780;
  else if (id.includes(normalizedQuery)) score += 520;
  if (name === normalizedQuery) score += 1000;
  else if (name.startsWith(normalizedQuery)) score += 720;
  else if (name.includes(normalizedQuery)) score += 460;
  if (shortText.includes(normalizedQuery)) score += 270;
  if (longText.includes(normalizedQuery)) score += 180;
  if (mag.includes(normalizedQuery)) score += 160;
  if (ag.includes(normalizedQuery)) score += 130;
  score += tokens.reduce((total, token) => total + (name.includes(token) ? 35 : 0) + (shortText.includes(token) ? 20 : 0), 0);
  return score;
}

function hasRequestedText(item) {
  const hasShort = Boolean(item.shortText.trim());
  const hasLong = Boolean(item.longText.trim());
  if (state.availability === "both") return hasShort && hasLong;
  if (state.availability === "short") return hasShort;
  if (state.availability === "long") return hasLong;
  return true;
}

function applySearch({ preserveSelection = true } = {}) {
  const normalizedQuery = normalize(state.query.trim());
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

  state.filtered = state.items
    .filter((item) => state.type === "all" || item.itemType === state.type)
    .filter(hasRequestedText)
    .map((item) => ({ item, score: scoreItem(item, normalizedQuery, tokens) }))
    .filter((result) => result.score >= 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .map((result) => result.item);

  state.visible = 50;
  elements.resultCount.textContent = formatNumber.format(state.filtered.length);
  elements.clearSearch.hidden = !state.query;
  elements.resetFilters.hidden = !(state.query || state.type !== "all" || state.availability !== "all");
  elements.emptyResults.hidden = state.filtered.length > 0;
  elements.resultList.hidden = state.filtered.length === 0;

  if (!preserveSelection || (state.selected && !state.filtered.includes(state.selected))) {
    state.selected = null;
    showEmptyDetail();
  }

  renderResults();
}

function getSnippet(item) {
  const query = normalize(state.query.trim());
  const candidates = [
    { label: "Long", text: item.longText },
    { label: "Short", text: item.shortText },
  ];
  const source = candidates.find(({ text }) => query && normalize(text).includes(query))
    || candidates.find(({ text }) => text.trim())
    || { label: "Text", text: "No sales text available" };
  const compact = source.text.replace(/\s+/g, " ").trim();
  const matchIndex = query ? normalize(compact).indexOf(query) : 0;
  const start = Math.max(0, matchIndex - 55);
  const excerpt = compact.slice(start, start + 170);
  return `${source.label}: ${start > 0 ? "…" : ""}${excerpt}${start + 170 < compact.length ? "…" : ""}`;
}

function renderResults() {
  const visibleItems = state.filtered.slice(0, state.visible);
  const fragment = document.createDocumentFragment();

  visibleItems.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "result-item";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(state.selected?.id === item.id));
    button.dataset.id = item.id;

    const kicker = document.createElement("div");
    kicker.className = "result-kicker";
    const id = document.createElement("span");
    id.className = "result-id";
    id.textContent = item.id || "No ID";
    const type = document.createElement("span");
    type.textContent = item.itemType.replaceAll("_", " ") || "Item";
    kicker.append(id, type);

    const title = document.createElement("h3");
    title.textContent = item.name || "Unnamed item";
    const snippet = document.createElement("p");
    snippet.className = "result-snippet";
    snippet.textContent = getSnippet(item);

    const tags = document.createElement("div");
    tags.className = "result-tags";
    const group = document.createElement("span");
    group.className = "mini-tag";
    group.textContent = item.agName || item.magName || item.businessCategory || "Uncategorised";
    tags.append(group);
    if (item.longText) {
      const textStatus = document.createElement("span");
      textStatus.className = "text-dot";
      textStatus.textContent = "Long text";
      tags.append(textStatus);
    }

    button.append(kicker, title, snippet, tags);
    button.addEventListener("click", () => selectItem(item));
    fragment.append(button);
  });

  elements.resultList.replaceChildren(fragment);
  elements.loadMore.hidden = state.visible >= state.filtered.length || state.filtered.length === 0;
  if (!elements.loadMore.hidden) {
    elements.loadMore.textContent = `Show more · ${formatNumber.format(state.filtered.length - state.visible)} remaining`;
  }
}

function selectItem(item, { updateHash = true } = {}) {
  state.selected = item;
  const query = normalize(state.query.trim());
  const longMatches = query && normalize(item.longText).includes(query);
  const shortMatches = query && normalize(item.shortText).includes(query);
  state.activeText = longMatches && !shortMatches ? "long" : item.shortText ? "short" : "long";
  renderResults();
  renderDetail();
  if (updateHash) history.replaceState(null, "", `#id=${encodeURIComponent(item.id)}`);
  if (window.innerWidth <= 900) document.querySelector(".detail-panel").scrollIntoView({ behavior: "smooth" });
}

function createBreadcrumb(item) {
  const values = [item.businessUnit, item.businessCategory, item.mru].filter(Boolean);
  const fragment = document.createDocumentFragment();
  values.forEach((value) => {
    const span = document.createElement("span");
    span.textContent = value;
    fragment.append(span);
  });
  return fragment;
}

function renderQuickMeta(item) {
  const entries = [
    ["MAG", [item.magCode, item.magName].filter(Boolean).join(" · ")],
    ["AG", [item.agCode, item.agName].filter(Boolean).join(" · ")],
    ["Owner", item.ownership],
  ].filter(([, value]) => value);
  const fragment = document.createDocumentFragment();
  entries.forEach(([label, value]) => {
    const span = document.createElement("span");
    span.className = "quick-meta-item";
    const strong = document.createElement("strong");
    strong.textContent = `${label}:`;
    span.append(strong, document.createTextNode(value));
    fragment.append(span);
  });
  elements.quickMeta.replaceChildren(fragment);
  elements.quickMeta.hidden = entries.length === 0;
}

function renderDetails(item) {
  const entries = [
    ["Business", item.business],
    ["Business unit", item.businessUnit],
    ["Business category", item.businessCategory],
    ["MRU", item.mru],
    ["MAG", [item.magCode, item.magName].filter(Boolean).join(" — ")],
    ["AG", [item.agCode, item.agName].filter(Boolean).join(" — ")],
    ["Item type", item.itemType.replaceAll("_", " ")],
    ["Ownership", item.ownership],
    ["Short text bucket", item.shortBucket],
    ["Long text bucket", item.longBucket],
  ];
  const fragment = document.createDocumentFragment();
  entries.forEach(([label, value]) => {
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = displayValue(value);
    wrapper.append(term, description);
    fragment.append(wrapper);
  });
  elements.detailsGrid.replaceChildren(fragment);
}

function renderDetail() {
  const item = state.selected;
  if (!item) return showEmptyDetail();
  elements.loadingState.hidden = true;
  elements.detailEmpty.hidden = true;
  elements.detailContent.hidden = false;
  elements.breadcrumb.replaceChildren(createBreadcrumb(item));
  elements.itemId.textContent = `ID ${item.id}`;
  elements.itemType.textContent = item.itemType.replaceAll("_", " ");
  elements.itemName.textContent = item.name || "Unnamed item";
  elements.shortTab.disabled = !item.shortText;
  elements.longTab.disabled = !item.longText;
  elements.salesFlag.textContent = item.salesTextFlag;
  renderQuickMeta(item);
  renderDetails(item);
  renderActiveText();
}

function renderActiveText() {
  if (!state.selected) return;
  const isShort = state.activeText === "short";
  const text = isShort ? state.selected.shortText : state.selected.longText;
  elements.shortTab.setAttribute("aria-selected", String(isShort));
  elements.longTab.setAttribute("aria-selected", String(!isShort));
  elements.salesText.textContent = text || `No ${isShort ? "short" : "long"} sales text is available for this item.`;
  elements.salesText.classList.toggle("is-empty", !text);
  const actualLength = text.length;
  elements.textLength.textContent = `${formatNumber.format(actualLength)} characters`;
  const label = `Copy ${isShort ? "short" : "long"} text`;
  elements.copyCurrent.setAttribute("aria-label", label);
  elements.copyCurrentTop.querySelector("span").textContent = label;
  elements.copyCurrent.disabled = !text;
  elements.copyCurrentTop.disabled = !text;
}

function showEmptyDetail() {
  elements.loadingState.hidden = true;
  elements.detailContent.hidden = true;
  elements.detailEmpty.hidden = false;
  history.replaceState(null, "", location.pathname + location.search);
}

async function copyActiveText() {
  if (!state.selected) return;
  const text = state.activeText === "short" ? state.selected.shortText : state.selected.longText;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast(`${state.activeText === "short" ? "Short" : "Long"} text copied`);
}

function showToast(message) {
  elements.toast.querySelector("span").textContent = message;
  elements.toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
}

function clearAllFilters() {
  state.query = "";
  state.type = "all";
  state.availability = "all";
  elements.search.value = "";
  elements.typeFilter.value = "all";
  elements.availabilityFilter.value = "all";
  applySearch({ preserveSelection: false });
  elements.search.focus();
}

function setComposerOpen(open) {
  elements.composerPanel.hidden = !open;
  elements.composerBackdrop.hidden = !open;
  elements.openComposer.setAttribute("aria-expanded", String(open));
  if (open) {
    setTimeout(() => elements.draftKeywords.focus(), 0);
  } else {
    elements.openComposer.focus();
  }
}

function setDraftLoading(loading) {
  elements.generateDraft.disabled = loading;
  elements.generateLabel.hidden = loading;
  elements.generateLoading.hidden = !loading;
}

function cleanGuidanceText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function splitGuidancePhrases(value, limit = 8) {
  return [...new Set(String(value || "")
    .split(/[\r\n,;|]+/)
    .map((part) => cleanGuidanceText(part).replace(/^[-*\u2022]\s*/, ""))
    .filter(Boolean))]
    .slice(0, limit);
}

function guidanceTokens(request) {
  const source = normalize([request.itemName, request.keywords, request.facts, request.audience].join(" "));
  const tokens = source.match(/[a-z0-9]+/g) || [];
  return [...new Set(tokens.filter((token) => (token.length > 1 || /^\d$/.test(token)) && !GUIDANCE_STOP_WORDS.has(token)))];
}

function scoreGuidanceReference(item, request, tokens, phrases) {
  const fields = {
    name: normalize(item.name),
    short: normalize(item.shortText),
    long: normalize(item.longText),
    taxonomy: normalize([item.magName, item.agName, item.businessCategory, item.itemType].join(" ")),
  };
  let score = 0;
  tokens.forEach((token) => {
    if (fields.name.includes(token)) score += 28;
    if (fields.short.includes(token)) score += 19;
    if (fields.long.includes(token)) score += 8;
    if (fields.taxonomy.includes(token)) score += 6;
  });
  phrases.forEach((phrase) => {
    const normalizedPhrase = normalize(phrase);
    const compactPhrase = normalizedPhrase.replace(/[^a-z0-9]/g, "");
    if (normalizedPhrase.length < 3) return;
    if (fields.name.includes(normalizedPhrase)) score += 70;
    if (fields.short.includes(normalizedPhrase)) score += 45;
    if (fields.long.includes(normalizedPhrase)) score += 25;
    if (compactPhrase.length >= 5 && fields.name.replace(/[^a-z0-9]/g, "").includes(compactPhrase)) score += 70;
  });
  if (item.shortText && item.longText) score += 3;
  if (/^details\s+configured offering\s*$/i.test(cleanGuidanceText(item.longText))) score -= 8;
  return score;
}

function findGuidanceReferences(request) {
  const tokens = guidanceTokens(request);
  const phrases = [request.itemName, ...splitGuidancePhrases(request.keywords)].filter(Boolean);
  const seen = new Set();
  return state.items
    .map((item) => ({ item, score: scoreGuidanceReference(item, request, tokens, phrases) }))
    .filter(({ item, score }) => score > 0 && (item.shortText || item.longText))
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .filter(({ item }) => {
      const signature = normalize(`${item.shortText}|${item.longText}`);
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .slice(0, 5)
    .map(({ item }) => ({
      id: item.id,
      name: item.name,
      shortText: item.shortText,
      longText: item.longText,
    }));
}

function technicalSearchValue(value) {
  const spaced = normalize(value).replace(/[^a-z0-9]+/g, " ").trim();
  return `${spaced} ${spaced.replace(/\s+/g, "")}`.trim();
}

function prepareTechnicalSource(payload) {
  state.technicalSource = payload?.metadata || null;
  state.technicalFacts = (payload?.facts || []).map((fact) => ({
    ...fact,
    _fields: {
      item: technicalSearchValue(fact.item),
      subitem: technicalSearchValue(fact.subitem),
      parameter: technicalSearchValue(fact.parameter),
      value: technicalSearchValue(fact.value),
      applicability: technicalSearchValue((fact.applicability || []).join(" ")),
    },
  }));

  if (!state.technicalSource || !state.technicalFacts.length) {
    elements.sourceFactStatus.textContent = "Azurion technical-data source unavailable; no workbook facts will be inserted.";
    return;
  }
  elements.sourceFactStatus.textContent = `${state.technicalSource.sourceFile} · ${formatNumber.format(state.technicalFacts.length)} approved technical facts available · automatic matching`;
}

function technicalFactTokens(request) {
  const source = technicalSearchValue([request.itemName, request.keywords, request.facts].join(" "));
  const tokens = source.match(/[a-z0-9]+/g) || [];
  return [...new Set(tokens.filter((token) => token.length > 1 && !TECHNICAL_STOP_WORDS.has(token)))];
}

function scoreTechnicalFact(fact, tokens, phrases) {
  const weights = { item: 14, subitem: 24, parameter: 34, value: 6, applicability: 22 };
  let score = 0;
  let matchedTokens = 0;
  tokens.forEach((token) => {
    let tokenMatched = false;
    Object.entries(weights).forEach(([field, weight]) => {
      if (fact._fields[field].includes(token)) {
        score += weight;
        tokenMatched = true;
      }
    });
    if (tokenMatched) matchedTokens += 1;
  });

  phrases.forEach((phrase) => {
    const normalizedPhrase = technicalSearchValue(phrase).split(" ").slice(0, -1).join(" ");
    if (normalizedPhrase.length < 4) return;
    const compactPhrase = normalizedPhrase.replace(/\s+/g, "");
    if (fact._fields.parameter.includes(normalizedPhrase) || fact._fields.parameter.includes(compactPhrase)) score += 130;
    if (fact._fields.subitem.includes(normalizedPhrase) || fact._fields.subitem.includes(compactPhrase)) score += 95;
    if (fact._fields.item.includes(normalizedPhrase) || fact._fields.item.includes(compactPhrase)) score += 70;
    if (fact._fields.value.includes(normalizedPhrase) || fact._fields.value.includes(compactPhrase)) score += 24;
  });

  if (!matchedTokens) return -1;
  score += Math.round((matchedTokens / Math.max(tokens.length, 1)) * 20);
  return score;
}

function findTechnicalFacts(request) {
  if (!state.technicalFacts.length) return [];
  const tokens = technicalFactTokens(request);
  if (!tokens.length) return [];
  const phrases = [request.itemName, ...splitGuidancePhrases(request.keywords, 8)].filter(Boolean);
  const knownApplicability = [...new Set(state.technicalFacts.flatMap((fact) => fact.applicability || []))];
  const requestedApplicability = knownApplicability.filter((variant) => {
    const compactVariant = technicalSearchValue(variant).split(" ").at(-1);
    return tokens.includes(compactVariant);
  });
  const seen = new Set();
  return state.technicalFacts
    .filter((fact) => !requestedApplicability.length
      || !fact.applicability?.length
      || fact.applicability.some((variant) => requestedApplicability.includes(variant)))
    .map((fact) => ({ fact, score: scoreTechnicalFact(fact, tokens, phrases) }))
    .filter(({ score }) => score >= 18)
    .sort((a, b) => b.score - a.score || a.fact.row - b.fact.row)
    .filter(({ fact }) => {
      const signature = normalize(`${fact.subitem}|${fact.parameter}`);
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .slice(0, 4)
    .map(({ fact, score }) => ({ ...fact, score, requestedApplicability }));
}

function technicalFactSentence(name, fact) {
  const parameter = lowerInitial(phraseWithoutTerminalPunctuation(normalizeGuidedPhrase(fact.parameter)));
  const subitem = lowerInitial(phraseWithoutTerminalPunctuation(normalizeGuidedPhrase(fact.subitem)));
  const value = lowerInitial(phraseWithoutTerminalPunctuation(normalizeGuidedPhrase(fact.value)));
  const applicableVariants = fact.requestedApplicability?.length ? fact.requestedApplicability : fact.applicability;
  const scope = applicableVariants?.length ? `For ${joinNaturally(applicableVariants)}, ` : "";
  if (/^present$/i.test(value)) return ensureSentence(`${scope}${name} includes ${parameter}`);
  if (/^not present$/i.test(value)) return ensureSentence(`${scope}${name} does not include ${parameter}`);
  return ensureSentence(`${scope}${name} specifications list ${parameter}${subitem ? ` for ${subitem}` : ""} as ${value}`);
}

function joinNaturally(values) {
  if (values.length < 2) return values[0] || "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function ensureSentence(value) {
  const text = cleanGuidanceText(value);
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function replaceGuidanceWord(value, source, replacement) {
  return value.replace(new RegExp(`\\b${source}\\b`, "gi"), (match) => {
    if (match === match.toUpperCase()) return replacement.toUpperCase();
    if (match[0] === match[0].toUpperCase()) return `${replacement[0].toUpperCase()}${replacement.slice(1)}`;
    return replacement;
  });
}

const PHILIPS_ACRONYM_REPLACEMENTS = [
  ["TSM", "touch screen module"],
  ["ER/CR", "examination room and control room"],
];

function expandPhilipsAcronyms(value) {
  return PHILIPS_ACRONYM_REPLACEMENTS.reduce(
    (text, [acronym, expansion]) => text.replace(new RegExp(`\\b${acronym.replace("/", "\\/")}\\b`, "g"), expansion),
    String(value || ""),
  );
}

function formatConvertedNumber(value) {
  return Number(value.toFixed(1)).toString();
}

function convertedMeasurement(value, unit) {
  const amount = Number(value);
  const normalizedUnit = unit.toLowerCase();
  const conversions = {
    mm: [amount / 25.4, "inch"],
    cm: [amount / 2.54, "inch"],
    m: [amount * 3.28084, "ft"],
    kg: [amount * 2.20462, "lb"],
    g: [amount / 28.3495, "oz"],
    inch: [amount * 2.54, "cm"],
    inches: [amount * 2.54, "cm"],
    lb: [amount / 2.20462, "kg"],
    lbs: [amount / 2.20462, "kg"],
    oz: [amount * 28.3495, "g"],
    ft: [amount / 3.28084, "m"],
  };
  const conversion = conversions[normalizedUnit];
  return conversion ? `${formatConvertedNumber(conversion[0])} ${conversion[1]}` : "";
}

function formatDualMeasurements(value) {
  let text = value.replace(
    /\b(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)\b(?!\s*\()/gi,
    (match, first, second, unit, offset, source) => {
      const after = source.slice(offset + match.length, offset + match.length + 55);
      if (/^\s*\([^)]*\b(?:inch|inches|ft)\b/i.test(after)) return match;
      const firstConversion = convertedMeasurement(Number(first), unit).split(" ");
      const secondConversion = convertedMeasurement(Number(second), unit).split(" ");
      return `${first} x ${second} ${unit} (${firstConversion[0]} x ${secondConversion[0]} ${secondConversion[1]})`;
    },
  );

  return text.replace(
    /\b(\d+(?:\.\d+)?)\s*(mm|cm|m|kg|g|inch|inches|lb|lbs|oz|ft)\b/gi,
    (match, amount, unit, offset, source) => {
      const before = source.slice(Math.max(0, offset - 45), offset);
      const after = source.slice(offset + match.length, offset + match.length + 55);
      const isInsidePair = /\([^)]*$/.test(before) && /^[^)]*\)/.test(after);
      const hasPairAfter = /^\s*\([^)]*\b(?:mm|cm|m|kg|g|inch|inches|lb|lbs|oz|ft)\b[^)]*\)/i.test(after);
      if (isInsidePair || hasPairAfter) return `${amount} ${unit}`;
      const conversion = convertedMeasurement(Number(amount), unit);
      return conversion ? `${amount} ${unit} (${conversion})` : `${amount} ${unit}`;
    },
  );
}

function normalizeGuideDate(monthOrDay, dayOrMonth, year) {
  const first = Number(monthOrDay);
  const second = Number(dayOrMonth);
  if (first <= 12 && second <= 31) return `${year}-${String(first).padStart(2, "0")}-${String(second).padStart(2, "0")}`;
  if (first <= 31 && second <= 12) return `${year}-${String(second).padStart(2, "0")}-${String(first).padStart(2, "0")}`;
  return `${monthOrDay}-${dayOrMonth}-${year}`;
}

function normalizePhilipsLanguage(value) {
  let text = cleanGuidanceText(value)
    .replace(/(\d+(?:\.\d+)?)\s*["”]/g, "$1 inch")
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+\+\s+/g, " and ")
    .replace(/\s*@\s*/g, " at ")
    .replace(/\s*[·•]\s*/g, "; ")
    .replace(/,\s*;/g, ";")
    .replace(/#\s*/g, "number ")
    .replace(/\band\s*\/\s*or\b/gi, "or")
    .replace(/\s*\/\s*/g, " or ")
    .replace(/[“”"]/g, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/([,;:])(?=\S)/g, "$1 ")
    .replace(/\.(?=[A-Za-z])/g, ". ")
    .replace(/\s+/g, " ")
    .trim();

  const americanEnglish = [
    ["analogue", "analog"],
    ["catalogue", "catalog"],
    ["centimetre", "centimeter"],
    ["colour", "color"],
    ["localisation", "localization"],
    ["localised", "localized"],
    ["metre", "meter"],
    ["utilise", "use"],
    ["utilize", "use"],
    ["freeware", "free software"],
  ];
  americanEnglish.forEach(([source, replacement]) => {
    text = replaceGuidanceWord(text, source, replacement);
  });
  text = text.replace(/\b(\d{1,2})-(\d{1,2})-(\d{4})\b/g, (_, first, second, year) => normalizeGuideDate(first, second, year));
  text = text.replace(/\b\d{5,}\b/g, (number) => Number(number).toLocaleString("en-US"));
  return formatDualMeasurements(text).replace(/\s+/g, " ").trim();
}

function normalizeGuidedPhrase(value) {
  return normalizePhilipsLanguage(expandPhilipsAcronyms(value));
}

function phraseWithoutTerminalPunctuation(value) {
  return normalizePhilipsLanguage(value).replace(/[.!?;:]+$/, "");
}

function lowerInitial(value) {
  if (!value || /^[A-Z0-9]{2,}\b/.test(value)) return value;
  return `${value[0].toLowerCase()}${value.slice(1)}`;
}

function limitShortText(value, maxLength = 30) {
  const text = cleanGuidanceText(value);
  if (text.length <= maxLength) return text;
  const candidate = text.slice(0, maxLength + 1);
  const lastSpace = candidate.lastIndexOf(" ");
  return (lastSpace > 20 ? candidate.slice(0, lastSpace) : text.slice(0, maxLength)).replace(/[\s,;:\-]+$/, "");
}

const CLAIM_OR_COMPARISON_PATTERN = /\b(best|better|superior|market[- ]leading|industry[- ]leading|unique|unmatched|guarantee(?:d)?|safest|fastest|highest|lowest|outperform(?:s|ed)?|competitor(?:s)?)\b/i;
const DISCLOSURE_PATTERN = /\b(payment terms?|warranty|installation (?:terms?|conditions?|duration)|training (?:terms?|conditions?|duration))\b/i;
const INTERNAL_REFERENCE_PATTERN = /\b(internal (?:configuration|order)|order instructions?|product number|part number|material number|reference number)\b/i;
const PERSONAL_PRONOUN_PATTERN = /\b(he|she|him|her|his|hers)\b/i;
const OPTIONAL_PATTERN = /\b(optional|optionally|available separately|not included)\b/i;
const COMMON_ACRONYMS = new Set(["AI", "CT", "ECG", "EMR", "ICU", "IT", "LAN", "LCD", "LED", "MRI", "NIBP", "TFT", "UPS", "USB", "WLAN"]);

function guidanceExclusionReason(value) {
  if (CLAIM_OR_COMPARISON_PATTERN.test(value)) return "claim or comparison";
  if (OPTIONAL_PATTERN.test(value)) return "unverified optional feature";
  if (DISCLOSURE_PATTERN.test(value)) return "payment, warranty, installation, or training disclosure";
  if (INTERNAL_REFERENCE_PATTERN.test(value)) return "internal configuration or product reference";
  if (PERSONAL_PRONOUN_PATTERN.test(value)) return "personal pronoun";
  return "";
}

function findUnexplainedAcronyms(value) {
  const matches = normalizePhilipsLanguage(value).match(/\b[A-Z]{2,}[A-Z0-9]*(?:-[A-Z0-9]+)*\b/g) || [];
  return [...new Set(matches.filter((match) => !COMMON_ACRONYMS.has(match) && !/^\d/.test(match)))];
}

function capitalizeInitial(value) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : "";
}

function normalizeAudienceRole(value) {
  let audience = normalizePhilipsLanguage(value)
    .replace(/\b(cardiologist|clinician|physician|radiologist|technologist|nurse|operator|specialist|decision-maker)s?\b/gi, (role) => role.toLowerCase());
  audience = audience.replace(/\b(cardiologist|clinician|physician|radiologist|technologist|nurse|operator|specialist|decision-maker)\b$/i, "$1s");
  return lowerInitial(audience);
}

const FACT_ACTION_PATTERN = /^(access|adjust|annotate|capture|connect|control|display|draw|highlight|manage|mark|measure|monitor|navigate|place|record|review|select|support|use|view|visualize|work)\b/i;

function professionalizeFactClause(value) {
  let clause = lowerInitial(phraseWithoutTerminalPunctuation(normalizeGuidedPhrase(value)))
    .replace(/\btouch screen module screen\b/gi, "touchscreen")
    .replace(/^the ability to\s+/i, "")
    .replace(/^(?:allows?|enables?) (?:the )?(?:user|customer|clinician)s? to\s+/i, "")
    .replace(/^visuali[sz]ation of (?:the )?/i, "view ")
    .replace(/^viewing of (?:the )?/i, "view ")
    .replace(/^display of (?:the )?/i, "display ")
    .replace(/^drawing of\s+/i, "draw ")
    .replace(/^adjustment of\s+/i, "adjust ")
    .replace(/^highlighting of\s+/i, "highlight ")
    .replace(/\bthe acquired images\b/gi, "acquired images")
    .replace(/\bthe clinical images\b/gi, "clinical images")
    .replace(/draw markers on (?:the )?images directly on (?:the )?touchscreen/gi, "place markers directly on the touchscreen")
    .replace(/adjust (?:the )?collimator\b/gi, "adjust collimation")
    .replace(/\bby drag and drop\b/gi, "using drag-and-drop interaction")
    .replace(/\bon (?:the )?touchscreen screen\b/gi, "on the touchscreen")
    .replace(/\s+/g, " ")
    .trim();

  if (!clause) return "";
  if (!FACT_ACTION_PATTERN.test(clause)) clause = `access ${clause}`;
  return clause;
}

function deriveFactConcepts(facts) {
  const source = normalize(facts.join(" "));
  const concepts = [];
  const add = (concept) => {
    if (!concepts.includes(concept)) concepts.push(concept);
  };
  if (/visuali[sz]|view|display|acquired image/.test(source)) add("image viewing");
  if (/draw|marker|annotat|highlight|pointer/.test(source)) add("annotation");
  if (/collimat/.test(source)) add("collimation control");
  if (/navigation|image guidance/.test(source)) add("image guidance");
  if (/dose/.test(source)) add("dose management");
  if (/connect|integrat/.test(source)) add("connectivity");
  if (/monitor|measurement/.test(source)) add("monitoring");
  if (/workflow/.test(source)) add("workflow support");
  return concepts.slice(0, 4);
}

function buildProfessionalFactSentences(name, audience, facts) {
  if (!facts.length) return [];
  const clauses = facts
    .map(professionalizeFactClause)
    .filter(Boolean)
    .filter((clause, index, allClauses) => allClauses.findIndex((candidate) => normalize(candidate) === normalize(clause)) === index);
  const concepts = deriveFactConcepts(facts);
  const sentences = [];
  if (concepts.length) {
    const interfacePhrase = /touchscreen|screen|TSM/i.test(facts.join(" "))
      ? " in one touchscreen interface"
      : " in one product capability";
    sentences.push(ensureSentence(`${name} combines ${joinNaturally(concepts)}${interfacePhrase}`));
  }
  if (clauses.length) {
    const actor = capitalizeInitial(normalizeAudienceRole(audience) || "users");
    sentences.push(ensureSentence(`${actor} can ${joinNaturally(clauses)}`));
  }
  return sentences;
}

function productNameKey(value) {
  return normalize(value).replace(/[^a-z0-9]/g, "");
}

function resolveProductName(value) {
  const requested = normalizePhilipsLanguage(value);
  const key = productNameKey(requested);
  if (!key) return { name: "", matched: false, changed: false, source: null };

  const catalogueMatch = state.items.find((item) => (
    productNameKey(item.name) === key || productNameKey(item.shortText) === key
  ));
  if (catalogueMatch) {
    const officialName = cleanGuidanceText(catalogueMatch.name || catalogueMatch.shortText);
    return {
      name: officialName,
      matched: true,
      changed: officialName !== requested,
      source: `catalogue item ${catalogueMatch.id}`,
    };
  }

  const technicalMatch = state.technicalFacts.find((fact) => productNameKey(fact.subitem) === key);
  if (technicalMatch) {
    const sourceName = cleanGuidanceText(technicalMatch.subitem);
    return { name: sourceName, matched: true, changed: sourceName !== requested, source: "approved technical-data source" };
  }
  return { name: requested, matched: false, changed: false, source: null };
}

function draftComplianceWarnings(text) {
  const warnings = [];
  const acronyms = findUnexplainedAcronyms(text);
  if (acronyms.length) warnings.push(`Define or remove uncommon acronyms before approval: ${acronyms.join(", ")}.`);
  if (CLAIM_OR_COMPARISON_PATTERN.test(text)) warnings.push("Remove comparative or unapproved claim language before approval.");
  if (OPTIONAL_PATTERN.test(text)) warnings.push("Remove optional-feature wording unless the feature is confirmed as included.");
  if (PERSONAL_PRONOUN_PATTERN.test(text)) warnings.push("Replace personal pronouns with the customer, the patient, or the relevant professional role.");
  if (/\b(?:utili[sz]e|freeware|mike|flat[- ]screen)\b/i.test(text)) warnings.push("Replace colloquial or unnecessarily complex wording with the preferred terminology from page 29.");
  return warnings;
}

function buildLocalDraft(request) {
  const rawKeywordPhrases = splitGuidancePhrases(request.keywords, 8);
  const rawFacts = splitGuidancePhrases(request.facts, 12);
  const nameResolution = resolveProductName(request.itemName);
  const itemName = nameResolution.name;
  const audience = normalizePhilipsLanguage(request.audience);
  const references = findGuidanceReferences(request);
  const matchedTechnicalFacts = findTechnicalFacts(request);
  const warnings = [`${GUIDANCE_LABEL} were applied locally. Complete the required human spelling, grammar, syntax, and claims review before approval.`];

  if (nameResolution.changed) warnings.push(`Product naming was aligned to “${itemName}” using ${nameResolution.source}. Confirm the official trademark spelling in Philips Product Library or Windchill.`);
  else if (itemName && !nameResolution.matched) warnings.push("No exact catalogue or workbook match was found for the product name. Confirm its official spelling and capitalization in Philips Product Library or Windchill.");

  const excludedPhrases = [];
  const filterGuidedPhrases = (phrases) => phrases
    .map(normalizeGuidedPhrase)
    .filter((phrase) => {
      const reason = guidanceExclusionReason(phrase);
      const unexplainedAcronyms = findUnexplainedAcronyms(phrase);
      if (reason) {
        excludedPhrases.push(`${phrase} (${reason})`);
        return false;
      }
      if (unexplainedAcronyms.length) {
        excludedPhrases.push(`${phrase} (unexplained acronym: ${unexplainedAcronyms.join(", ")})`);
        return false;
      }
      return true;
    });
  const keywordPhrases = filterGuidedPhrases(rawKeywordPhrases);
  const facts = filterGuidedPhrases(rawFacts);
  const name = itemName || keywordPhrases[0] || "New item";

  const technicalFacts = matchedTechnicalFacts.filter((fact) => {
    const acronyms = findUnexplainedAcronyms(normalizeGuidedPhrase(`${fact.parameter} ${fact.value}`));
    if (!acronyms.length) return true;
    excludedPhrases.push(`${fact.subitem} · ${fact.parameter} (unexplained acronym: ${acronyms.join(", ")})`);
    return false;
  });

  if (excludedPhrases.length) warnings.push(`Excluded content that conflicts with pages 15-29: ${excludedPhrases.join("; ")}.`);
  if (technicalFacts.some((fact) => fact.applicability?.length)) warnings.push("Workbook facts can be configuration-specific. Confirm the applicability codes shown under each sourced fact before approval.");

  const editorialAcronymSource = [itemName, keywordPhrases[0], ...facts.map(professionalizeFactClause)].filter(Boolean).join(" ");
  const unexplainedAcronyms = findUnexplainedAcronyms(editorialAcronymSource);
  if (unexplainedAcronyms.length) warnings.push(`Define Philips-specific or uncommon acronyms on first use: ${unexplainedAcronyms.join(", ")}.`);
  if (/\b(?:cm|kg|mm|meter|inch|lb|lbs)\b/i.test(request.facts)) warnings.push("Metric and US equivalents were added where possible. Verify converted measurements against the approved source before approval.");

  const firstDescriptor = keywordPhrases.find((phrase) => !normalize(name).includes(normalize(phrase)));
  const expandedShort = normalizePhilipsLanguage(nameResolution.matched ? itemName : (itemName && firstDescriptor ? `${itemName} ${firstDescriptor}` : name));
  const shortText = limitShortText(expandedShort, 30);
  if (cleanGuidanceText(expandedShort).length > shortText.length) {
    warnings.push("The short draft was shortened to the 30-character product-option sales-text limit in the guidance.");
  }
  if (!itemName) warnings.push("No item name was supplied; replace the working name before approval.");
  if (!facts.length && !technicalFacts.length) warnings.push("No approved product fact matched the request. Refine the keywords or add verified facts before approval.");
  if (!references.length) warnings.push("No close catalogue match was found; the draft uses the local template only.");

  const applicabilityCodes = new Set(state.technicalFacts.flatMap((fact) => fact.applicability || []).map((code) => normalize(code)));
  const topics = keywordPhrases
    .filter((phrase) => normalize(phrase) !== normalize(name))
    .filter((phrase) => !applicabilityCodes.has(normalize(phrase)))
    .slice(0, 4);

  const narrativeFacts = [...facts, ...technicalFacts
    .filter((fact) => /^present$/i.test(cleanGuidanceText(fact.value)))
    .map((fact) => fact.parameter)]
    .filter((fact, index, allFacts) => allFacts.findIndex((candidate) => normalize(candidate) === normalize(fact)) === index);
  const featureSentences = buildProfessionalFactSentences(name, audience, narrativeFacts);
  technicalFacts
    .filter((fact) => !/^present$/i.test(cleanGuidanceText(fact.value)))
    .forEach((fact) => featureSentences.push(technicalFactSentence(name, fact)));
  if (!featureSentences.length) {
    const focus = topics.length ? ` focused on ${joinNaturally(topics.map((topic) => lowerInitial(phraseWithoutTerminalPunctuation(topic))))}` : "";
    featureSentences.push(ensureSentence(`${name} is a working draft${focus}`));
  }

  const sections = [["Features of the product", featureSentences.join(" ")]];
  const longText = sections.map(([heading, body]) => `${heading}\n\n${body}`).join("\n\n");
  warnings.push(...draftComplianceWarnings(`${shortText} ${longText}`));

  return {
    model: `Guide pp. 15-29 | ${technicalFacts.length} workbook fact${technicalFacts.length === 1 ? "" : "s"} | ${references.length} catalogue match${references.length === 1 ? "" : "es"}`,
    references,
    technicalSource: {
      metadata: state.technicalSource,
      facts: technicalFacts,
    },
    drafts: {
      shortText,
      longText,
      factWarnings: [...new Set(warnings)],
    },
  };
}

function showDraftError(message) {
  elements.draftError.querySelector("p").textContent = message;
  elements.draftError.hidden = false;
}

function renderDraftReferences(references) {
  const fragment = document.createDocumentFragment();
  if (!references.length) {
    const chip = document.createElement("span");
    chip.className = "reference-chip";
    chip.textContent = "No close catalogue match found";
    fragment.append(chip);
  } else {
    references.forEach((reference) => {
      const chip = document.createElement("span");
      chip.className = "reference-chip";
      const id = document.createElement("b");
      id.textContent = reference.id;
      chip.append(id, document.createTextNode(reference.name));
      fragment.append(chip);
    });
  }
  elements.draftReferences.replaceChildren(fragment);
}

function renderTechnicalSource(source) {
  const metadata = source?.metadata;
  const facts = source?.facts || [];
  elements.technicalFacts.replaceChildren();

  if (!metadata) {
    elements.technicalSourceSummary.textContent = "The Azurion workbook source is unavailable. No workbook fact was inserted into this draft.";
    return;
  }

  const sourceName = document.createElement("strong");
  sourceName.textContent = metadata.sourceFile;
  const sourceMessage = facts.length
    ? ` is being used as the Approved product facts source. ${facts.length} matching fact${facts.length === 1 ? " was" : "s were"} inserted from ${metadata.sheetName}.`
    : ` was checked as the Approved product facts source. No confident match was found, so no unrelated workbook fact was inserted.`;
  elements.technicalSourceSummary.replaceChildren(sourceName, document.createTextNode(sourceMessage));

  facts.forEach((fact) => {
    const card = document.createElement("article");
    card.className = "technical-fact-card";
    const heading = document.createElement("b");
    heading.textContent = `${fact.subitem} · ${fact.parameter}`;
    const location = document.createElement("small");
    location.textContent = `${metadata.sheetName} · row ${fact.row}`;
    const value = document.createElement("p");
    const applicability = fact.applicability?.length ? ` Applies to: ${fact.applicability.join(", ")}.` : "";
    value.textContent = `${fact.value}${applicability}`;
    card.append(heading, location, value);
    elements.technicalFacts.append(card);
  });
}

function historyTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : historyDateFormat.format(date);
}

function historyPayload(payload) {
  const stored = JSON.parse(JSON.stringify(payload, (key, value) => (key === "_fields" || key === "score" ? undefined : value)));
  stored.references = (stored.references || []).map(({ id, name }) => ({ id, name }));
  return stored;
}

function loadDraftHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || "[]");
    state.history = Array.isArray(stored)
      ? stored.filter((entry) => entry?.id && entry?.payload?.drafts).slice(0, HISTORY_LIMIT)
      : [];
  } catch {
    state.history = [];
  }
}

function persistDraftHistory() {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(state.history.slice(0, HISTORY_LIMIT)));
  } catch {
    state.history = state.history.slice(0, Math.min(40, state.history.length));
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(state.history));
    } catch {
      // History remains available for the current session when browser storage is unavailable.
    }
  }
}

function historyPreview(entry) {
  return cleanGuidanceText(entry.payload?.drafts?.longText || entry.payload?.drafts?.shortText || "")
    .replace(/^Features of the product\s*/i, "");
}

function renderDraftHistory() {
  elements.historyCount.textContent = formatNumber.format(state.history.length);
  elements.historyEmpty.hidden = state.history.length > 0;
  const fragment = document.createDocumentFragment();

  state.history.forEach((entry) => {
    const listItem = document.createElement("div");
    listItem.setAttribute("role", "listitem");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `history-item${entry.id === state.currentHistoryId ? " is-selected" : ""}`;
    button.setAttribute("aria-label", `Restore ${entry.request?.itemName || "untitled draft"} from ${historyTimestamp(entry.createdAt)}`);

    const top = document.createElement("span");
    top.className = "history-item-top";
    const name = document.createElement("strong");
    name.textContent = cleanGuidanceText(entry.request?.itemName) || splitGuidancePhrases(entry.request?.keywords, 1)[0] || "Untitled draft";
    const time = document.createElement("time");
    time.dateTime = entry.createdAt;
    time.textContent = historyTimestamp(entry.createdAt).replace(/,?\s*\d{4},?/, "");
    top.append(name, time);

    const preview = document.createElement("p");
    preview.textContent = historyPreview(entry) || "Draft saved without preview text.";

    const meta = document.createElement("span");
    meta.className = "history-item-meta";
    const facts = document.createElement("span");
    const factCount = entry.payload?.technicalSource?.facts?.length || 0;
    facts.textContent = `${factCount} source fact${factCount === 1 ? "" : "s"}`;
    const references = document.createElement("span");
    const referenceCount = entry.payload?.references?.length || 0;
    references.textContent = `${referenceCount} reference${referenceCount === 1 ? "" : "s"}`;
    meta.append(facts, references);

    button.append(top, preview, meta);
    button.addEventListener("click", () => restoreHistoryEntry(entry.id));
    listItem.append(button);
    fragment.append(listItem);
  });

  elements.historyList.replaceChildren(fragment);
}

function createHistoryEntry(request, payload) {
  const createdAt = new Date().toISOString();
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const entry = {
    id,
    createdAt,
    updatedAt: createdAt,
    request: { ...request },
    payload: historyPayload(payload),
  };
  state.history.unshift(entry);
  state.history = state.history.slice(0, HISTORY_LIMIT);
  state.currentHistoryId = id;
  persistDraftHistory();
  renderDraftHistory();
  return entry;
}

function renderDraftTrace(entry, payload, restored = false) {
  if (!entry) {
    elements.draftTrace.textContent = "This draft is not yet stored in local history.";
    return;
  }
  const sourceCount = payload?.technicalSource?.facts?.length || 0;
  const referenceCount = payload?.references?.length || 0;
  const action = restored ? "Restored" : "Saved";
  elements.draftTrace.textContent = `${action} ${historyTimestamp(entry.createdAt)} · ${sourceCount} workbook fact${sourceCount === 1 ? "" : "s"} · ${referenceCount} catalogue reference${referenceCount === 1 ? "" : "s"}`;
}

function restoreHistoryEntry(id) {
  const entry = state.history.find((candidate) => candidate.id === id);
  if (!entry) return;
  clearTimeout(historyUpdateTimer);
  state.currentHistoryId = id;
  elements.draftItemName.value = entry.request?.itemName || "";
  elements.draftKeywords.value = entry.request?.keywords || "";
  elements.draftFacts.value = entry.request?.facts || "";
  elements.draftAudience.value = entry.request?.audience || "";
  renderDraftResult(entry.payload, { historyEntry: entry, restored: true });
  renderDraftHistory();
  showToast("Draft and source trace restored");
}

function syncCurrentDraftToHistory() {
  const entry = state.history.find((candidate) => candidate.id === state.currentHistoryId);
  if (!entry || !state.drafts) return;
  entry.payload.drafts = JSON.parse(JSON.stringify(state.drafts));
  entry.updatedAt = new Date().toISOString();
  persistDraftHistory();
  renderDraftHistory();
  renderDraftTrace(entry, entry.payload, true);
}

function renderFactWarnings(warnings) {
  elements.factWarnings.hidden = warnings.length === 0;
  if (!warnings.length) {
    elements.factWarnings.replaceChildren();
    return;
  }
  const title = document.createElement("strong");
  title.textContent = "Check before approval";
  const list = document.createElement("ul");
  warnings.forEach((warning) => {
    const item = document.createElement("li");
    item.textContent = warning;
    list.append(item);
  });
  elements.factWarnings.replaceChildren(title, list);
}

function renderActiveDraft() {
  if (!state.drafts) return;
  const isShort = state.activeDraft === "short";
  const text = isShort ? state.drafts.shortText : state.drafts.longText;
  elements.draftShortTab.setAttribute("aria-selected", String(isShort));
  elements.draftLongTab.setAttribute("aria-selected", String(!isShort));
  elements.draftEditor.value = text;
  elements.draftCount.textContent = `${formatNumber.format(text.length)} characters`;
}

function renderDraftResult(payload, { historyEntry = null, restored = false } = {}) {
  state.drafts = payload.drafts;
  state.activeDraft = "short";
  if (historyEntry) state.currentHistoryId = historyEntry.id;
  elements.draftModel.textContent = payload.model || "Local guided draft";
  elements.draftEmpty.hidden = true;
  elements.draftError.hidden = true;
  elements.draftResult.hidden = false;
  renderTechnicalSource(payload.technicalSource);
  renderDraftReferences(payload.references || []);
  renderFactWarnings(payload.drafts.factWarnings || []);
  renderDraftTrace(historyEntry, payload, restored);
  renderActiveDraft();
}

function handleDraftGeneration(event) {
  event.preventDefault();
  clearTimeout(historyUpdateTimer);
  elements.draftError.hidden = true;

  const request = {
    itemName: elements.draftItemName.value,
    keywords: elements.draftKeywords.value,
    facts: elements.draftFacts.value,
    audience: elements.draftAudience.value,
  };
  if (!request.keywords.trim()) {
    elements.draftKeywords.focus();
    showDraftError("Add at least one keyword or key phrase.");
    return;
  }

  try {
    setDraftLoading(true);
    const payload = buildLocalDraft(request);
    const historyEntry = createHistoryEntry(request, payload);
    renderDraftResult(payload, { historyEntry });
  } catch (error) {
    showDraftError(error.message || "The draft could not be generated.");
  } finally {
    setDraftLoading(false);
  }
}

async function handleCopyDraft() {
  const text = elements.draftEditor.value.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    elements.draftEditor.select();
    document.execCommand("copy");
  }
  showToast(`${state.activeDraft === "short" ? "Short" : "Long"} draft copied`);
}

function bindEvents() {
  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value;
    elements.clearSearch.hidden = !state.query;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => applySearch(), 70);
  });
  elements.clearSearch.addEventListener("click", () => {
    state.query = "";
    elements.search.value = "";
    applySearch();
    elements.search.focus();
  });
  elements.typeFilter.addEventListener("change", (event) => {
    state.type = event.target.value;
    applySearch();
  });
  elements.availabilityFilter.addEventListener("change", (event) => {
    state.availability = event.target.value;
    applySearch();
  });
  elements.resetFilters.addEventListener("click", clearAllFilters);
  elements.loadMore.addEventListener("click", () => {
    state.visible += 50;
    renderResults();
  });
  elements.shortTab.addEventListener("click", () => {
    state.activeText = "short";
    renderActiveText();
  });
  elements.longTab.addEventListener("click", () => {
    state.activeText = "long";
    renderActiveText();
  });
  elements.copyCurrent.addEventListener("click", copyActiveText);
  elements.copyCurrentTop.addEventListener("click", copyActiveText);
  elements.openComposer.addEventListener("click", () => setComposerOpen(true));
  elements.closeComposer.addEventListener("click", () => setComposerOpen(false));
  elements.composerBackdrop.addEventListener("click", () => setComposerOpen(false));
  elements.composerForm.addEventListener("submit", handleDraftGeneration);
  elements.draftShortTab.addEventListener("click", () => {
    state.activeDraft = "short";
    renderActiveDraft();
  });
  elements.draftLongTab.addEventListener("click", () => {
    state.activeDraft = "long";
    renderActiveDraft();
  });
  elements.draftEditor.addEventListener("input", () => {
    if (!state.drafts) return;
    const key = state.activeDraft === "short" ? "shortText" : "longText";
    state.drafts[key] = elements.draftEditor.value;
    elements.draftCount.textContent = `${formatNumber.format(elements.draftEditor.value.length)} characters`;
    clearTimeout(historyUpdateTimer);
    historyUpdateTimer = setTimeout(syncCurrentDraftToHistory, 350);
  });
  elements.copyDraft.addEventListener("click", handleCopyDraft);
  document.addEventListener("keydown", (event) => {
    const isTyping = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if (event.key === "/" && !isTyping) {
      event.preventDefault();
      elements.search.focus();
    }
    if (event.key === "Escape") {
      if (!elements.composerPanel.hidden) {
        setComposerOpen(false);
        return;
      }
      if (state.query) {
        state.query = "";
        elements.search.value = "";
        applySearch();
      }
      elements.search.blur();
    }
  });
}

async function initialise() {
  bindEvents();
  prepareTechnicalSource(window.AZURION_TECHNICAL_DATA);
  loadDraftHistory();
  renderDraftHistory();
  try {
    let payload = window.SALES_DATA;
    if (!payload) {
      const response = await fetch("public/data/items.json");
      if (!response.ok) throw new Error(`Data request failed with ${response.status}`);
      payload = await response.json();
    }
    state.items = payload.items.map((item) => ({ ...item, _search: makeSearchIndex(item) }));
    elements.sourceLabel.textContent = catalogueSourceLabel(payload.metadata);

    [...new Set(state.items.map((item) => item.itemType).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
      .forEach((type) => {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = type.replaceAll("_", " ");
        elements.typeFilter.append(option);
      });

    applySearch();
    const initialId = new URLSearchParams(location.hash.replace(/^#/, "")).get("id");
    const initialItem = initialId && state.items.find((item) => item.id === initialId);
    if (initialItem) selectItem(initialItem, { updateHash: false });
    else showEmptyDetail();
  } catch (error) {
    console.error(error);
    elements.loadingState.querySelector("h1").textContent = "The sales library could not be loaded";
    elements.loadingState.querySelector("p").textContent = "Refresh the page. If the issue continues, restart the app with “npm start”.";
    elements.sourceLabel.textContent = "Catalogue unavailable";
  }
}

initialise();
