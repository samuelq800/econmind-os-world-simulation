# Country/Office committed-fixture repair — 2026-10-08

Status: IMPLEMENTED_UNVERIFIED. Independent E review: PENDING.
Scope: TEST_ONLY fixture closure, not a runtime or production release.

## Immutable starting point and ownership

- Base: `7bc960afde36423a6e6e4a46da2476a2c225ffc7`.
- Base tree: `987927285a96a41c3809c5f820894c8e5d8a368d`.
- Branch: `codex/a-country-office-committed-fixture-20261008`.
- Checkout: `/Users/samuel/Documents/econclub/.econmind-worktrees/a-country-office-fixture-repair`.
- Owned changes: the Country/Office integration fixture, its dedicated typecheck
  configuration, and this report. No application/Core source, production SQL,
  schema, migration, package manifest, lockfile, or governance status change.
- Frozen implementation SHA/tree/diff hashes are recorded in the external
  `FREEZE.json` after committing these three files; this document does not claim
  a self-referential commit SHA.

## Observed failure and bounded correction

The untouched base's full original integration file reproduced all three
failures: `decision receipt must be an object`. The old seed inserted one raw
`V10_ACTIVITY_TEST` Command and one `V10_ACTIVITY_RECORDED` Event with placeholder
hashes, advanced the head, and omitted a FINAL receipt. The hardened publisher
correctly refused that source. It was not a production-parser defect.

The repaired positive fixture:

1. Builds canonical Command/Event hashes using the real Core parsers and Node
   SHA-256; builds the transition and FINAL receipt using Core constructors.
2. Persists the submission and claims the existing queue under the actual lease.
3. Commits through `prepareAtomicTransitionCandidate` and
   `AtomicTransitionRepository`, with the real transaction-cutoff authorization
   guard. That repository writes the Event, receipt, finalized queue, and head.
4. Verifies a durable receipt and an EXISTING_COMMIT retry, exactly one Event,
   head/version 1, and zero Inventory/Financial Posting rows.

This is the existing synthetic TEST_ONLY activity family using the existing
`VERSIONED_AUTOMATIC` authority kind, not an admitted Trade/economic operation.
The original subject, actor, Country, TRADE Office, `TRADE_PROPOSE` capability,
team, authorization version, Command/Event/correlation IDs, SimTime, and real
timestamp are retained. No human Trade proof or production automatic permission
is invented. No economic opening, Posting, outbox, or current materialization is
added by this fixture.

All three original tests remain intact: legacy raw-cache rejection, entitled
Country/Office-private reads, and valid-but-unentitled private-Country rejection.
The entire original describe block is byte-identical after removing only
trailing EOF whitespace. Both block SHA-256 values:
`9b402fbe5113253009bbdcde8c0983296bd6599c9b615643a8ebe754abb8a40b`.
Their one-activity intent and assertions were not relaxed.

## Added controls

Four tests extend rather than replace the originals:

| Control                                     | Required result                                                     |
| ------------------------------------------- | ------------------------------------------------------------------- |
| Real committed fixture plus duplicate retry | One Event, FINAL receipt, finalized queue; activity count remains 1 |
| Appended orphan Event                       | TRANSITION_EVIDENCE_INVALID; missing receipt rejected               |
| Appended mismatched receipt SimTime         | TRANSITION_EVIDENCE_INVALID; lineage/receipt mismatch rejected      |
| Appended wrong Event fingerprint            | TRANSITION_EVIDENCE_INVALID; durable Event hashes rejected          |

Negative controls first publish valid rows, append a deliberately malformed
second source in their own disposable PGlite DB, then compare all persisted
projection rows before/after rejection. No production guard or trigger is
disabled, no invalid Event is silently filtered, no fallback zero is introduced,
and the last good projections remain unchanged.

## Actual checks and environment

Evidence directory:
`/Users/samuel/Documents/econclub/artifacts/a-country-office-fixture-20261008.Jokm8j`.

- Node 24.20.0; pnpm 12.3.4; TypeScript 6.0.3; Vitest 5.0.0;
  PGlite 0.5.8. Credentials-cleared local environment, no configured database,
  linked Supabase NOT_LINKED, database mutation permission false.
- All 13 existing SQL migrations are exercised in disposable in-memory PGlite.
- Core, Worker, and API build their own checkout outputs: exit 0 each.
  The build invocation also performed a cache-only dependency re-link:
  161 reused, zero downloaded, lockfile up to date. No tracked dependency file
  changed and no foreign workspace build output is used.
- Original integration file at base: 0 PASS / 3 FAIL / 0 SKIP,
  `baseline-three-failures.json`.
- Repaired original three tests: 3 PASS / 0 FAIL, `first-fixed-three-tests.json`.
- Repaired integration file with controls: 7 PASS / 0 FAIL,
  `first-fixture-controls.json`.
- Focused four-file run: 100 PASS / 0 FAIL / 0 SKIP,
  `final-focused-contracts.json`: integration flow 7, publisher 13,
  Office decision projector 56, strict API PostgreSQL read adapter 24.
- The same four files were rerun after the final builds: exit 0, 100 PASS /
  0 FAIL / 0 SKIP, 18.35 seconds, `final-post-build-contracts.json`.
- Dedicated typecheck, fixture ESLint, repository boundary check, local
  environment check and `git diff --check`: exit 0. Exact commands, outputs,
  toolchain versions, and exit codes are in `final-checks.json`.
- Original-test comparison: exit 0;
  `compare-original-tests.mjs` and `original-three-tests-comparison.json`.
- Prettier checks the fixture, dedicated JSON configuration, and this report.
  Final formatting and post-build test evidence are included in the external
  handoff.

### Typecheck limitation, explicitly retained

The first scoped typecheck exited 2: existing PGlite dependency declarations
reference absent Emscripten/FS ambient symbols, and the existing SQL test helper
imports an undeclared JavaScript environment module. Full error output remains
in `initial-typecheck.txt`.

The dedicated configuration extends the unchanged strict base and follows the
existing `tsconfig.g-economic-read-privacy.json` convention:
`allowJs: true`, `checkJs: false`, `skipLibCheck: true`. TypeScript fixture
and imported implementation source checking remain strict, including unchecked
index and exact optional-property checks. Third-party declaration checking and
JavaScript helper checking are explicitly not claimed. No global compiler
configuration, ambient-any stub, vendor declaration, or production script changed.

## Preserved external failures and exclusions

Root supplied provider CI `37780566377`: FAIL, 2866 PASS / 3 FAIL / 153 SKIP,
829.06 seconds, with the same three original flow failures. That old provider
result is preserved, not rewritten as PASS; it was not re-fetched or rerun here.
The reported artifact-upload network FAIL remains unresolved; no unspecified
network detail or successful upload is inferred.

Full provider CI after this patch: NOT_RUN. Native PostgreSQL, production RLS,
parallel-database concurrency, production access, external Worker activation,
authoritative opening-data admission, deployment, merge, and promotion: NOT_RUN.
PGlite and source-level checks do not establish any of those properties.
No new feature or later runtime package is started.

Next authority: independent E review against the frozen SHA/tree, then the
responsible mainline owner decides integration and any subsequent provider check.
This implementation does not self-approve, close a package, or activate production.
