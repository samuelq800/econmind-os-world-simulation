# World Core Sprint Execution Plan — V06 through V10.4

## Observed baseline

- Observed on 2026-09-09 after fetching current remotes.
- Foundation branch: `codex/foundation-v02-v05`.
- Gate A: `PENDING`; independent approval is not present in the repository.
- Targeted remediation: code candidate `47fe5c5d465748370d9a8ea046bc443978437203`,
  evidence HEAD `b383904573b2959b3f22ea6d8ded4d02c3582b83`, status
  `PENDING_RE_REVIEW`; passing candidate evidence is not approval.
- V02.1-V05.3: `IMPLEMENTED_UNVERIFIED`.
- V06.1-V10.4: all `PLANNED`; V06 `next_step_ready=false`.
- Planning branch: `codex/world-core-planning`, created from Foundation evidence
  HEAD `1a950a41567900761d4f4313092ab4a3404e6f67` to avoid changing the branch
  under review.

This plan changes no implementation status, runtime, schema, environment, or
Gate A evidence.

## Milestone outcome

By V10.4, one authenticated and authorized two-country commodity transaction
must travel through the only command path and produce an exact, idempotent,
atomic, replayable, recoverable inventory-plus-GCU settlement. Failure produces
zero authoritative mutation. The milestone proves World Core, not E16 Trade or
E17 FX.

## Scope

```text
V06  E01 clock, scheduling, pause/resume and deterministic ordering
V07  commands, immutable events, receipts, idempotency and replay
V08  conserved inventory and balanced GCU posting primitives
V09  single writer, WorldVersion, atomic transaction and recovery
V10  authorized projections and first two-country vertical slice
V10.4 Gate B candidate and hard evidence
```

Excluded: E02-E18 economic behavior, full Trade/Banking/FX/Fiscal logic,
tariffs, customs, shipping economics, sanctions, map, forecast, 70-country
initialization, NPC, orchestrators, gameplay UI, production mutation, and V11.

## Governing contracts

- Architecture: `docs/architecture/WORLD_CORE_CONTRACT.md`
- JIT decisions: `docs/architecture/WORLD_CORE_JIT_ADR_PACK.md`
- Owner decision handoff: `docs/architecture/WORLD_CORE_OWNER_ADR_DECISION_PACK.md`
- Remediation reconciliation:
  `docs/planning/WORLD_CORE_REMEDIATION_RECONCILIATION.md`
- Post-Gate sequence:
  `docs/planning/WORLD_CORE_POST_GATE_RECONCILIATION_CHECKLIST.md`
- V06 preflight: `docs/exec-plans/V06_EXECUTION_PREFLIGHT.md`
- Batch policy draft:
  `docs/governance/WORLD_CORE_BATCH_CANDIDATE_POLICY_DRAFT.json`
- Step sequence: `docs/planning/V06_V10_IMPLEMENTATION_SEQUENCE.md`
- Invariants: `docs/testing/WORLD_CORE_INVARIANT_MATRIX.md`
- Attacks: `docs/testing/WORLD_CORE_ATTACK_MATRIX.md`
- Execution prompt: `prompts/control/WORLD_CORE_SPRINT_V06_V10_4.md`
- Individual execution plans: `docs/exec-plans/V06.1.md` through
  `docs/exec-plans/V10.4.md`

## Authority and traceability

| Concern                          | Primary anchors                                                                   | Planned steps |
| -------------------------------- | --------------------------------------------------------------------------------- | ------------- |
| One World/one clock/one ledger   | MASTER-U0075-U0081, U0188-U0196; Constitution R016-R018                           | V06-V09       |
| 10x time and 360-day calendar    | MASTER-U0082-U0113, U0214-U0219; Constitution R019-R024                           | V06           |
| Determinism/idempotency          | MASTER-U0205-U0225; Constitution R025-R032                                        | V06-V07       |
| Exact-or-reject quantities/money | Constitution R033-R036; repaired V03 canonical types and exact oracle             | V06-V10       |
| Transaction/concurrency          | Constitution U0404-U0424                                                          | V09-V10       |
| Classified projection            | Constitution U0396-U0403; V05 classifications                                     | V10.1         |
| Cross-border symmetry            | Constitution cross-border atomic-settlement rules; Trade GCU/payment requirements | V10.2-V10.4   |
| R2 fixed target                  | `REQ-E01` (`PLANNED_NOT_IMPLEMENTED`)                                             | V06           |

Requirement and source statuses are not modified by this planning task. During
implementation, each report must name the exact requirement/source/ADR anchors
actually exercised; registration never implies implementation.

## Delivery strategy

1. Satisfy the entry gate in the implementation sequence.
2. Create `codex/world-core-v06-v10` from reconciled `main` only after Gate A
   approval/integration.
3. Add the owner-approved narrow Gate B batch governance record; do not weaken
   the general P0 policy. The checked-in draft is inert until a separate
   owner-approved activation after Gate A.
4. Resolve JIT decisions at their latest implementation points, not as a bulk
   ADR approval.
5. Implement steps continuously with meaningful code/evidence commits and
   actual targeted validation after each step.
6. Re-run the full canonical repository matrix at V10.4 on an immutable
   candidate, including real isolated PostgreSQL, non-production staging
   RLS/grants, process crash/recovery, browser E2E and property campaign.
7. Generate Gate B bundle and stop. Do not merge, self-verify, publish
   production changes, or start V11.

## Planned ownership

| Layer                    | Responsibility                                                                   |
| ------------------------ | -------------------------------------------------------------------------------- |
| `packages/core`          | Pure clock, command/event/receipt types, reducers, posting contracts, invariants |
| `apps/world-api`         | Token/schema intake, server authorization, immutable submission/query boundary   |
| `apps/world-worker`      | Lease/fence ownership, authoritative execution, transaction/recovery             |
| `database/migrations`    | Ordered/hash-bound schema artifacts only                                         |
| projection module/schema | Derived rebuildable read models with classification/watermark                    |
| `apps/world-web`         | Submit commands and render authorized projections only                           |
| testkit/tests            | Arbitraries, state machines, attack fixtures, failure injection and E2E          |

No new package may become an independent state owner.

Every new governed file/import remains under the repaired AST ownership and
numeric-coercion scanners. Every authoritative Worker startup validates the
canonical environment before persistence initialization. Every migration
candidate extends the existing V02 chain with verified commit/path/byte-hash
provenance.

## Gate B definition

Gate B independently verifies all fourteen hard properties:

1. Clock deterministic.
2. SimTime monotonic.
3. Commands canonical.
4. Authorization server-side.
5. Idempotency durable.
6. Events append-only.
7. Replay exact.
8. Single writer enforced.
9. Transactions atomic.
10. Inventory conserved.
11. Money conserved.
12. Recovery works.
13. Projections non-authoritative and rebuildable.
14. Concurrency safe.

Gate B evidence must also prove full regression, production mutation `NONE`, no
hidden E02-E18 scope, and V11 `NOT_STARTED`. BLOCKER/MAJOR findings stop before
V11; MINOR findings may be backlogged only when they cannot threaten a hard
property.

The Gate B campaign also preserves seven inherited Foundation regression
invariants without reopening Gate A from scratch: unsafe runtime environments
cannot start an authoritative Worker; arithmetic remains exact-or-reject;
canonical serialization executes no behavior; authorization is current rather
than cached; `AuthSubject` remains UUID-safe and external to domain IDs;
forbidden dependency/coercion forms remain AST-blocked; and migration provenance
proves commit, path and exact bytes.

## Stop conditions

Stop immediately for missing Gate A approval/integration, missing required JIT
owner decision, source conflict, second-authority design, unsafe database
target, failed P0 invariant that cannot be corrected in scope, insufficient
real concurrency/recovery evidence, production credential/mutation exposure, or
required E02-E18 expansion.

Ordinary implementation defects are corrected and re-tested on the sprint
branch with failure history retained; they are not silently converted into
passing evidence.
