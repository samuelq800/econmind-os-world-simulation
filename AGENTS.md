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

`docs/governance/FAST_MAINLINE_REVIEW_POLICY.json` is the centralized review
timing and continuation policy. Step prompts are rendered from
`planning/r2_steps.json` by `tools/render_step_prompts.py`; duplicated prompt
text is not an independent policy source. Constitution precedence always wins.

## Current gate

The authoritative current gate is only `status/progress.json`. Do not infer the
active step from this instruction file. Never begin V02 while the V01 package
review gate is pending.

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
implementation is not verification. Without a policy-valid review or explicit
owner fast-track record, implementation agents may report only `IN_PROGRESS`,
`IMPLEMENTED_UNVERIFIED`, or `BLOCKED`. `CHANGES_REQUIRED` remains an
independent-review decision; P0 `VERIFIED` can never be self-awarded.

Use the templates under `templates/` and report actual commands, exit codes,
environment, evidence gaps, affected owners, permissions, migrations, legacy
impact, and unresolved decisions. An implementation agent must never invent
`owner_approved`; it may record it only from an explicit project-owner
instruction. Apply the centralized policy to review timing: P0 normally blocks
on independent review. The explicit Gate A `PROJECT_OWNER_ACCEPTANCE` is a
one-time, gate-scoped closure after recorded findings and remediation, not a
reusable P0 fast-track or ADR approval. P1 may defer review only to the named
Work Package gate; P2/P3 may use only the policy-defined fast-track path after
required evidence passes.

Use normal engineering verification: authoritative acceptance gates, P0/P1
invariants, existing regressions, realistic failures, fail-closed boundaries,
exact arithmetic/conservation, authorization, migration provenance and ordinary
security checks. Do not proactively expand work into open-ended adversarial
red-teaming, extreme website exploit chains, unbounded fuzzing or unrealistic
timing attacks solely to discover new vulnerabilities. Never weaken or delete
an existing test or ignore a defect that an ordinary required test reveals.

Codex may never downgrade risk, approve its own P0 change, ignore a failed
mandatory check, weaken Constitution requirements, create another Source of
Truth, permit authoritative UI mutation, introduce direct macro buffs, or
mutate production Supabase outside an authorized release.
