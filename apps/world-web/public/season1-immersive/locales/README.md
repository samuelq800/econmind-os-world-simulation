# English-first interface

English is the default for all six office journeys and all 70 country pages. The persistent **EN / 中文** control changes language in place and stores only the language preference under `econmind-ui-language`.

## Authoring

- Develop new interface copy in English, with an explicit Chinese counterpart.
- `ui.tsv` contains reviewed interface copy; `modules.tsv` contains the 120 office module titles; `terms.tsv` contains selectable terms.
- Existing Chinese strings are stable lookup keys for the legacy prototype. They are not translated request payloads.
- Run `python3 locales/build.py` from the immersive prototype directory after editing translations. English field headings reuse the original English specifications, with explicit overrides where one specification row covers multiple controls.
- `dictionary.json` contains exact translations. `phrases.json` limits phrase interpolation to reviewed UI, module and option terms; field identifiers must not be interpolated into prose.
- Keep original rule quotations, user-written text, IDs, input values, currencies and settlement quantities untouched. Use `data-no-translate` for source material.

## Behaviour

Language changes preserve scene/input DOM nodes, focus, current values, country and office. Option labels may change; original option values remain intact. Switching language never executes an action or resets a saved draft.

The current operator is fixed for an entry URL. Language switching does not expose another minister's controls. This is a local preview boundary, not authentication.

## Verification

`node countries/qa/bilingual.cjs` checks 70 country pages, six journeys, 120 modules, 1,126 rendered controls, 158 result entries, source quotations, retained values/focus, persistence and desktop/mobile layout. `node countries/qa/feedback.cjs` checks execution feedback and scheduled sample outcomes across the six offices.

Original catalog data and source quotations remain unchanged. User-authored notes are not machine-translated. Official authorization and settlement remain unconnected.
