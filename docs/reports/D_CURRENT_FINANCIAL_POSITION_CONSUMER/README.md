# D current financial position browser consumer

## Status

IMPLEMENTED_UNVERIFIED. P0 classified-read boundary; independent review is
PENDING. Source-only parallel preparation, not runtime activation, main merge,
deployment, Gate B or real financial replay acceptance.

Branch: `codex/d-current-financial-position-consumer`.
Parent: `61c6a51233e0b10c3c723b5afa42a5eff2726891`.
Immutable candidate SHA/tree and evidence hashes are supplied in the handoff
receipt outside the commit, avoiding a self-referential commit hash.

Fixed upstream G: `41559a3b93756a51357159e3180c3218fbb24c91`;
tree `73f689ff2b9c291320b086a41098e733452893ad`.
Public contract file SHA256:
`d99a958b941117aaf78f9816db868f36543349d48e33627d2758fb325793bf8b`.
G review remains separately PENDING; consuming its wire does not approve G.

## Implemented scope

- Office readout and original financial-intake FINAL refresh now render current
  opening-inclusive ledger positions separately from legacy net Posting
  movements and event activity. Exact signed strings; no balance arithmetic.
- Shared renderer uses existing drawer/font styles and textContent, collapsed
  provenance, honest empty/denied/unavailable states, no spendable-cash claim.
- Consumer validates schema, exact keys, role/classified availability, sparse
  non-zero entries, genuine account classes, 3-letter currencies, canonical
  signed decimals within the public 120-digit domain, uniqueness, source units,
  head and opening provenance. A malformed carrier exposes neither values nor
  provenance; available legacy movements can remain independently visible.
- Opening seed ID/fingerprint must match the already validated read authority.
  This relationship is evidenced by fixed G provider lines 77–81, not inferred
  from matching display names. Head and event must match; opening version cannot
  be in the future. No source marker alone grants authorization.
- Read-only source boundary: four production UI files, five new test/harness/
  config files, this report. No controller behavior change, Core/API/Worker,
  map, source dataset, original forms, migration, production data or credentials.
- Browser consumes unknown public wire into its own presentation model; no
  copied server DTO, server implementation import, source-path export bypass or
  local settlement. Canonical public subpath is
  `@econmind/core/economic-read-visibility-contract` on fixed G. Normal dependency
  composition remains Root-owned, not silently replaced by D.

## Safety and compatibility

- Missing legacy carrier is unavailable, never zero or a movement fallback.
- Denial and invalid provenance contain no retained financial values. COUNTRY
  and the other four offices gain no current-position access.
- Existing scoped cache rejects changed payload at an accepted head and clears
  the model; this behavior was retained, not weakened to accommodate a fixture.
- Original FINAL, minimum-head refresh, session invalidation and late navigation
  retirement remain intact. Unavailable treasury-spendable-balance fields remain
  unavailable; a ledger position is not usable cash.
- No database, RLS, environment, credential, transaction, clock, replay or legacy
  system mutation. No production financial order was submitted.

## Actual validation

Local environment: macOS; pinned Node 24.20.0, TypeScript 6.0.3; existing frozen
dependencies. Evidence directory:
`/Users/samuel/Documents/econclub/.econmind-artifacts/d-current-financial-position-consumer-20261007/`.

| Check                       | Command / artifact                                                                                                                      | Result                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| New feature baseline        | Vitest new file before implementation; `before.log`                                                                                     | FAIL, 2 expected missing-feature failures       |
| Intermediate expanded tests | `tests.log`                                                                                                                             | FAIL, 2 fixture/assertion issues; retained      |
| Final focused regression    | `vitest run tests/world-web/current-financial-position.test.ts tests/world-web/economic-visibility-consumer.test.ts`; `tests-final.log` | PASS, exit 0, 45 tests (31 new + 14 visibility) |
| Scoped types                | `tsc --noEmit -p tests/world-web/current-financial-position.tsconfig.json`                                                              | PASS, exit 0                                    |
| Scoped lint                 | ESLint seven changed TS files                                                                                                           | PASS, exit 0                                    |
| Architecture                | `node scripts/check-boundaries.mjs`; `boundaries.log`                                                                                   | PASS, exit 0, 268 files                         |
| Focused bundle              | Vite configFile:false; only test fixture + country runtime, copyPublicDir:false; `build-final.log`                                      | PASS, exit 0; not full website build            |
| Browser consumer            | CUA, explicit TEST_ONLY fixture, port 4186; `browser-checks.json`, screenshots 01–10                                                    | PASS, ten bounded checks                        |
| Actual role preview         | Port 4184 existing Trade shell; `11-actual-page.png`                                                                                    | EVIDENCED, NOT_CONNECTED; no live authorization |
| Playable demo preview       | Port 4178 original DEMO_LOCAL; `12-playable-preview.png`                                                                                | EVIDENCED, local sample only                    |

Browser cases: Finance current 13 vs movement 3; original FINAL refresh v3;
session revocation clears model/FINAL; Central Bank current 7 vs movement -3;
sparse empty; negative equity; missing legacy carrier; wrong seed; denied;
other office. These supplied values are OFFLINE TEST_ONLY and do not prove
server admission, ledger arithmetic, real account ownership or replay.
The first positive browser checks preceded a stricter source-unit/class/digit
validation tightening; subsequent checks used the final runtime bundle. No
positive rendering semantics changed. Additional unit checks cover same-head
wrong seed/fingerprint, malformed shape/head/amount/coverage/source units,
COUNTRY and late role/country response retirement.

## Incomplete and deferred work

- G + D normal dependency composition and combined server acceptance: NOT_RUN.
  Read-only merge-tree reported existing add/add and Core/API conflicts. No
  merge or conflict resolution applied; out-of-owner files remain untouched.
- Full web/map build and previous 202/420 suites deliberately NOT_RUN for this
  bounded increment. No native install or load/concurrency stress test.
- Actual authenticated endpoint, Office binding, authorized current position,
  decision-to-result loop, hosting and Gate B E2E: NOT_RUN by D.
- Existing original source display labels may include non-English data labels;
  no source dataset rewrite undertaken in this financial-read increment.
- Next UX work remains role-owned decisions, consequences and recovery in the
  approved country scene; this read-only drawer does not create gameplay logic.

## Next action

Root/B independently review exact D candidate and fixed G, compose approved
dependencies normally with exports preserved, then conduct authorized combined
read/binding verification. No main merge or production use before policy-valid
approval. Existing 4178/4182/4184 previews remain running and retained.
