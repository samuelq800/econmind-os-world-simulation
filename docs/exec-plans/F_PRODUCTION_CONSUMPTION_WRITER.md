# F IND-1 production / consumption writer

PREPARATION_ONLY_NOT_V09_2_STARTED

Status: IMPLEMENTED_UNVERIFIED. P0 immutable candidate requires independent B
review and Root integration. No status/progress, migration, production, seed,
host, frontend, or other Office authority changed.

## Immutable identity and scope

- Base: `afff74f3b7dd3611aa3d8a8d62dc8e9f0eb33c11`.
- Base tree: `a4aebf121ad122010230b4fc7f418421978a10d7`.
- Branch: `codex/f-production-consumption-writer`.
- Checkout: `/Users/samuel/Documents/econclub/econmind-f-production-consumption-writer`.
- E IND-1 backlog: commit `bb285afe2f6405678b096f84b560aeb07291859a`,
  `docs/reports/world-connection/E_FOUR_OFFICE_RUNTIME_GAPS_2026_10_07.md`, SHA256
  `4bf40b91896ac368919f536975aa440c836b3bedfa72b8b347a2f3caf99fae19`.
- Root explicitly authorized the exact inventory/lineage/Atomic union scope.
  The baseline is not advanced to later water/social/financial integrations.
  Core barrel change is only one export; Root must preserve other new exports.
- Source authority: `requirements/source_manifest.json`, MASTER original hash
  `0d4ea011a1291b5bd49c89c1616a7eee29731c2141a4f958e2930acf7189db13`,
  INDUSTRY `042a62b08e2c260acdb308e3f5aa7303c22003cd2de3b92251afec9dbf7c3f81`.
  Used extracted MASTER-U0122 / L01 and Industry actual material/cost requirements;
  no fresh original-document render audit is claimed.

Owned nine files:

1. NEW `packages/core/src/inventory/production-consumption-posting.ts`.
2. Minimal `packages/core/src/inventory/inventory-ledger.ts` same writer.
3. Minimal `packages/core/src/opening/opening-seed.ts` same lineage replay.
4. One public export in `packages/core/src/index.ts`.
5. `apps/world-worker/src/persistence/atomic-transition-repository.ts` typed draft
   validation and persistence denial.
6. `apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.ts` typed
   lineage return and explicit unsupported-schema denial.
7. NEW `tests/world-core/production-consumption-posting.test.ts`.
8. NEW `tests/support/tsconfig.f-production-consumption.json`.
9. This plan / evidence record.

## Implemented protocol, not an official runtime

`ProductionConsumptionEvidence` → `productionConsumptionEventPayload` recalculates
the actual existing `calculateV13Production`, validates all explicit dimensional
recipe coefficients, and binds immutable source facts. The single exact
`INDUSTRY_PRODUCTION_SETTLED` Event must contain that payload; plan Events cannot
authorize output. `createProductionConsumptionPosting` binds command, country,
WorldVersion N→N+1, complete transition and SimTime. The protocol's snapshot
source-version grammar is explicitly `WORLD_VERSION.N`, not inferred from a
mutable branch or arbitrary reference.

Materials use real AVAILABLE E08 accounts, exact commodity/batch/unit/location,
OP title and risk, unique input accounts and a new output batch. Every material
must match current E08 quantity and the hash of the exact inventory snapshot.
No synthetic counter-account or loss operation is created. Recomputed actual
output is the only output, not `outputPerDay` or a client-provided quantity.

The existing internal `applyInventoryPosting` remains the sole stock writer.
Opening reconstruction accepts a typed `InventoryLedgerPosting` union and
rebuilds the same inventory/financial states. Every original movement constructor,
two-leg, same-commodity/batch/unit, bucket, title/risk/location, exact-conservation,
nonnegative-stock and transition-binding guard remains intact.

Replay applies and validates financial facts before physical production. The
production's explicit positive exact cost must reproduce recipe cost per actual
output, resolve a real same-ledger applied batch fingerprint and OP EXPENSE debit,
and match an exact CASH/DEPOSIT payment without negative remaining cash. No cost
or funding default is invented. Recognition metadata lives in existing applied
posting history (not a second ledger), preventing repeated run/outcome,
facility+SimTime, output or previously consumed input batch, and settled expense
leg. The narrow cost port deliberately supports one exact expense/payment pair;
allocation of multi-cost/nonlinear recipes is NOT implemented or silently defaulted.

This is source-level physical posting/replay. FoundationFact syntax and nonempty
maintenance/licence/permission/source references are NOT authorization grants or
proof that official operating state was adopted. A future server candidate source
must resolve legitimate facility, maintenance, technology and permission facts
from the current authoritative snapshot and normal cutoff authorization.

V13 energy, labour and logistics before/use/after proposals are retained in the
bound result; this E08 slice DOES NOT mutate E09 allocation or E03/logistics state.
Those domain writers must join the same future atomic settlement before a real
Industry economic loop can be claimed. No GDP/valuation posting is emitted.

## Schema blocker, deliberately fail-closed

Read-only checked fixed-base artifacts:

- `0007_world_v2_atomic_transition_facts.sql`: inventory operation CHECK admits
  only RESERVE / RELEASE / SHIP / DELIVER.
- `0009_world_v2_posting_payload_integrity.sql`: exact inventory-posting-v1 shape,
  exactly two legs, one commodity/batch/unit, delta total zero.

The new production protocol cannot be stored under these constraints. Atomic
draft preparation validates the new constructor/intent, but repository commit
throws `PRODUCTION_PERSISTENCE_SCHEMA_NOT_ADMITTED` BEFORE opening any database
transaction. Durable replay also refuses an unsupported production payload;
there is no unsafe casting into the movement parser or the old table.
Root owns a later single-path migration proposal/review; this candidate neither
edits SQL nor admits durable production. Native PostgreSQL crash/concurrency,
production persistence, API/dispatch/UI wiring and official 70-country operation
are NOT_RUN / NOT_IMPLEMENTED, not PASS.

## Verification and retained intermediate failures

Pinned Node 24.20.0 / pnpm 12.3.4; clean `env -i`, local only. Offline frozen-lock
install reused 161 packages, downloaded zero; sparse checkout excludes large
map public assets, artifacts and original binaries. No map build / whole suite.

Initial Core compilation rejected string-vs-bigint SimTime comparison, an
exhaustive-union redundant comparison and unused import; fixed without weakening
guards. Focused test typecheck identified real API fixture differences
(transition time is command time, literal ratio unit, reconciliation inventory
status, SQL mock query and authorization guard); fixed the fixtures.

Initial new consumer: 16 PASS / 1 FAIL. A zero-cost refusal reached the coefficient
guard because Decimal `isPositive()` includes positive-signed zero. Corrected new
protocol checks to strict `greaterThan('0')`; kept zero-cost assertion and added
zero-output regression. This was not a success claim for the failed run.

Focused successful matrix: 62 PASS across six files (22 new, 11 inventory,
11 opening reconciliation, 11 financial posting, 4 real V13/V14, 3 bounded
inventory properties). Actual fixture: potential 10 tonnes → energy bottleneck
actual 3 tonnes; ore opening 8 − use 6 = closing 2; steel opening 0 + production
3 = closing 3; actual funded cost 6 GCU, cash 100→94, WorldVersion 1→2.
Two rebuilds match; snapshots reconcile; duplicate lineage/run/batch/outcome/cost,
wrong source/title/unit/recipe, mixed version/snapshot, fake usable balance,
missing rights/maintenance, zero output/cost, forged posting and unfunded cash
refuse without returning mutated stock. Actual private Atomic candidate refuses
storage with zero mock transaction/query calls.

Final checks, all exit 0 / PASS: Core and Worker build; strict focused typecheck
using `tests/support/tsconfig.f-production-consumption.json`; scoped ESLint;
Prettier for all nine changed files; git diff --check; authoritative patterns
(232 files, 77 Core); boundary check (237 files); safe environment
(`databaseConfigured=false`, `NOT_LINKED`, `databaseMutationAllowed=false`);
repository secrets (2054 files). Final focused six-file Vitest matrix: 62 PASS,
7.79 seconds, no PostgreSQL services started. Existing water 59 tests and old
physical candidates were not rerun.

Disk interruption retained: initial worktree creation failed ENOSPC before
changes; F deleted nothing. After Root's explicit space-restored instruction,
one sparse independent worktree creation succeeded. No retry storm or cleanup
of another window's source/preview was performed.

## Handoff and stop

Freeze/push this exact candidate for independent B review; no self-merge,
self-approval or release. Candidate commit/tree are reported externally to avoid
self-referential commit text. Root must combine the one-line public export with
other approved exports, then integrate through normal reviewed mainline.
All six roles remain required; completing this Industry E08 slice is NOT completion
of Industry or the six-role construction. Water/physical frozen evidence remains
unchanged. After handoff, stop at the review/schema/source/runtime boundaries.
