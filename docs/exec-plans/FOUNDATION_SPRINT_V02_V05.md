# Foundation Sprint V02 to V05 execution plan

## Authority and execution boundary

The 2026-09-09 owner instruction authorizes V02-V05 to be co-developed on one
feature branch and reviewed as one immutable Gate A candidate. This changes
review timing only: every P0 step remains `IMPLEMENTED_UNVERIFIED`, no P0 step
is self-approved, the branch is not merged, and production mutation is
forbidden. V06 is outside scope.

## Milestones

1. V02 environment and migration-release foundation.
2. V03 canonical IDs, decimal numeric types, registries, and serialization.
3. V04 reproducible property tests and machine-enforced architecture gates.
4. V05 identity bridge, six Office authorization, approvals, and classified
   projection rules.
5. Full evidence reconciliation and `GATE_A_FOUNDATION_REVIEW_BUNDLE`.

## Unresolved decisions

ADR-02, ADR-06, ADR-08, ADR-09, ADR-12, ADR-16, ADR-18, ADR-19, and ADR-20
remain `PROPOSED_NOT_APPROVED`. The sprint may implement reversible,
future-compatible boundaries without claiming those proposals are approved.
No formula-specific rounding, production publication, shared-schema ownership,
or economic command semantics may be frozen here.

## Mandatory validation

Use Node 24.20.0 and pnpm 12.3.4 with the frozen lockfile. Run targeted tests
after each milestone and the complete lint, format check, typecheck, unit,
integration, property, boundary, architecture, environment, secret,
governance, build, and `git diff --check` matrix before Gate A.
