# A — isolated World Clock P1/P2 implementation frontier

2026-10-11. Local unregistered candidate, P0 by affected boundary.
`IMPLEMENTED_UNVERIFIED`; blocking independent implementation review remains.
P1/P2 name isolated stages, not lower FAST_MAINLINE risk classes.

## Fixed source and scope

- Base main: `e652485b4c76aba4a04b211889076341e551f9a5`.
- Base tree: `346e97a5dc4fbe6c48e6f48f5639f55f54258fb5`.
- Branch: `codex/a-isolated-clock-p1-p2-20261011`.
- Frozen design: `12705cf422a8e4e17d3059d1372af78e54cd8969`, tree
  `2e3561c36646d1d5f1f9ff990b946847beb63298` (original checkout untouched).
- Design document SHA256:
  `6f471fa660d62247ebdf738f8b3bc8d40d6a7b61dc7197651d3920d10667cf0b`.
- F design review SHA256:
  `909b37e55bf7b55292ec3103b2ded107d41180f40d2a5588b8fcb1a5f5dd77f9`.
- F decision: `APPROVED_FOR_P1_P2_ISOLATED_ONLY`, fixed C1–C7 apply.
- Root supplied Stage1 PR136 merge and explicit isolated implementation authority.
  PR136 CI success is not a World gate approval; historical failures and
  `CI_CAUSE = OPEN` are not cleared by this work.

Only two new Worker-private modules, one unnumbered SQL proposal, focused tests,
owned test support and this evidence/frontier document are in scope. No existing
Core, SqlDatabase, PostgreSQL adapter, supervisor, repository, consumer, package
exports, migration manifest, progress or ADR records change.

## Implemented mechanics and boundaries

1. `clock-contracts.ts` uses canonical exact-field bytes and nonnegative bounded
   integer strings/BigInt. Core alone converts real milliseconds to ticks. The
   operation allowlist is INIT, ADVANCE, PAUSE, RESUME. The immutable fixture base
   may contain a finite predeclared event list, but no schedule/add/complete/import
   port is exposed. RUNNING advances from durable anchor; PAUSE accounts for the
   preceding active interval; RESUME resets anchor without accumulating downtime.
2. Each accepted record stores complete canonical base, intent and source bytes,
   World/environment/base genesis, source protocol/version/epoch/provenance,
   original recorded observation, before/after anchors and active interval,
   operation identity/kind, expected revision/predecessor, holder/fence,
   Core/clock/order versions and before/after bytes/hashes. Recovery replays every
   original input and compares full canonical record and head bytes. The accepted
   source bytes must still be retrievable from immutable fixture storage.
   Canonical JSON, hashes and references never authenticate real time/control.
3. `durable-world-clock.ts` applies through one existing SqlDatabase transaction:
   actual SQL0005 L→H guard, immutable source locks, K lock, full lineage read,
   fresh database real observation, revalidation of already-held L/H, journal
   append and K CAS. K/source waits cannot reuse only the earlier lease time.
   Economic H WorldVersion/event_sequence are checked but not incremented.
4. Exact original-intent retry returns the stored original output, without
   advancing, refreshing anchor or resampling an active interval. Lease validity
   is independently rechecked. Distinct stale predecessor operations and same
   id/different intent fail with no partial K/input publication.
5. Mutation failure halts the adapter; no invisible retry. Known rollback remains
   distinct from UNKNOWN. Known commit ACK plus incomplete cleanup remains
   COMMITTED + CLEANUP_INCOMPLETE. An ordinary adapter release exception lacks
   phase evidence and is conservatively UNKNOWN. Recovery uses a fresh single
   repeatable-read, read-only transaction. Superseded original results never
   rewind current K. Missing input is UNKNOWN_NOT_RECORDED, not proof of rollback.
   Recovery errors halt; successful recovery does not automatically unhalt.
6. The real factory is unconditionally DENIED, with no configurable positive
   resolver. The separate positive fixture factory is explicitly TEST_ONLY.
   Fixture DML/TypeScript interfaces are not authority or positive publisher ACL.

## SQL and native fixture ownership

`database/proposals/isolated-world-clock.sql` is unregistered and unnumbered.
It creates only isolated Clock input/head tables, bounded columns, unique
operation/sequence, head lineage foreign keys, input mutation veto, FORCE RLS
with no policies and PUBLIC revocations. It has no roles, positive grants,
manifest entry, publication function, admission, seed, timer or host caller.

Only the test harness creates an isolated source table, fixture Worlds/leases,
nonadmin/NOBYPASSRLS/NOINHERIT TEST_ONLY writer and reader and positive fixture
policies/grants. The writer can raw-DML K and has H/lease UPDATE column privileges
needed by actual invoker row-lock SQL. This is explicitly NOT an execute-only,
non-bypass publisher. A native corruption test demonstrates that K capability
and proves subsequent full-lineage recovery refuses the mismatch.

The runner pins Node24.20.0 and PostgreSQL16.15, refuses forwarded connection
URLs/PG settings, makes new UID-owned private data/socket directories and marker,
disables TCP, checks actual server identity and empty schema, validates complete
current migration provenance, executes only the historical frozen22 fixture plus
the unchanged original admission veto and this unregistered proposal. Approved
0023 remains a validated but unexecuted suffix. No production connection occurs.
Owned disposable clusters are stopped by identity-checked cleanup and retained
for evidence, not recursively deleted. Reader/raw immutable DML/role restrictions
are only the concrete capabilities tested, not all-role construction approval.

## Focused acceptance and evidence discipline

- Seven pure tests: exact conversion/due order, partition equivalence (not equal
  journal hash), lifecycle/downtime, invalid bindings/overflow/regression,
  full-byte replay corruption, legacy/nonprefix restore, real default-denial and
  failed recovery halt.
- Thirteen native tests: nonadmin actual guard and no economic footprint; retry,
  intent conflict/stale/H-version refusal; dual-writer CAS; L/H/K blocking and
  other-World independence; lease expiry across K wait; takeover/durable anchor;
  pause/resume restart; five precommit fault points; sent/not-sent COMMIT and
  unconfirmed rollback; known/unknown cleanup outcome; MVCC recovery; concrete
  fixture ACL/corruption; immutable base/epoch/World/source mismatch refusals.
- Existing Core clock/scheduler/order regressions remain required and unchanged.
- Final clean fixed-candidate checks and exact immutable subject/log hashes are
  recorded separately in the retained handoff, not inferred from these test files.
  Development runs are never relabelled frozen evidence.

Preserved development history: dependency-link setup initially used nonexistent
calibration/root decimal.js paths; the first Core build failed, then passed after
using the existing package-specific dependency. Initial focused typecheck caught
test API names/return shape/status mismatches and a fixture proxy syntax error;
these were fixed. First native run passed10/12, with two test-harness/expectation
failures: recovery reused a cleanup-fault transport; a wrapped cause was asserted
as a top-level message. They were corrected with fresh recovery and exact cause
assertions; the next development run passed12/12. One additional native refusal
test was then added. Initial lint caught unsafe-finally throws in test cleanup;
validation was extracted into the owned cleanup helper. None of these failures
is deleted or converted to PASS. Final runs are separately labelled.

## Legal endpoint / explicit unresolved work

```text
CLOCK_P1_P2 = IMPLEMENTED_UNVERIFIED
REAL_CLOCK_SOURCE_AND_CONTROL_AUTHORITY = NOT_ESTABLISHED_DEFAULT_DENY
REAL_PUBLISHER_NON_BYPASS = NOT_PROVEN
P3_CONSUMER_CUTOFF_AND_ADR03_INTERPRETATION = NOT_IMPLEMENTED_NOT_APPROVED_HERE
P4_ECONOMIC_COMPLETION = NOT_IMPLEMENTED_NOT_APPROVED_HERE
P5_ACTIVATION = NOT_AUTHORIZED
WORLD_CONSUMER_TIMER_START = NO
FORMAL_WORLD_CREATION_ADMISSION = NO
ALL_ROLE_CONSTRUCTION = NOT_ESTABLISHED
PRODUCTION_ACCESS = NO
PUSH_MERGE_DEPLOY = NO
```

After-H/K observation is not an approved reinterpretation of ADR03 authoritative
transaction start. No getter/cutoff witness or Command/Event intended-time change
is implemented. Clock-only completion, economic dispatch, real grants, positive
source/control registration and production migration publication remain outside
this candidate. No P3/P4/P5 or six-role acceptance may be inferred. Independent F
implementation review must bind the frozen candidate before further authority.
