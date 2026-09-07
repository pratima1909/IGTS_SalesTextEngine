import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadWindowData(path, property) {
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path, "utf8"), context);
  return context.window[property];
}

const inertElement = {};
const appContext = vm.createContext({
  console,
  document: { querySelector: () => ({ ...inertElement }) },
  window: {},
});
const appSource = fs.readFileSync("app.js", "utf8")
  .replace(/initialise\(\);\s*$/, "")
  .concat("\nglobalThis.guidanceTestApi = { state, makeSearchIndex, prepareTechnicalSource, normalizePhilipsLanguage, buildLocalDraft };\n");
vm.runInContext(appSource, appContext);

const api = appContext.guidanceTestApi;
const salesData = loadWindowData("public/data/items-data.js", "SALES_DATA");
const technicalData = loadWindowData("public/data/azurion-technical-facts.js", "AZURION_TECHNICAL_DATA");
assert.equal(salesData.metadata.source, "Sales Text Data_August 2026.xlsx");
assert.equal(salesData.metadata.itemCount, 3727);
assert.equal(salesData.items.length, 3727);
api.state.items = salesData.items.map((item) => ({ ...item, _search: api.makeSearchIndex(item) }));
api.prepareTechnicalSource(technicalData);

const normalized = api.normalizePhilipsLanguage("Colour display, 8.9cm, 15000 images, dated 03-18-2018.");
assert.match(normalized, /Color display/);
assert.match(normalized, /8\.9 cm \(3\.5 inch\)/);
assert.match(normalized, /15,000 images/);
assert.match(normalized, /2018-03-18/);

const draft = api.buildLocalDraft({
  itemName: "Touchscreen module Pro",
  keywords: "image viewing; intuitive controls; unique; optional pointer; ABC workflow",
  facts: "visualization of the acquired images; draw markers on the images directly on the TSM screen; adjust the collimator by drag and drop on the clinical images; use the interventional room pointer to highlight details on the clinical images",
  audience: "interventional Cardiologist",
});

assert.match(draft.model, /^Guide pp\. 15-29/);
assert.match(draft.drafts.longText, /^Features of the product\n\n/);
assert.match(draft.drafts.longText, /Touch Screen Module Pro/);
assert.doesNotMatch(draft.drafts.longText, /\bincludes\b.*\bincludes\b/i);
assert.doesNotMatch(draft.drafts.longText, /access place/i);
assert.doesNotMatch(draft.drafts.longText, /\b(?:unique|optional|ABC|TSM)\b/i);
assert.equal((draft.drafts.longText.match(/place markers/gi) || []).length, 1);
assert.equal(draft.drafts.shortText, "Touch Screen Module Pro");
assert.ok(draft.drafts.factWarnings.some((warning) => /Product naming was aligned/.test(warning)));
assert.ok(draft.drafts.factWarnings.some((warning) => /Excluded content/.test(warning)));

console.log("Guidance smoke test passed.");
