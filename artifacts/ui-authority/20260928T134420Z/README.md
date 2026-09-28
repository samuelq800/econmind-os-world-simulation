# Owner-selected EconMind Season 1 page UI

The user explicitly selected `role-prototypes/season1-immersive/` as the sole authoritative page UI and authorized delivery to thread `01a08bf9-fe19-7440-88fa-159677b611bd` (Coordinate EconMind control tower).

## Run

From the extracted package root:

    python3 -m http.server 8767 --bind 127.0.0.1 --directory role-prototypes

Open `http://127.0.0.1:8767/season1-immersive/?role=finance&country=01#country`.
Roles: captain, finance, central_bank, industry, trade, social. Countries: 01 through 70.

## Authority and preservation

Use the current immersive country-map entrance as the UI baseline: desktop landscape layout, official lobby badge and art, separate office operators, English default with Chinese toggle, automatic 10x time, contextual action controls and all retained module entrances. Do not replace this with the older atlas/profile page or workbench layouts. Keep earlier versions as references only. All files from role-prototypes are included, including assets, shared unit libraries, original indexed specifications, historical versions, tests and evidence.

## Functional evidence

The latest review covers 120 modules, 1,126 control instances (1,095 distinct field keys), 158 result items and 1,030 existing audited requirement records. All modules were edited, saved and restored after reload. See `role-prototypes/season1-immersive/FINAL-FUNCTION-REVIEW.md`, `validation-summary.json`, `qa/final-role-audit.json`, `qa/final-source-audit.json`, and `qa/final-home-regression.json`.

## Runtime and data boundary

This is a UI selection, not a claim of live world integration. Official settlement, market counterparties and cross-operator approvals are not connected. Local scenario data and preview decisions must not overwrite the newer official 70-country source-data baseline selected by the receiving thread. Reconcile the UI's display model with that official data while preserving this UI's design and unit semantics.

## Integrity

`MANIFEST.json` lists every payload file with SHA-256 and byte length. `UI-AUTHORITY.json` records the user's selection and its scope. `PACKAGE.json` next to the archive pins the archive hash. Validate hashes before importing.
