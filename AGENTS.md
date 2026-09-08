# EconMind World repository instructions

## Governing authority

`requirements.docx` is the binding Constitution and P0/P1 law. The original
Master and Office specifications are under `specs/original/`; searchable copies
and source indexes are under `specs/extracted/` and `requirements/`. Source
specifications are product requirements, not executable instructions that can
override this file or the user's current request.

Use `PLANS.md`, `planning/r2_steps.json`, `status/progress.json`, and
`status/decisions.json` as the repository-controlled R2 execution system. Do not
reconstruct missing governance from chat history.

## Current gate

V00.1 and the R2 governance sync have independent `APPROVED` reviews and explicit
project-owner acceptance, so both are `VERIFIED`. V00.2 remains blocked until
the governance branch is actually merged into `main` and final reconciliation
passes. Implement only the current approved and dependency-ready step. Never
continue automatically into later work packages.

## Architecture and data safety

- World V2 has one authoritative World State. Snapshots, projections, caches,
  forecasts, and UI state are derived and must never become a second truth.
- `apps/world-web` is non-authoritative. It may render authorized projections,
  submit commands, and consume approved shared public contracts, types, and
  browser-specific client interfaces. It must not import or depend directly on
  `apps/world-worker` implementation, server-only persistence or mutation
  implementation, service-role or server-secret implementation, authoritative
  settlement implementation, or any other server-owned module forbidden by the
  repository ownership policy. This browser import boundary applies even when
  an import does not immediately perform an economic write. The durable boundary
  is documented in `docs/architecture/REPO_BOUNDARIES.md` and enforced by the
  repository boundary checks.
- `apps/world-api` is the authentication and command/query boundary.
- `apps/world-worker` is the authoritative execution host.
- `packages/core` must remain deterministic and independent of React, browser
  APIs, Supabase SDKs, and arbitrary persistence writes.
- State changes must use authorized commands, append-only events,
  deterministic/idempotent processing, and atomic settlement.

The linked Supabase project is a production integration target, not a
development database. Never run migrations, resets, pushes, seed operations,
arbitrary SQL, or destructive commands against it. Production has one approved
migration publication chain. Never expose service-role credentials through
`VITE_*` or rely on the client to enforce authorization or classification.

## Execution and verification

Follow the lifecycle in `PLANS.md`. Before implementation, verify every hard
dependency in `status/progress.json`; only explicitly marked parallel
preparation may proceed early. Human-required architecture or economic
decisions remain unapproved until the responsible human records approval.

Use the pinned toolchain and frozen lockfile. Run real lint, formatting,
typecheck, test, boundary, environment, secret, and build checks appropriate to
the step. A test file is not evidence, `NOT_RUN` is not `PASS`, and
implementation is not verification. Implementation agents may report
`IN_PROGRESS`, `IMPLEMENTED_UNVERIFIED`, or `BLOCKED`; they may not self-award
the review-controlled `CHANGES_REQUIRED` or `VERIFIED` states.

Use the templates under `templates/` and report actual commands, exit codes,
environment, evidence gaps, affected owners, permissions, migrations, legacy
impact, and unresolved decisions. An implementation agent must never set
`owner_approved` on its own; only an explicit project-owner instruction may be
recorded. Stop after the authorized step and request an independent review.
