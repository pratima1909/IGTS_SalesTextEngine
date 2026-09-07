# IGT Systems Sales Text Engine

A local web app for searching existing sales text and producing catalogue-guided drafts for new items.

The local writer applies the writing and formatting rules from pages 15-29 of the Product Description and Sales Text Guidelines. It aligns exact product names to catalogue data where possible, excludes unverified optional features and unsupported acronyms, normalizes American English, dates, numbers and measurements, and presents editable output in Calibri 11. Human review and authoritative product-name and claims approval remain required.

The catalogue backbone is **Sales Text Data_August 2026.xlsx**, containing 3,727 searchable items. The generated browser data keeps the workbook's first 19 catalogue and sales-text fields; later reporting-only columns remain in the workbook and are not exposed by the app.

## Open the app

Double-click `index.html` to use catalogue search and the local guided writer without setup. All matching and draft construction happen in the browser against the embedded catalogue; no API key or external service is used.

## Open through the local server (optional)

1. Open a terminal in this folder and run `npm start`.
2. Open [http://localhost:4173](http://localhost:4173).

Search by item ID, product name, MAG/AG code, or words inside either sales-text field. Use the text tabs to switch between short and long copy, then select **Copy text**.

Select **Write new sales text** to open the studio. Enter keywords and, when available, additional approved product facts. The browser automatically searches the embedded `DHF373049_Azurion_Technical_Data_V8_final.xlsx` technical-data source, inserts relevant facts into the draft, and shows the workbook sheet and row used for every retrieved fact. It also retrieves up to five similar catalogue entries and applies the Philips Product Description and Sales Text Guidelines automatically. Related facts are consolidated into a concise feature-to-value introduction and one fluent capability sentence, rather than repetitive “includes” statements. The writer uses American English and complete sentences, avoids bullet lists and filters risky claims, disclosures, internal references and personal pronouns. If no confident workbook match is found, the app says so and does not insert an unrelated fact. The result must receive human, naming and claims review before use.

Every generated draft is stored locally in the browser’s scrollable **Draft history**. Selecting an entry restores its original inputs, edited short and long text, generation time, workbook facts and rows, and catalogue references. Up to 100 drafts are retained; the history remains on the device and is not sent to an external service.
