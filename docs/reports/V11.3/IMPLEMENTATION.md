# V11.3 implementation report — E02/E03 population-labour invariants

## Status

```text
Step: V11.3 — E02/E03 population-labour cross-engine invariant
State: IMPLEMENTED_UNVERIFIED
Risk class: P0 authoritative-state validation
Code candidate: d839c8944601190d103082c64b9fe524ec01ec81
Baseline continuation authority: 47526ea2219ece011da82e397cf5435b1d044ea8
Plan commit: 7a54b116381c9cbf559053475bfd4d706a643d2e
Authority: WORLD_CORE_V11_3_CONDITIONAL_CONTINUATION_POLICY.json
Independent review: NOT_RUN / REQUIRED BEFORE VERIFIED OR PROMOTION
Migration: NOT_CREATED
Production/shared-Supabase access or mutation: NONE
```

This is an owner-authorized, non-production V11.3 candidate. It is not a Gate B
pass, verification decision, main merge, deployment authorization, database
change, migration publication, or production-access authorization.

## Implemented scope

`packages/core/src/labour/population-labour-invariants.ts` is a pure validator,
exported by `packages/core/src/index.ts`. It accepts caller-labelled E02 and E03
source/result snapshots plus existing engine action evidence. It stores no
state and returns only a validation receipt of fact and migration-handoff IDs.

- Each E02/E03 snapshot label has an opaque caller-selected snapshot ID, day
  index and time label. V11.3 requires exact equality within each submitted
  source or result pair, but does not interpret the labels as opening/current/
  prior or choose an ordering or phase.
- The module revalidates source and result state through the existing V11.1
  E02 and V11.2 E03 pure cores. It then replays canonical submitted facts from
  source and requires byte-identical resulting state and action evidence.
  Direct labour or skill edits therefore fail closed.
- E03 availability remains read-only. Its per-location availability is
  canonicalized and its country sum cannot exceed E02's result
  `workingAge16To64` cohort.
- A migration labour entry must match an explicit, working-age E02 arrival
  handoff in the supplied evidence for the same country; aggregate entries
  cannot exceed the arrival count. Education and other labour semantics remain
  entirely owned by V11.2.
- Existing V11.2 revalidation proves `EMPLOYED` equals combined private/public
  position employment. V11.3 neither allocates jobs nor implements wage,
  participation, matching, time, price, money, rate, or rounding rules.

No V11.1/V11.2 runtime module was modified. No command/event/receipt,
persistence, worker, API, UI, schema/RLS, migration, outbox, browser, database
or production surface was created or accessed.

## ADR cut line

ADR-04 and ADR-08 remain `PROPOSED_NOT_APPROVED`. The validator compares only
explicit caller labels and canonical evidence links. It cannot derive a
read-timing policy, choose a phase order, create a labour/skill source, or add
a labour, wage, participation, matching, price or rounding formula/default.
Any need to make one of those choices is a stop condition, not an implementation
fallback.

## Validation

All listed checks ran locally with Node `v24.20.0`, pnpm `12.3.4`, and the
unchanged lockfile. See `TEST_EVIDENCE.json` for commands and outcomes.

- Focused E02/E03 invariant suite: PASS, 8/8.
- Core TypeScript typecheck and build: PASS.
- Scoped ESLint and Prettier: PASS.
- Authoritative-pattern, boundary, local-safe-environment, foundation-policy,
  and repository-secret scans: PASS.

## Incomplete and deferred work

- Independent V11.3 review is pending. This candidate must remain
  `IMPLEMENTED_UNVERIFIED`; it cannot be marked `VERIFIED` or promoted.
- Full-repository `pnpm check`, database/RLS/migration rehearsal, production
  integration, V07/V09 persistence/recovery, and browser evidence are
  deliberately `NOT_RUN`, because they are outside this pure V11.3 increment.
- V12 through V18 remain untouched and unstarted.

## Next action

Freeze the evidence commit and send that immutable branch tip to independent
V11.3 review. Review must inspect the pure-boundary ownership, exact replay,
label compatibility, E02 availability bound, migration handoff conservation,
all eight focused cases, and the ADR-04/ADR-08 cut line before any status
change or promotion.
