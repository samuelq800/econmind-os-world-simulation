# V27 to V29 existing-data seed closure preparation

## Immutable identity and status

- Branch: `codex/v29-existing-data-closure`.
- Mainline base: `0fa8da7e74488f4554185afb68c19b4933d72586`.
- Plan commit: `fe3dd751a7eaed2018cc8f5f3bcdf0830aa237af`.
- Frozen code, inventory and test commit:
  `07a523246cc008a16ec7a0b6eb2b5c4b79ca632b`.
- Frozen code tree: `c983c84db332a19ee5e054b81bef6db37e0e6cad`.
- Frozen existing-data source commit:
  `abbcdc5c86279227627d30d13952fdadda96737b` on
  `codex/world-data-calibration`.
- Classification: P0-sensitive `PREPARATION_ONLY` with independent narrow code
  review complete and actual data closure `UNAVAILABLE`.
  `status/progress.json` still records V27.1,
  V27.2, V27.3 and V29.1–V29.3 as `PLANNED`; this branch does not change those
  entries or claim Gate completion.

## Independent narrow review and handoff

Independent lane B reviewed exact candidate
`94245838314900d309935cd436665745aea14fa1`. Within the
`PREPARATION_ONLY` code and frozen-inventory scope it reported **BLOCKER 0 /
MAJOR 0**, independently recomputed all 7 artifact hashes with matching
results, and confirmed the 40 focused tests pass.

That conclusion does not approve actual 70-country data, V27.2 inputs,
fictional-country mapping, WTO evidence, any of the seven open data gates,
OpeningSeed generation or formal V29 completion. The handoff therefore stops
at `PREPARATION_REVIEWED_DATA_UNAVAILABLE`. No synthetic input may be created
to convert the review into a data-completion claim.

## Delivered boundary

`packages/core/src/calibration/existing-data-seed-closure.ts` is a pure,
non-index-exported preflight. It strictly parses a hash-bound inventory of
existing calibration evidence, requires every reported count to name an
evidence artifact, and rejects duplicate references, unknown artifacts,
non-canonical counts, malformed hashes and a `finalGeneratorReady` claim that
conflicts with open gates, provider gaps or absent mapping authorization.

When actual V27 inputs are later supplied, the preflight reparses the V27.1
provenance result, revalidates the V27.2 calibration candidate, invokes the
reviewed provenance/calibration adapter and requires each provenance and
calibration source locator/digest to match one frozen inventory artifact.
Missing inputs, a non-70 provenance configuration, incomplete calibration,
unbound/mismatched source bytes or adapter gaps remain explicit
`UNAVAILABLE`/`MISMATCH` issues. It does not infer country identities,
source mappings, metrics or amounts.

All outputs retain `generationAuthorized: false` and
`openingSeedAuthorized: false`. A future `TRACEABLE_PREPARATION` result would
still be only a deterministic review preimage; V08 OpeningSeed construction,
reconciliation and independent authorization remain separate boundaries. No
worker/API/UI integration, Command, Event, ledger posting, database, Supabase,
clock, RNG, production or alternate World/Season path was added. This avoids
overlap with A's worker composition ownership.

## Existing-data truth

The adjacent `EXISTING_DATA_INVENTORY.json` records only facts already present
at source commit `abbcdc5`:

- status `PILOT_NON_AUTHORITATIVE_PARTIAL`;
- 247 observations, 246 distinct observation IDs, 6 explicit missing facts
  and 1 exact duplicate;
- 10 empirical entities, 10 variables and 3 periods (2021–2023);
- 19 candidate features and **0 admitted features**;
- 7 source snapshots and 0 closure-evidence bindings;
- WTO `NOT_FETCHED/WTO_API_KEY_MISSING`;
- fictional-country mapping not authorized and final generator not ready;
- seven open data-handoff gates: missingness policy, archetype method/count,
  fictional-country mapping, WTO tariff evidence, vintage stability,
  sector/trade reconciliation and final runtime handoff.

The seven inventory artifact digests were recomputed from immutable Git
objects using `git show abbcdc5...:<path>` and all matched. The inventory copies
no economic observation values and creates no synthetic parameter. The value
`8 tonne_per_day` appearing in the focused source-binding regression is a
test-only parser fixture and is not an existing-data or runtime value.

## Verification

- Frozen source artifact SHA-256 verification: **PASS**, 7/7 artifacts.
- New focused preflight test: **PASS**, 7/7 tests.
- Combined V27.1, V27.2, reviewed provenance adapter and new preflight tests:
  **PASS**, 4 files / 40 tests.
- Targeted ESLint and Prettier: **PASS**.
- Core typecheck and build: **PASS**.
- Repository boundary scan: **PASS**, 155 files.
- Authoritative-pattern scan: **PASS**, 72 Core / 150 total files.
- Safe-local environment: **PASS**, `databaseConfigured=false`, Supabase
  `NOT_LINKED`, database mutation disabled.
- Foundation policy: **PASS**.
- Repository secrets: **PASS**, 975 files.
- `git diff --check`: **PASS**.

## Real blockers and NOT_RUN

There is no actual 70-country V27.1 provenance input and no actual 70-country
V27.2 calibration candidate in main or the frozen calibration source branch.
The existing ten-entity pilot cannot be mapped to fictional countries because
mapping is expressly unauthorized and no feature is admitted. Therefore 70
country IDs, per-country opening values, facilities, accounts, resources,
trade shares, source-linked assumptions/derivations and V27.1↔V27.2 path links
remain unavailable.

New data retrieval, WTO authentication, imputation/missingness selection,
archetype selection, fictional-country mapping, IPF/RAS, trade reconciliation,
economic plausibility approval, actual OpeningSeed generation/reconciliation,
worker composition, long-run V29 replay, full repository tests, independent
approval of actual 70-country data and OpeningSeed, merge, migration, release
and production operation are `NOT_RUN`.
