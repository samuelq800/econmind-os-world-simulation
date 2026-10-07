# EconMind World Simulation V2

This is the dedicated World Simulation V2 repository. It does not modify or
deploy the original EconMind main site. There is one authoritative World/Core
path; the product must not create separate ordinary-World and Season-1 economic
engines or hidden buffs.

## Current integration snapshot (2026-10-07)

[Current source integration and remaining runtime connections](docs/reports/world-connection/O_ONLINE_SOURCE_COMPONENTS_2026_10_07.md)
records reviewed PR90/91/92. Opening reconciliation and the canonical Seed
bridge, real Supabase JWKS signature verification, and a PostgreSQL current
permission/seed/head facts reader are merged. They remain opt-in: no default
authenticated endpoint, user seat, admitted World, economic Worker or clock was
installed by these merges. Real local crypto and fixture SQL checks are not
production keys, TLS, deployment-role permissions or economic activation.

The opt-in HTTP read transport is also independently source-approved and
included in this update; its default route remains unmounted. Full server read
binding still requires durable seat and
admission records and exact projection/readback mappings. Human opening
economics and API/Worker hosting remain unresolved. Formal World is still
NOT_STARTED/HOLD; Gate B is PENDING. The October 6 public-source and HOME
evidence below is retained, not rerun or promoted to gameplay acceptance.

### Retained October 6 checkpoint

Current data-interface checkpoint:
[source connection and remaining write boundaries](docs/reports/world-connection/O_DATA_INTERFACE_CHECKPOINT_2026_10_06.md).
Eight current public reads passed, including country coverage, the 34-source
directory, exact finance/mineral/facility source identities and climate data;
the exact HTTPS Origin and credential-free CORS matched. Stale wiring-matrix
labels are corrected only to evidenced read-only scope. No import, production
permission change or economic activation followed. C and E are preparing the
same-World successor connection and policy operator; execution remains NOT_RUN
pending fixed-candidate independent review and a separate bounded authorization.

Latest bounded acceptance record:
[420 online HOME/source acceptance and runtime boundaries](docs/reports/world-connection/O_ONLINE420_PAGE_RUNTIME_2026_10_06.md).
The fixed published source `0ec30a28d19f4ae51d81edad42d0598c356dc127`
(Pages `37188781902`) now has accepted evidence for all 420 country/Office pairs,
840 desktop/mobile HOME cells and matching hashes for all 840 selected images.
Countries 01/70 reuse same-version prior evidence; the other 408 pairs were newly
traversed. Original failures, retries, late observations and body-read
INCONCLUSIVE records remain separate. This is HOME/read-only source acceptance,
not all HUD fields, every map pin, 120 Office modules, full gameplay or Gate B.

PR76's actual native PostgreSQL CI `37330480159` proves one isolated inventory
reservation (AVAILABLE4→2, RESERVED0→2 tonne, WorldVersion0→1 and one FINAL),
not payment/Ship/Deliver or formal 70-country activation. Reviewed PR80 combined
the bounded source deadline and explicit trusted staged UI entry, then merged
as `dcc921dbafd48d021dc1605ce7f1946b8b50b614`. Its current-base no-deploy CI
and independent code/binding reviews passed. The automatically triggered Pages
run `37347162279` completed SUCCESS on that merge SHA. Root's bounded native
desktop smoke of 01/Trade and 70/Finance confirmed correct hydrated country
views; the new runtime drawer shows no host and disabled execution controls.
Initial local-sample loading content and plain runtime-drawer styling remain
known limitations. This is not a repeated full420 acceptance of the new release.
Default published runtime host remains absent/fail-closed. The separate local
fixture's restricted permissions were actually installed and freshly read back;
complete preflight, opening seed, signed approval preparation and initial
projection passed. Browser enqueue/Worker/FINAL remain NOT_RUN: one attempt
stopped at a blank local page, then a reviewed continuation stopped at an agent
browser-control error before tab creation. Root's independent no-DB native
display check verified the corrected `.mjs` MIME and rendered page. The original
test command is now expired and must not be extended or replayed. See the
[actual local permission/runtime checkpoint](docs/reports/world-connection/O_LOCAL_PERMISSION_RUNTIME_2026_10_06.md).

Formal World remains NOT_STARTED/HOLD and Gate B PENDING. World/head/seed
binding, legal stock ownership, GCU interpretation, Treasury/central-bank
funding semantics, exact bank opening closure and the production execution
path remain separate conditions. No missing amount is invented, no combined
balance is counted twice, and proposed facilities are not treated as operating.

### Retained October 5 checkpoint

Latest connection checkpoint: [official interface connection](docs/reports/world-connection/O_OFFICIAL_INTERFACE_CONNECTION_2026_10_05.md).
The actual reader-v2 update `37136193366` is verified, and discovered Pages
publication `37188781902` already has `CONFIGURED_READ_ONLY` at
`https://world.econmind.group/`. A real country-01 Finance browser read matched
the exact Treasury/CB source field. PR #71's bounded remaining-data audit tool
is merged; its single authorized traversal completed with 511 HTTP200 reads,
303/303 new groups verified, 22 complete new datasets, 70 country details and
210 country associations. Together with the preserved 12 earlier dataset
results, this is mixed-version source evidence, not same-version full PASS.
G's bounded online checks cover countries 01/70 across all six Offices:
24 desktop/mobile HOME views, 12 selected desktop metric matches, 12 mobile
source-detail entries and four atlas returns. Offline provenance checks found
no missing mappings in 1,260 HOME metrics or 5,496 site fields. This does not
claim all-country online acceptance, live economic state or Gate B approval.
The October 3 checkpoint below is retained as history and is superseded only
within this new record's explicitly verified scope.

### Retained October 3 checkpoint

Code baseline: main `66d57ec3a2bfa47d2d2081ee746214c111795105` (October 2 UTC / October 3 Shanghai checkpoint).
The [October 2 integration supplement](docs/reports/delivery/WORLD_V2_INTEGRATION_SUPPLEMENT_2026_10_02.md)
updates the earlier [October 2 delivery report](docs/reports/delivery/WORLD_V2_DELIVERY_REPORT_2026_10_02.md) and
supersedes the dated capability summaries below. It separates code integration,
Pages publication, database publication, live API access and economic execution;
it does not replace the formal gate ledger in `status/progress.json`.

| Layer           | Verified scope                                                                                                                                                          | Remaining boundary                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Official source | 87 source artifacts; all 34 JSON datasets mapped; 203 map-package files catalogued                                                                                      | Source preservation is not runtime economic adoption                                                                                                            |
| Supabase        | Balanced source and 0021 full-source permissions evidenced; actual readback 37036290594 confirms exact veto policies and ledger22 currently present                     | Original publication run remains UNKNOWN; current readback cannot prove missing historical full ACL/bucket comparisons. No LOGIN or economic activation         |
| API code        | Actual snapshot release 37130549747 passed: all 34 JSON bytes verified, new read-only Edge ACTIVE, GET/OPTIONS/CORS passed; old seven function identities unchanged     | Complete dataset/country API audit is in progress; Pages API configuration remains disabled. Source snapshot is not runtime state; old DB path remains HOLD     |
| Page code       | Responsive Root camera, role layout and partial mobile drawer fixes merged; original and post-fix 840 HOME images actually reviewed; bounded online c135 samples passed | Drawer glyph-prefix loss remains INCONCLUSIVE; mixed source labels/66 decorative cluster retained. API config disabled; no full gameplay or all-page acceptance |
| Opening / gates | Admission and transactional seed-readback code merged; PR #32 passed B review and exact-SHA full CI                                                                     | Six recorded opening-semantic gaps remain; Gate B remains PENDING                                                                                               |

Lobby entry and team/person/office assignment are intentionally deferred by the
owner. Public official-source connections can proceed without inventing those
assignments. Neither a green CI nor a merged UI implies a production release.

The [complete visual baseline and repair record](docs/reports/world-connection/O_FULL_VISUAL_BASELINE_2026_10_03.md)
binds every country/role/screen to retained evidence. Pages run `37026163647`
successfully published the 203-file map directory; six actual HTTP readbacks
matched the fixed deployment bytes, including three original map samples.
This does not claim remote hash verification of all 203 files or economic activation.
Main-site policy run `37031019041` ended with `SNAPSHOT_POLICY_PUBLICATION_EVIDENCE_INVALID`;
the database commit/rollback state is unknown. Its temporary release lock was
retired. A separately authorized current-state readback confirmed the exact veto
policies and ledger22; it does not rewrite that historical UNKNOWN result.
After a fresh permission preflight, the single snapshot publish run `37038527126`
stopped at key selection before any Storage call or Edge deployment. The subsequent
single metadata-only run `37042407081` observed two current selector candidates
(one modern service-role secret and one legacy service-role key), without selecting
or using a key. This does not establish the historical failure's cause or key validity.
Its diagnostic lock was retired. Main-site #90 corrected admission; its separately
authorized publish `37044748085` stopped at the first bucket read, with zero writes.
The #91 single diagnostic `37128962923` observed HTTP400/NoSuchBucket; this does
not prove absence, credential usability or the historical failure cause. The #92
strict bucket-only compatibility fix passed independent review and CI, then
merged as `fc5c328965403cbbbf9b77a3639559cc7bb619df`.
The new single release `37130549747` succeeded: all 34 fixed JSON objects were
publicly byte-verified, the new reader was deployed, and GET/OPTIONS/CORS passed.
The release lock was retired. The receipt does not count newly created objects
separately, so this is not a claim that 34 new object POSTs occurred.
Complete API readback and Pages connection remain pending; no LOGIN, World/Core,
Worker, command execution or Gate approval follows from this source release.

## Official 70-country data selection (2026-09-28)

The project owner selected the complete, immutable 70-country balanced package
as the official World V2 **source-data baseline**. The single machine-readable
selection record is [`status/world-data-selection.json`](status/world-data-selection.json):
it pins all 87 source artifacts (including their checksum manifest), 70 country
records, total population 14,712,146,434, and the separate 203-file map asset
manifest by SHA-256. Run `node scripts/verify-world-data-selection.mjs` to
verify the selection against the bytes on this checkout. Earlier map-locked
country numbers are not the selected economic baseline.

The selected data retains its field meanings. Proposed contracts, permits,
team assignments and 350 legacy development options are not executed facts or
operating facilities. Three current atlas snapshots differ from the frozen
balanced inputs; display assets do not silently replace the selected numerical
geography. The source package's historical candidate labels remain unchanged
for provenance. This selection does not itself create a World ID, commit an
OpeningSeed, start a Worker, write to Supabase, or change Gate status.

## Owner-selected page UI

The sole selected page UI is the Season 1 immersive experience at
`apps/world-web/public/season1-immersive/`. The World V2 Pages home route
now mounts the reviewed root atlas with links into the selected country pages.
The exact owner handoff and source-archive hash
are pinned in [`status/ui-selection.json`](status/ui-selection.json); the
published runtime files are checked against the delivered manifest by
`pnpm test:authoritative-ui`. The older React page remains at `legacy.html`
for reference. No original EconMind main-site files are changed.

The selected immersive country pages and their atlas bind their opening numbers to the
selected 70-country package: 14,712,146,434 people, 1,374 facility records,
and 240 geological deposits. `pnpm test:authoritative-ui` checks the generated
country files against that pinned package. The original UI archive's older
14,714,012,813-person preview remains only as historical source provenance.
See [the numerical binding report](docs/reports/ui/OFFICIAL_OPENING_DATA_BINDING_2026_09_29.md)
for field meanings and coverage. The page remains non-authoritative: static
opening displays and local planning coexist with an opt-in source-data drawer.
The approved read-only source reader is configured and the fixed October 6
HOME/source evidence above supersedes the earlier disconnected-drawer status;
the official opening inputs are not a committed World State, and login,
authoritative commands, settlement, live prices and receipts are not connected.
Settled country-scoped views retain their selected source, not the older North
Harbour sample ledger. A transient local prototype journey observed during
country loading remains a bounded UI timing limitation, not a live World clock
or accepted country economic state.

The root explorer now lazily loads hash/byte-bound country files from the same
selected balanced package. Dynamic numbers and the complete 1,374-facility
directory no longer use the illustrative geographic-scenario statistics.
The 986 facilities without source map anchors remain in the directory without
invented positions. Existing geometry and baked artwork remain historical
display assets, not numerical authority. Source details preserve exact decimal
tokens, units, time-basis uncertainty and field provenance; failures show a
disconnected state and read-only retry, not old-number fallback.

Six-role HUD and local-preview inputs expose source inspection. A verified
source match, when the approved read-only API is configured, is still not live
World State. Shared visual styling is adapted from fixed main-site files without
changing that product; the original UI archive remains immutable and publication
verification permits only the exact reviewed stylesheet integration.

## Historical code integration (2026-09-27)

This is the retained September 27 snapshot, not today's schema count or
connection status. Use the October 2 delivery report above for subsequent evidence.

The reviewed main-site release chain has now published the isolated `world_v2`
schema to the shared Supabase project: 17 exact migration records and 21 tables,
verified by release run `36310359277` and live read-back. The existing 114 public
tables and protected legacy catalog fingerprint are unchanged; browser roles
have no World schema usage or table write grants. No World data was seeded.
The optional `/v1/season1/my-team` API is also integrated, default-off, using
the existing Season 1 RPC. Real upstream rejection checks passed; a valid
signed-in roster read and UI/session/TLS deployment remain unverified. See
[database release and connection evidence](docs/reports/gate-b/SUPABASE_SCHEMA_PREFLIGHT_2026_09_27.md).
This does not activate economic execution or approve Gate B.

Independently reviewed and integrated: browser session-liveness fix, immutable
Buyer Finance approval references, native approval reader, durable staged
command intake with the Worker lock-order fix, and local staged HTTP
registration/signature/reference/enqueue/read. The staged HTTP candidate
`19dbc3a` passed native PostgreSQL plus HTTP 19/19; its test composition uses a
test SQL adapter and reaches QUEUED, not economic execution or FINAL.

At this historical checkpoint the functional gap was a reviewed server-side bridge from durable
approval/Command authority to branded Core contexts, followed by real Reserve
candidate/queue execution. Existing UI/maps, engines and opening/lineage
modules are reusable, but default fixture UI, full World initialization/NPC,
forecast-model wiring and deployment remain separate work. No original-site
or production database change, product release or Gate B approval is implied.
See [the live code-completion record](docs/exec-plans/CODE_COMPLETION_2026_09_27.md).

## Earlier capability baseline (2026-09-24)

The following dated baseline is retained for context; later slice evidence
above supersedes its older local-integration and test-coverage statements.

The repository has more than a foundation scaffold. `packages/core` contains
deterministic economic, command, ledger, replay, and preparation modules;
`apps/world-worker` contains authoritative-execution infrastructure;
`apps/world-api` contains command/query integration modules; and
`apps/world-web` contains a map, six-Office UI, authorized-client and forecast
preparation. Recent V27 provenance, calibration-closure and NPC-intent modules
are **non-production preparation**, not a generated 70-country World. A
manifest checker now lists missing 70-country source and parameter coverage
without inventing values or authorizing initialization.
A reviewed, inert V27→V28 shared-Core input composition is integrated; it
cannot initialize a World or select an Orchestrator.
V29 now has a source-to-evidence gap baseline and a strict candidate-bound
evidence-claim helper (all 139 requirements default to `MISSING`) plus an
inert source-to-parameter-to-event traceability helper; V30 has a deterministic,
non-network load-plan/latency-summary helper for 50/100/420 virtual sessions.
V29 also has a test-only two-country 600/1000-day exact-ledger/replay harness
and a disposable-PGlite driver for one real Worker goods-delivery commit/retry
with a fixed-sequence durable replay check. A second test now commits two
different deliveries in sequence and checks each exact inventory/financial
posting and idempotent retry;
V30's injected runner is bounded and has no built-in service target.
V30 also has a caller-reported recovery measurement helper that cannot prove
an actual backup restore, plus PGlite-only authorization negative tests that
do not prove PostgreSQL RLS.
These preparations are not a real 70-country World long run, measured load
test, security acceptance or V29/V30 gate pass; see [`docs/reports/V29.1/PREPARATION_GAP_AUDIT.md`](docs/reports/V29.1/PREPARATION_GAP_AUDIT.md)
and [`docs/reports/V30.1/IMPLEMENTATION.md`](docs/reports/V30.1/IMPLEMENTATION.md).

At this September 24 baseline, the runnable API exposed health/readiness only.
That description is superseded by the merged opt-in source routes above.
The then-default web prototype was `LOCAL_FIXTURE`; an authorized local read required
an explicit trusted-host opt-in and is not mounted by the default entrypoint.
An optional local-only final-receipt lookup and web command/UNKNOWN-receipt
loop are now integrated as unactivated preparations; the web lookup port is
also merged but still requires a real trusted-host transport and live E2E.
A separate development-only audit host renders `NOT CONNECTED` without a
trusted injection and is excluded from the production web build.
This historical evidence did not prove an end-to-end authorized browser
command/receipt flow, live forecast model, production database rollout or
product release. Later schema/source-readback evidence is recorded above;
it does not establish the remaining runtime claims.

**Gate B is PENDING.** A narrow cleanup-decoding fix now passes the disposable
PostgreSQL fault runner, V09/V10 recovery suites and official `pnpm check`
on the same frozen code candidate (`ca5b056`, Actions run `35950584759`).
The previous main-candidate check failed in a V00.2 shutdown-test timing
race; a test-only fixture removed that race without dropping its repeated-
signal assertions. This is code/CI evidence, not dedicated staging evidence.
The later merged-main code SHA `21d43ae` passed official `pnpm check`,
disposable V09/V10 PostgreSQL evidence, and a separate native PostgreSQL 16
synthetic-role/RLS negative run; these do not close the remaining gate items.
Dedicated non-production staging/TLS,
deployment-role/JWT-backed RLS evidence beyond synthetic disposable PG16
negatives, two-country/two-Office browser E2E, and
final independent Gate B review remain open. See
[`docs/reports/gate-b/CURRENT_GATE_B_STATUS.md`](docs/reports/gate-b/CURRENT_GATE_B_STATUS.md)
for exact runs, scope, and the next evidence route. No green local test or
merged preparation module is Gate B approval.

`status/progress.json` is the formal governance ledger and still lists V09
onward as `PLANNED`; it has not been silently promoted to match merged
preparation code. PR75 reconciled the descriptive ADR-18 blocker wording with
the already-approved isolation record; historical required-gate identity and
PENDING status remain. PR79 aligned the stale test expectation and strengthened
the isolation-only/unapproved-economic-decision assertions (11/11 focused and
14/14 read-only governance checks). Neither change promotes runtime readiness.
At the retained September checkpoint the V28 single-World candidate remained
outside main while the older two-orchestrator V28.1/ADR-14 contract was being
reconciled.

## Frozen toolchain

- Node.js 24.20.0
- pnpm 12.3.4
- TypeScript 6.0.3
- Vite 8.2.2
- React 19.2.8
- Vitest 5.0.0
- ESLint 10.10.0
- Prettier 3.9.6

Use the exact Node and pnpm versions above. Installation fails closed when the
active versions differ.

## Workspace responsibilities

- `apps/world-web`: non-authoritative browser UI and derived local state.
- `apps/world-api`: authentication, command, and query boundary; its current
  process entrypoint is not the complete integration route.
- `apps/world-worker`: authoritative execution host, never imported by web.
- `packages/core`: deterministic domain logic without React, browser APIs,
  Supabase SDKs, or arbitrary persistence writes.
- `packages/testkit`: shared test support. Other shared packages are added only
  when a concrete implementation needs them; repository ownership boundaries
  still apply.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test:v09:postgres
pnpm test:v10.4:postgres
```

The PostgreSQL commands require an explicitly confirmed disposable local/CI
database. The manual `Gate B disposable diagnostic` and V30 disposable restore
GitHub Actions workflows use short-lived PostgreSQL services and record their
exact checkout SHAs; neither replaces dedicated staging or authorizes Gate B.

Use `pnpm supabase:safe -- status` for the repository-approved Supabase status
check. Never run development migrations or resets against the shared
production Supabase project. See `docs/runbooks/ENVIRONMENT_SAFETY.md` and
`AGENTS.md` before integration work.
