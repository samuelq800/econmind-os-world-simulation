# PR136 full-check failure: manual fixture row count

2026-10-11. Existing full no-deploy CI38124279363 at
`a037cd21989a05d7c21381d6baa953ddb13c4968` FAILED. Preserve this result.
The main test set was3351 PASS /1 FAIL /258 SKIP,264 files PASS /1 FAIL /
23 SKIP. Subsequent full-check stages and authenticated native roundtrip were
not reached; the separate workerd/native mechanism jobs succeeded.

Failure: `manual-office-durable-dispatch.test.ts`, revocation after claim,
expected PROCESSED with AUTHORIZATION_REVOKED FINAL but received BLOCKED.
Original official log downloaded once from artifact11696419484:
`/private/tmp/econmind-pr136-failure.etcUEL/official-pnpm-check.log`, SHA256
`98a01122e98e24a4b06be13e1a7fa8e2ca5542d5733617c5eb52fa376cfcfe29`.
Provider ZIP digest189aa087fefe249a99de6b47b2f81437e49f646eb6f18e52b0bafb41b5eba5d9
is not a locally recomputed ZIP hash. The immutable CI artifact remains original.

Root reproduced the exact case locally:1 FAIL /18 selector-skipped, exit1.
A disposable in-memory PGlite probe then returned one locked SELECT row with
affectedRows0. The fixture incorrectly mapped rowCount to affectedRows via ??,
so the newly reviewed head-lock cardinality guard correctly refused apparent
zero rows. Actual node-postgres adapter forwards native result.rowCount and is
unchanged. This is a fixture adapter mismatch, not a reason to relax production
H lock, cardinality, authorization, lease/fence, queue or receipt rules.

Repair only the local test adapter to count selected/RETURNING rows when present,
otherwise affectedRows (default0). Expose that same local fixture database to a
new regression covering locked SELECT1, missing locked SELECT0 and DML1 with
zero returned rows. Preserve all original19 tests and their assertions; no skip,
weakened expected outcome, grants, migration or product source change.

Actual after repair, pinned Node24.20.0/pnpm12.3.4 with env-i, no production env:

- `pnpm exec vitest run tests/world-core/manual-office-durable-dispatch.test.ts`:
  20 PASS /0 FAIL /0 SKIP, exit0. This includes the original revoked FINAL case,
  positive Captain/CentralBank commits, missing/wrong source/authority/head,
  cutoff rollback, expired/stale lease and unsupported automatic Social controls.
- Exact changed-file ESLint and Prettier checks:exit0.
- Only the test file and this evidence/raw-log presentation are submitted in
  this remediation; existing reviewed product blobs remain unchanged.

Independent delta review and new fixed-head full CI are still required before
PR136 merge. This focused result is not full CI or native PostgreSQL validation.
World Clock implementation remains NOT_STARTED until Stage1 closes and Root
issues explicit P1/P2 scope. Formal World/consumer/timer and production untouched.
