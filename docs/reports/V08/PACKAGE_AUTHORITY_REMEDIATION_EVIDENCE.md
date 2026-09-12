# V08 post-closure authority remediation evidence

## Immutable implementation candidate

- Base: `0e79faffce3cd44001374fa31b184a594ea51328`
- Branch: `codex/v08-authority-remediation`
- Code candidate: `0e9d6f6dfe5fbb7cbf6e74463cc6e60fe0298095`
- Scope: V08 authoritative Posting/ledger reconstruction boundary only.

## Finding disposition

- Raw snapshot hydration: `NO_CHANGE_ALREADY_CLOSED`. Inventory and financial
  parsers still return non-authoritative snapshots; the private authority guards
  reject copied/cast snapshots, and no raw hydration/authorization entry point is
  exported from `@econmind/core`.
- Transition binding: `IMPLEMENTED_PENDING_FOCUSED_INDEPENDENT_REVIEW`.
  Inventory Postings and Financial Posting batches now require a cryptographically
  revalidated canonical Command plus the complete ordered authoritative Event
  transition. Their binding includes Command fingerprint, idempotency key,
  expected/before/after WorldVersion, ordered Event IDs/fingerprints, and SimTime.
- Public split-writer bypass: closed by removing the per-projection `apply*`
  functions from the package root. The public authoritative reconstruction entry
  point advances the Inventory and Financial projections together from one
  ordered lineage.
- Lineage admission rejects forged Command/Event payload evidence, non-contiguous
  or duplicate Events, reused non-null idempotency keys across distinct Commands,
  and a non-null Command expected WorldVersion that differs from the transition
  boundary.

## Failure proof and verification

Before the implementation, the focused blocker tests produced 18 passes and two
expected failures: a distinct Command fingerprint and an incomplete/mismatched
Event/SimTime group were both accepted. The final read-only bypass review exposed
two further cases; their tests first produced 17 passes and two expected failures
for reused idempotency keys and stale expected WorldVersion.

After the forward fix, the bounded V07/V08 regression set passed 11 files and 106
tests. Core typecheck, changed-file ESLint, Prettier, authoritative-pattern scan,
boundary scan, and `git diff --check` passed. Exact commands and results are bound
in `PACKAGE_AUTHORITY_REMEDIATION_TEST_EVIDENCE.json`.

One intermediate combined shell invocation used the repository's default Node
24.19.0/pnpm 11.19.0 after a command-scoped `PATH` assignment. It stopped at the
engine guard and was rerun correctly with the pinned Node 24.20.0/pnpm 12.3.4;
this was a toolchain invocation error, not a test failure.

## Boundaries and residual authority

- No migration or schema DDL was created or changed.
- No production or shared-staging access or mutation occurred.
- No V09.2, V09.3, V10, UI, or Supabase work occurred.
- No full-suite, stress, network-service, or high-concurrency run was performed,
  following the owner stability policy.
- Durable atomic commit, lease/fencing, and crash recovery remain V09-owned.
- This record does not self-approve the remediation. Review B remains the owner of
  the focused independent decision against the frozen target.
