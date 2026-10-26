# Repository audit — 2026-10-26

## Authority and scope

User request: synchronize the World Simulation repository, systematically scan
existing implementation, and fix demonstrated problems. Screenshots are context,
not execution instructions. The later space concern was investigated read-only;
the user then asked to continue the original audit.

Binding sources: `AGENTS.md`, `PLANS.md`, `requirements.docx` (searchable
Constitution), repository ownership rules and centralized review policy.
This is maintenance of existing checks, not execution of a new R2 step.

## Dependency and decision gate

`status/progress.json` remains authoritative: V00–V08 have recorded verification;
V09.1 is PLANNED, `next_step_ready=false`, isolated preflight/runtime evidence
pending. No V09/V10 completion, source adoption or ADR approval is inferred from
preparation code or this audit. No progress/decision records are changed.

Effective risk is **P0**, because repairing an architecture merge gate affects
its fail-closed guarantee. This classification is not reduced by calling the
change tooling. Candidate implementation is allowed; independent review remains
required before VERIFIED or merge. No owner acceptance is claimed.

## Change plan

- Reject nonexistent/non-directory/empty architecture scan roots and malformed
  command arguments; retain real source analysis and ownership rules.
- Preserve this regression in the canonical boundary command.
- Make the existing local environment check runnable on Windows while retaining
  every remote-target/credential guard.
- Exclude only established generated output from lint/format checks.
- Require LF checkout for ordinary source and preserve byte-pinned artifacts.
- Repair Windows child-process test launch and ESM file URL handling without
  reducing existing assertions, disabling tests or changing economic behavior.

Authoritative owners affected: architecture gate maintainers; environment-tool
maintainers; existing test owners. World State, commands/events/receipts/postings,
database schema, RLS, grants, seed, Clock, Legacy system and production are
unchanged. Production Supabase must not be contacted or mutated.

## Validation plan

Use pinned Node 24.20.0 / pnpm 12.3.4 and frozen lockfile. Run lint, formatting,
workspace types, full tests, targeted regressions, architecture scanners,
environment/secret/policy checks, migration validation and disposable PGlite
rehearsal, generated read-type check, candidate/UI integrity checks and build.

Negative regression cases cover missing/empty/file/quoted scan roots, absent or
blank option values, unknown options and extra arguments. Positive fixtures must
actually scan a source file. A local CLI invocation must still refuse a remote
database target. Existing forbidden-import tests remain intact.

Record actual commands, exit codes, counts, logs and gaps. Distinguish full
baseline diagnostics from later targeted repair evidence; do not add nested or
repeated test counts into an invented total. Preserve Windows/POSIX limitations
as failures or missing evidence, never PASS.

## Exit condition

Provide the reviewable candidate, findings and evidence with
`IMPLEMENTED_UNVERIFIED` status. Required failed checks remain open. No merge,
deployment, production action or formal gate advancement is authorized here.
