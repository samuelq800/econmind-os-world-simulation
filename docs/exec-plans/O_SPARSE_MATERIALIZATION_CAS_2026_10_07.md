# Sparse country materialization CAS

Status: `IMPLEMENTED_UNVERIFIED`; independent P0 review pending. Source-only
construction, not domain admission, full runtime, Gate B or production activation.
Base: `d4e3a8cfba318372d534cf2b281d291edb93333b`.

## Problem and actual implementation

The old atomic upsert requires each country cache row's version to equal the
immediately previous global version. A country cache at version1 cannot update
after an unrelated country's event advances the global head to version2. Keeping
that old path alone therefore blocks otherwise valid sparse country processing.

A new server-only SQL observer obtains global head and the selected cache row
in one statement. It requires the exact expected global head, canonical JSON,
the stored content hash and a nonfuture positive row version. It returns an
immutable WeakSet-branded observation bound to World/key/global head. A plain
record, copied brand, different key/World or older observed head is rejected.
This is a cache-CAS precondition, **not** admission, authorization, authoritative
domain state or a substitute for replaying the actual opening and Events.

The existing private Atomic candidate accepts this optional observation. After
the unchanged same-transaction Command, current authorization, World head,
single-writer lease/fence and ledger guards, an observed existing row uses UPDATE
with exact version **and** payload hash. An observed absent row uses INSERT with
conflict DO NOTHING. Both require exactly one affected row. Replacement,
deletion or concurrent creation rolls back Events, receipts and all other facts.
No state reset, second ledger, DDL, permission or direct browser write is added.

Unobserved legacy callers retain their exact old global-predecessor CAS; no
guard is silently relaxed for them. Domain adapters have not yet adopted the
new observer or supplied a trusted opening/replay reader. Country cache payloads
remain replaceable, non-authoritative materializations, never balance authority.

## Bounded checks and retained failures

Pinned Node24.20.0/pnpm12.3.4. Worker build, focused strict TypeScript, scoped
ESLint, repository boundaries and authoritative-pattern checks passed.
The focused TypeScript first failed because the inherited database helper
imports an existing `.mjs` without declarations; its dedicated config now uses
the same allowJs/checkJs:false settings as the existing V09 preparation config.
No runtime helper, compiler strictness or subject guard was removed.

The first selected PGlite invocation had four new cases PASS, then the test
fixture omitted its DOMAIN_ERROR_CODES import and failed its negative matcher.
An unawaited query/fixture cleanup kept the test worker consuming CPU; Root
terminated only that verified task-owned worker after roughly195s. The run
remains exit1, one known fixture failure and one SIGTERM unhandled error, not a
successful suite. The import was fixed without changing runtime assertions or
the implementation. No source logic was changed to suppress the failure.

The corrected bounded continuation at22:45:42 ran the remaining two new
negative cases and two existing commit/idempotency/no-approval controls:
**4 PASS**,25 filtered,7.12s,exit0. The final focused six-new-case invocation
at22:46:57 passed **6/6**,23 filtered,8.66s,exit0; no old fault matrix rerun.
Fixed-head independent review is still pending. These are real PGlite
SQL/transaction checks, not native PostgreSQL
concurrency, production durability, official country data or six-Office gameplay.

## Required integration

Root must integrate this after F's separately reviewed Atomic posting union,
preserving both changes. Independently review the exact final composition before
main publication. Captain/Social/CB sources must use actual admitted domain
opening plus ordered Events at one current cutoff; a branded cache observation
does not prove that domain source. No consumer default, phase/Gate status or
production database changes are authorized by this slice.
