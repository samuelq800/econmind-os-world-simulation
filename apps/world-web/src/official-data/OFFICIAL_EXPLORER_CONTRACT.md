# Selected-source explorer country adapter

`createOfficialExplorerCountryLoader({ fetcher?, baseUrl?, crypto? })` from
`official-explorer-country.ts` supplies one lazily loaded country. `baseUrl`
means the application root (default: Vite public base relative to the document),
not the Edge API or data directory. `load('01' | 'visual-territory-01', { signal? })`
reads only `season1-immersive/countries/data/NN.json` using a credential-free,
no-store GET. Identity is strictly 01–70. It has a five-second deadline and a
per-file, manifest-bound byte limit. WebCrypto is required to validate SHA-256.

Result kinds are `ready` (`data: OfficialExplorerCountry`), `missing`, `error`,
and `stale`; every failure has a stable `reason`. The exported
`OfficialExplorerCountryLoadState` adds `idle` and `loading` for React. On
selection changes, abort the previous request and clear detail state immediately.
Render a result only when `data.id` still matches the selected country. Never
fill a failure with a previous country's record or geographic-scenario values.
No rows or requests are cached across selections.

The ready object retains every source property and nested record and is deeply
frozen. `data.population` is an alias of `data.profile.population`. Facilities
retain `point`, nullable `anchor`, and the complete `record`; resources retain
the complete deposit and its point; regions retain initial/natural/land-use data.
Missing `resourceId` means no source resource binding; do not manufacture one.
Null anchors remain null; do not substitute the legacy scene index. The complete
1,374-facility set includes 350 development options, not merely those 350.

`data.source.kind` is **selected-source-display**, with selected package,
checksum, country-source hash and generated-file byte hash. It always records
`liveWorldState: false`, `proposalFieldsAreExecuted: false`, `worldId: null`,
and `openingSeedCommitted: false`. Validation of bundled source bytes is not
API readback, a live projection, an executed facility, authorization or a receipt.
Opening finance/stocks and facility capacities are proposals/source display.

C owns generated country JSON and exact-token provenance. Its additive
`data.officialSource.fields[outputJsonPointer]` provides `exact`, `rawToken`,
dataset/row/field/source pointer and unit/nature. Preserve these strings exactly;
do not derive exact text with JS floating-point arithmetic. For the population
alias, use `/profile/population`. A value lacking provenance must not be labelled
exact/verified. The small manifest also exports `OFFICIAL_EXPLORER_SUMMARY` with
exact-string selected-package counts, allowing an overview without fetching all
70 bodies. Totals are not live counters.

A owns the adapter/types and byte manifest. When C changes generated files, A
must synchronize the pinned byte identities to that reviewed candidate before
integration; mismatched files fail closed. `validateOfficialExplorerCountryPayload`
is only a structural display predicate. The loader is the entry point combining
that predicate with byte identity; neither grants authoritative runtime status.

Focused test: `pnpm exec vitest run tests/world-web/official-explorer-country.test.ts`.
