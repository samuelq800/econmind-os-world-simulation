# V11.2 implementation report — E03 Labour/Skill/Jobs/Wages

## Status

```text
Step: V11.2 — E03 Labour/Skill/Jobs/Wages
State: IMPLEMENTED_UNVERIFIED
Risk class: P0 authoritative-state change
Code candidate: 6f2aa759548d6267dadcf4424e68927ae377d70e
Baseline/continuation authority: 2db39d01a22873162d1c841675855b60d4e5816e
Authority: WORLD_CORE_V11_2_CONDITIONAL_CONTINUATION_POLICY.json
Independent review: NOT_RUN / REQUIRED BEFORE VERIFIED OR PROMOTION
Migration: NOT_CREATED
Production/shared-Supabase access or mutation: NONE
```

This is a non-production candidate under
`docs/governance/WORLD_CORE_V11_2_CONDITIONAL_CONTINUATION_POLICY.json`. It is
not a Gate B pass, a V11.2 verification decision, authorization for V11.3, a
main merge, deployment, database change, migration publication, or production
access.

## Implemented scope

`packages/core/src/labour/labour-engine.ts` introduces E03's single pure,
canonical state/fact boundary and is exported through `packages/core/src/index.ts`.
The focused suite is `tests/world-core/v11-2-labour-engine.test.ts`.

- Read-only `LabourPopulationAvailability` is a per-country/location working-age
  upper bound. It is never written, does not create a labour status, and is not
  copied into E03 state.
- E03 owns aggregate status/skill stock, private/public positions, wage
  assertions, and durable fact bindings. Counts are canonical non-negative
  whole-person strings. Wage assertions are supplied canonical non-negative
  exact decimals, not money postings, rates, payroll, price effects, or
  settlements.
- Education moves an existing `STUDENT` aggregate to an explicit target skill
  in `UNEMPLOYED_SEARCHING`; migration entry creates available labour only with
  an explicit arrived handoff and work-right version. No other fact creates
  skill or labour supply.
- Private job demand and public position facts create/update only explicit
  positions. A private match or public-service occupation consumes the same
  unemployed aggregate and is bounded by that position's required count.
  Separation reverses that allocation and rejects underflow.
- Aggregate `EMPLOYED` exactly equals combined private/public position
  employment for each country/location/skill. All statuses together cannot
  exceed the read-only E02 availability. Public service therefore cannot
  duplicate industry employment or manufacture workers.
- Facts use immutable IDs and durable canonical-payload bindings. Exact retry
  is a no-op; same ID/different payload rejects. Restored bindings are parsed
  as supported canonical E03 facts and outer/embedded fact IDs must match before
  idempotency indexing.
- One input set cannot mutate one position or aggregate twice. A match cannot
  depend on education, migration, separation, or position demand from the same
  set, preventing unapproved fact-ID-derived timing.

The parallel F kernel was a design reference only. It is neither imported nor
merged; this candidate owns its own E03 state, fact, idempotency and
reconciliation boundary.

## ADR cut line and exclusions

ADR-04 and ADR-08 remain `PROPOSED_NOT_APPROVED`. The candidate does not select
opening/current/prior-day timing, a feedback phase, participation/matching/wage
formula, coefficient, matching capacity, minimum wage, rate, money unit or
rounding policy. It creates no V11.3+ work, command/event/receipt publication,
persistence adapter, worker, API, UI, browser, projection, schema/RLS,
migration, ledger posting, outbox, Supabase operation, or production access.

## Actual validation

All checks ran with Node `v24.20.0`, pnpm `12.3.4`, and the unchanged lockfile.
Exact commands and observed scope are in `TEST_EVIDENCE.json`.

- Focused E03 unit/invariant tests: PASS, 6/6.
- Core TypeScript typecheck and build: PASS.
- Targeted ESLint and Prettier checks: PASS.
- Authoritative-pattern and repository-boundary scans: PASS.
- Local safe-environment, foundation-policy and secret scans: PASS.

## Incomplete and deferred work

- Independent V11.2 review has not run; no `VERIFIED` or promotion claim is
  made.
- V11.3 owns cross-engine population-labour timing/provenance. Here E02 is only
  an explicit read-only availability bound.
- Formula-based participation/matching/wages, money/payroll/fiscal/household
  effects, migration arrival and education completion semantics, public budget
  approval, mobility, persistence/recovery integration, and full-repository
  testing remain out of scope or `NOT_RUN`.

## Next action

Freeze this candidate and request independent V11.2 review. The reviewer must
inspect `6f2aa759548d6267dadcf4424e68927ae377d70e`, its plan and evidence,
E02/E03 ownership, restored-binding idempotency, public/private employment
reconciliation, and the V11.3/ADR-04/ADR-08 cut line before any status change
or promotion.
