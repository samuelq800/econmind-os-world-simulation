# F — official World opening Worker handoff

Date: 2026-09-30. Scope: `econmind-os-world-simulation` only. This is a
Worker-code candidate and an explicit non-activation record, not an approval
to initialize a production World or advance the simulation.

## Fixed implementation and evidence

- Baseline: `cf6707d67fb56761ec7e4a403c272897401ae035` (`origin/main` at
  worktree creation).
- Isolated branch: `codex/f-opening-seed-70-country`.
- Initial code commit: `0c2cdc71a9d047f4b90d12e999595f6ed48601f7`.
- V2-contract code commit: `4698f0f55a1bd6b6489f8f5471dc99de1915b04f`.
- Independent complete-coverage oracle code commit:
  `9308eb7cc07f029f2956da859a8b2821c30f4402`.
- Map-path-derived country ownership correction code commit:
  `442c91504075ca9464fd6a83556045c69516750f`.
- Dedicated [native PostgreSQL 16 CI run](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/36651575056): success on that exact code commit;
  PGlite focused tests 6/6 and native PostgreSQL tests 2/2 with no skip in CI.
  Worker/Core build, focused test typecheck, lint, formatting and diff check
  passed in the same run. Local targeted boundary scan passed (210 files).
- The native tests use an explicitly test-only empty OpeningSeed to check
  storage, exact retry, concurrent retry and readback. They **do not** prove
  that the selected 70-country economics can yet be made into a valid seed.
- [V2-contract native PostgreSQL 16 CI run](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/36652734592):
  success on exact code commit `4698f0f55a1bd6b6489f8f5471dc99de1915b04f`.
  PGlite focused tests 7/7 and native PostgreSQL tests 2/2 passed; build,
  typecheck, lint, formatting and diff check passed in the same run.
- [Independent-oracle native PostgreSQL 16 CI run](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/36654334181):
  success on exact code commit `9308eb7cc07f029f2956da859a8b2821c30f4402`.
  PGlite focused tests 13/13 and native PostgreSQL tests 2/2 passed, with
  Worker/Core build, focused typecheck, lint, formatting and diff check green.
  Local boundary scan passed (210 files). The old C report at
  `592ccbf5eca3440d87bda51660dddd09f807948a` was rejected by the new
  region-country oracle; corrected C input at
  `ef3af983aa9f996f599a392bb244872a3cb59a32` was accepted structurally
  but returned `BLOCKED` on six unresolved OpeningSeed semantics.
- [Map-path ownership correction native PostgreSQL 16 CI run](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/36654895560):
  success on exact code commit `442c91504075ca9464fd6a83556045c69516750f`.
  PGlite focused tests 15/15 and native PostgreSQL tests 2/2 passed; build,
  typecheck, lint, formatting and diff check passed in the same run. The
  corrected C report still returned `BLOCKED` with six opening gaps in a
  separate local read-only check.
- P0 independent review: **PENDING**. No `VERIFIED`, mainline merge or Gate B
  claim is made by F.

The current admission oracle independently checks the fixed source checksum
manifest, map manifest and original region roster by their pinned SHA-256
values. Against these trusted bytes it checks all 87 source-artifact and 203
map-asset identities, exact path/hash/size sets, 70 unique country rows,
country/asset references, all 34 structured dataset references and each
region-derived country attribution. Equal counts with empty objects,
duplicated paths or wrong country references are rejected.
After B found that the first asset association check compared two fields from
the same C report, F now derives country ownership from the trusted
`country-scenes/NN.png` and `country-detail/NN-*.svg` paths. Each of the 70
countries must have exactly two such assets; global/support files must have
no country. The focused negative reassigns country 01's scene to country 02
and consistently rewrites both reported country lists, yet is rejected.

## What the Worker now owns

`WorldOpeningSeedStore` checks the existing immutable seed first. Identical
retry returns `ALREADY_BOOTSTRAPPED` even after the World head has advanced;
different seed remains a conflict. Its existing SQL trigger still rejects a
new seed after WorldVersion zero. No migration was changed.

`WorldOpeningBootstrapReadback` composes the existing seed store and durable
V08 lineage reader in a single read transaction. It verifies seed ID,
fingerprint, World ID and WorldVersion agreement against the reconstructed
inventory/financial ledgers. This is not a second ledger.

`inspectOfficialWorldOpeningAdmission` verifies the selected owner record,
canonical C mapping/gap/coverage report fingerprints and the independent
source-manifest oracles above, 70 mapped Country IDs,
14,712,146,434 people, all 840 stock cells (619 positive), catalog units,
70 finance rows and exact zero reserved/in-transit stock. It reports opening
blockers separately from deferred runtime or team/role assignments. A report
marked ready while an opening blocker remains is rejected.

`OfficialWorldOpeningBootstrapper` is an explicit E-operated call, not a
startup hook. It accepts only independently pinned mapping, gap, coverage and seed
fingerprints; verifies Core source provenance, source stock quantities,
approved title/risk binding, country coverage and balanced Core ledger
reconstruction; then delegates to the existing store/readback. A matching
fingerprint checks identity, not policy approval. No direct UI/API route and
no automatic Worker dispatch were added. `getWorkerFoundationStatus()`
continues to report simulation disabled.

The corrected C V2 fixed input is
`ef3af983aa9f996f599a392bb244872a3cb59a32` (mapping implementation
`f711869b5265003e12adb29996ad8158cc00fd03`). Its mapping fingerprint is
`sha256:230f8d695c25ea839fb6415de3c4c2985dd6d95e6261fa10dbec73053dedac82`,
gap fingerprint is
`sha256:f374ed3a888305a467f52d0aeaf7c545a6513cf17accc10c9537850694b68e95`,
and complete-coverage fingerprint is
`sha256:8b915aadb1aa299cc1c2529eb8ed996f1e8ff9c8ad5bd7ff88731c6d459efa2d`.
F's real-report read against that exact C checkout accepted all structural
evidence (70 countries, 840 stock cells, 70 finance rows) and returned
`BLOCKED` with six named OpeningSeed gaps. The superseded C report at
`592ccbf5eca3440d87bda51660dddd09f807948a` was independently rejected for
its missing region-to-country association; source records were preserved but
the old country index was incomplete. Neither report is an approved seed, and
this read-only check is not a production readback.

## Complete data scope: source retention is not runtime adoption

The official selected package contains 34 structured JSON datasets in the
following domains. Its `CHECKSUMS.json` has 86 entries. F does not mutate the source package or
relabel a candidate/proposal as an executed World fact. The table records the
Worker/Core carrier boundary for every applicable group; it is not a claim
that every domain has a production persistence adapter.

| Source files / domain                                                                | Current World carrier and adoption boundary                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest`, `assumptions`, `changes`, `coverage`, `opening-material-reconciliation`  | Versioned source/provenance evidence only. Exact bytes and selected-package hash must be retained; no direct World State mutation.                                                                                                                                                                            |
| `countries`, `regions`, `settlements`, `geography`, `illustration-links`             | C's country mapping and existing V27 provenance/calibration preparation can bind source IDs to Core Country IDs. Core OpeningSeed has no population, territorial geometry or settlement field. Candidate profiles/query data are not ledger adoption.                                                         |
| `entities`                                                                           | Source organization identities and proposed institutional bindings. They are not automatically legal title holders, risk bearers, Treasury or central-bank accounts; those require explicit authority.                                                                                                        |
| `commodity-catalog`, `stocks`                                                        | Fixed Core commodity/unit catalog and OpeningSeed inventory entries are the relevant carrier. All 840 source cells must reconcile exactly; 619 positive rows currently lack approved title-holder/risk-bearer binding. Zero stock is not a positive opening entry.                                            |
| `finance`                                                                            | Core OpeningSeed financial batches and GCU ledger are the carrier. Source uses `GCU_SCENARIO_ACCOUNTING_UNIT`, has merged Treasury/central-bank balance and 56 liability/62 equity source discrepancies. The former dry-run silently derived corrections and test entities; F will not reuse them.            |
| `recipes`, `production-plans`, `deposits`, `facilities`, `facility-map-links`        | Existing E08–E12/Core pure preparation kernels can consume approved inputs, but no OpeningSeed field means reserves, equipment and facilities are not automatically instantiated by this seed. Source developed/operational proposals must stay proposals until distinct authority and runtime adapter exist. |
| `nodes`, `transport-routes`, `domestic-access`                                       | Versioned geographic/logistics source and existing trade/logistics calculation kernels; a proposed route is not a built road, port, throughput or executed contract. No OpeningSeed route field.                                                                                                              |
| `seasonal-water`, `water-allocations`, `power`, `land-program`                       | Source climate/land/water/energy facts or proposals. Existing resource/energy kernels are not an audited grant of water rights, energization or land title. No automatic OpeningSeed adoption.                                                                                                                |
| `employment`, `population-services`                                                  | Existing social/labour/household kernels can calculate from approved inputs. Source jobs, schools, hospitals and capacity are not automatically staffed, funded or put in service. No OpeningSeed carrier.                                                                                                    |
| `technology-proposals`, `license-proposals`, `transit-proposals`, `hazard-proposals` | Immutable proposal/source records only. No license, technology authorization, transit right or event is executed by F.                                                                                                                                                                                        |
| `trade-plans`, `supplier-concentration-policy`                                       | Planning and risk source only. No signed international contract, shipment, reserve or settlement is created.                                                                                                                                                                                                  |

The selected 203 map/image assets and their path/hash associations are a
separate static/visual publication responsibility. Existing source-artifact
and country-profile counts do not prove all 203 assets are published or
connected to the UI. E/control reported that the official package has been
copied into production candidate storage with 70 queryable profiles, while
`world_head=0` and `opening_seed=0`; F did **not** connect to production to
verify or change those counts. Source archival, structured query, formal
opening adoption and UI display are four different statuses.

## Current opening blockers and E input boundary

The C V2 record identifies these OpeningSeed blockers: existing production
World ID binding; legal title/risk bearer for positive stock; scenario
currency-to-Core GCU decision; Treasury/central-bank split; 56 source deposit
liability and 62 equity discrepancies. F's admission also preserves separate
deferred team assignments, facility/resource/water/power/employment/social
execution gaps. These are not excuses to omit their source data; they prevent
only unsupported runtime promotion.

When the corrected C V2 candidate passes independent review and the remaining semantic
gaps are formally resolved, an E-only explicit invocation needs the checked-in
`status/world-data-selection.json`, original `CHECKSUMS.json`, map manifest and
`data/regions.json` bytes; exact C mapping, gaps and
complete-coverage JSON; their independently pinned canonical fingerprints; a fully
reviewed Core `OpeningSeed` with an independently pinned fingerprint; and a
canonical UTC millisecond bootstrap timestamp. The seed must bind the one
selected World, official package checksum, all 70 mapped countries, 840
source stock cells and approved financial batches. E must verify the existing
World head and use only the reviewed release/migration chain. It must not
flip historical `activationAllowed=false` source labels to invent approval,
write a second World, execute proposals, assign absent users/roles, or start
simulation. Until source rights and financial semantics are resolved, E must
not call the bootstrapper.

F owns no API, UI, migration, asset-publication or production-connection
change. Formal `status/progress.json` and the original EconMind site remain
untouched. B's narrow independent P0 review of the new F code is pending before
Control Tower can consider merge or E
production execution. Even a passing Worker test does not close C's semantic
gaps or authorize formal adoption.
