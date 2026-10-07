# C — SOC-1 finite employment service source-to-draft increment

## Status

`IMPLEMENTED_UNVERIFIED`; P0 / independent B review pending. Isolated preparation,
`PREPARATION_ONLY_NOT_V09_2_STARTED`. No gate, official seed or runtime promotion.
Implementation commit/tree and exact per-file hashes are recorded in the external
fixed handoff after committing this report, avoiding a self-referential commit.

Checkout: `/Users/samuel/Documents/econclub/.econmind-worktrees/c-social-employment-service`.
Branch: `codex/c-social-employment-service`.
Base: `d16135e83560ee91a1f9f8affcd05dc953bfa418` (approved prior C opening increment).
This branch deliberately does not claim to be current integrated main.

Source backlog: E commit `bb285afe2f6405678b096f84b560aeb07291859a`,
`E_FOUR_OFFICE_RUNTIME_GAPS_2026_10_07.md`, blob
`6b5d856c35c71a7dcfbfabfd2f9f97f98953830c`, byte SHA256
`4bf40b91896ac368919f536975aa440c836b3bedfa72b8b347a2f3caf99fae19`.
Scope is its SOC-1, SOCIAL-U0159–U0191 / U0271–U0279, existing E03, and Root's
explicit assignment. It does not implement SHARED-1/2/3/4 or a new economic formula.

## Implemented scope

Seven files only:

- NEW `packages/core/src/commands/social-employment-service.ts`.
- NEW `apps/world-worker/src/persistence/social-job-match-candidate-source.ts`.
- NEW `tests/world-core/c-social-employment-service.test.ts`.
- NEW `tests/support/tsconfig.c-social-employment-service.json`.
- NEW `tests/support/vitest.c-social-employment-service.ts`.
- NEW this report.
- `packages/core/src/index.ts`: exactly one new public export; prior exports retained.

Plan family `CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1`, Office SOCIAL,
capability `SOCIAL_LABOUR`. Due family `CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1`,
versioned `SOCIAL_JOB_MATCH_RULE_V1`, Office null. Strict payloads contain intent
only, never unemployment/vacancy totals, service capacity or wage-eligibility bools.

Plans reserve finite, explicitly supplied service slots without hiring. Exact due
boundary calls existing `calculateLabourMatch`, then positive actual matched people
use existing `applyLabourFacts`: private `JOB_MATCH` or public
`PUBLIC_SERVICE_OCCUPATION`. Matching decreases the same skill/location searching
pool, fills the actual position, and records actual used slots. Unused reservations
are released; service slots are not a population source. Missing pools/offers/wages
are not replaced by zero. Ineligible current wages yield explicit zero matching,
with no zero E03 fact. There is no graduation, skill boost or wage payment.

Plan/due events carry immutable command/read facts, before/after hashes and real
result. Reducers recompute effects through the existing kernels and reject changed
causation/version/hash/result. Exact repeated commands return prior results, changed
intent conflicts, settled plans cannot settle again, and pre-applied E03 facts
without reconciled service settlement fail closed. State binds plan/operation scope
and service reservations; E03 validates the real labour state against E02 bounds.

Worker source locks/reads existing tables only: submission → original plan (due)
→ active writer lease → head → claimed queue. It validates canonical durable
command, same World/head/sequence/time, lease/fence/authority and source hashes.
It freezes a private copy of reader output and issues a private preparation object;
structural caller preparations are refused. Actual matching produces a real
`AtomicTransitionDraft` accepted by the existing candidate validator. Events,
COMMITTED receipt, typed-result outbox and replay-derived checkpoint are present;
financial/inventory posting arrays are intentionally empty for this noncash action.
No source function inserts/updates SQL or commits economic state.

## Exact shared ports / Root responsibilities

`SocialEmploymentRuntimeSnapshotReader.readFrom` takes the SAME SQL transaction,
canonical command, locked head version/sequence and server observation time. It
must reconstruct the one E03/service slice from a genuinely admitted opening plus
committed events to that head, then supply current legal position/offer/employer,
payroll funding reference, wage version/currency/period/effective interval,
minimum-wage version, E02 availability and finite day/service slots. Reference
syntax and hashes are binding checks, **not** proof of legal ownership/funding or
admission. Root must establish those facts in this reader. Cached UI/projections
and current materializations are not sources of authority.

Reader returns `REPLAYED` with world/head/sequence, opening hash, state/facts and
their canonical hashes, or `MISSING_OPERATING_STATE`. Official construction mode
accepts only `ADMITTED_OPENING_AND_EVENTS`; `TEST_ONLY` requires explicit server
`TEST_ONLY_LOCAL` construction and is refused in `OFFICIAL_RUNTIME` mode. This mode
is not an automatic grant and is not a command payload field.

`SocialAutomaticJobMatchAuthorityPort.assertFrom` is REQUIRED for due work. Root
must verify actual durable causal plan/publisher/grant, versioned automatic rule
and lawful clock boundary on the same transaction/head. No implementation/default
grant is supplied here. Office null, valid schema, a hash or a fixture callback
cannot establish production automatic authority. The plan factory requires a
genuine command-bound capability proof and reauthorizes before and after reading;
the existing atomic transaction cutoff guard remains mandatory.

Root owns shared authenticated intake, family dispatch, real automatic publisher,
single shared event reader/registry, sparse checkpoint/CAS adaptation and the
existing authorized result projection writer. Register the two exported reducers
there; do not instantiate a competing Social engine/table. Proposed derived
materialization key is `SOCIAL_EMPLOYMENT_SERVICE`; its labour member is the
existing E03 slice, not another labour authority. Other E03 events must be folded
into the same shared replay state. Sparse checkpoint version semantics are not
solved by this isolated source and must not be bypassed by forced version bumps.

## Safety and compatibility

The genuine prior `consumeLabourSocialOpeningAdoption` is reused, not recreated.
Missing operating state raises `SocialOperatingStateMissingError`, preserving
`NOT_READY`, `seedAdmissionReady=false`, and all 1066 original missing/incompatible/
title gaps. Approved capacities/targets are not an operational seed. No raw map,
owner original/receipt, source audit, status or prior C implementation was changed.

No migration, grant/RLS, credential, Supabase, DB mutation, API route, startup,
browser, A/F/G/D-owned implementation, merge, push, PR or deployment action.
The same global version, writer lease and atomic repository interfaces are reused.
Legacy paths and generic repository/dispatcher are unchanged.

## Actual validation

Local pinned Node 24.20.0, pnpm 12.3.4; frozen lockfile unchanged. Third-party
dependencies are read-only reused from the verified prior C checkout. Workspace
package links, builds and Vite caches point to this checkout; mutable caches are
not shared. No full dependency installation or local PostgreSQL cluster was run
during this resumed increment. The earlier offline installation failure is retained.

Actual final commands/output/exit codes are in external `checks.json`:

- Core and Worker `tsc -p .../tsconfig.build.json`: PASS.
- Focused test/source `tsc ... --noEmit`: PASS; no skipLibCheck/ignore added.
- SOC-1 plus existing E03, command-receipts and replay regressions: PASS. Final
  exact counts are recorded in the fixed handoff and log, not inferred from tests.
- Scoped ESLint and Prettier: PASS.
- Repository boundaries, authoritative-patterns, safe local environment,
  repository secrets and diff check: PASS in final run.

Initial brand-ID compile errors and fixture source/dist type duplication were
fixed. Including the Vitest configuration itself in focused tsc also exposed
upstream Vite/Vitest declaration errors; config is instead checked by ESLint,
format and actual Vitest execution, while source/tests remain strictly typechecked.
The initial whole-repository boundary check failed on unconnected locked React,
Comlink, fast-check and plugin imports. Verified read-only third-party links were
added, and the unchanged boundary checker then passed. Initial FAIL records are
retained, not relabeled PASS. No business source was changed to hide them.

The new SQL tests are explicitly TEST_ONLY protocol fixtures, not PostgreSQL
storage/locking proof. They execute the actual durable command parser, source,
Core matching, genuine discretionary proof path, atomic candidate validator and
emitted-event replay = actual checkpoint. Automatic positive proof uses a labeled
TEST_ONLY port; missing real automatic port refuses. Revocation is tested both
before candidate entry (zero-effect receipt) and after reading (no draft).

## Incomplete and deferred work

Real PostgreSQL atomic persistence/concurrency/crash recovery, durable automatic
grant/publisher, shared reader/intake/dispatcher/projector/CAS, HTTP/JWT, official
operating seed, browser decision-to-result, production, independent B review,
full repository CI/release and Gate B: `NOT_RUN` / not implemented in this scope.
No one may call these pure/protocol tests a live Social economic loop.

## Next action

Fix immutable candidate/hashes and hand off to Root for independent B review and
its owned shared wiring, then STOP. Do not self-award VERIFIED, activate data,
advance V09, merge or deploy.
