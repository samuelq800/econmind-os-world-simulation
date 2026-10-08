# A — classified-read test compatibility candidate

Date: 2026-10-08 Asia/Shanghai.
Status: IMPLEMENTED_UNVERIFIED / Root-B review handoff; no self-approval.

## Fixed candidate and scope

- Base: `bf2fa0556eec59ccc5bd566496340e966c5b5c36`.
- Base tree: `240d3257d58ff0c56348a9a6899eb185c64d53b0`.
- Branch: `codex/a-private-read-test-compat`; separate owned checkout.
- Only two integration tests and this report changed. Final commit/tree/diff
  hashes are external to the commit in the immutable handoff.
- No API, publisher, Core, Worker, schema, SQL artifact, policy, permissions,
  grants, owner decision, status, local demo or production host changes.

## Exact current contract / correction

The fixed base's `G_ECONOMIC_READ_PRIVACY_2026_10_07.md`, shared economic-read
visibility contract, sole activity publisher and PostgreSQL read adapter agree:
COUNTRY raw financial/inventory detail is `NOT_AUTHORIZED`; denied arrays must
be empty. Empty withheld arrays do not mean a zero balance. A visibility marker
is not a grant, and absent admitted sources cannot be replaced by zero.

`staged-narrow-transfer-http.test.ts` now expects the authenticated COUNTRY
projection to carry empty financial/inventory arrays with the full denied
visibility summary. The real SQL Worker, COMMITTED/FINAL receipt, posting counts,
durable inventory AVAILABLE=2 / RESERVED=2, financial conservation, watermark,
signed HTTP identity, receipt-event linkage and duplicate retry assertions are
unchanged. Only the obsolete public raw-inventory expectation was replaced.

`world-api-authenticated-read-boundary.test.ts` now supplies the complete bounded
classified activity fixture instead of `{status: 'READY'}`. The exact verified
JWT subject/query assertion remains. Two direct negative controls require
`PROTOCOL_ERROR` for a ledger missing visibility and for raw inventory under a
denied marker. Timeout fixture typing now uses the real exported
`AuthenticatedWorldReadPolicy`, preserving both existing timeout=1 negatives.

## Actual bounded verification

- Root reported the original full candidate check: lint/format/type/build PASS;
  Vitest **2523 PASS / 139 SKIP / 2 FAIL**. That complete check remains FAIL;
  it was not rerun or relabeled by this candidate.
- Actual untouched-base two-file reproduction: **26 PASS / 2 FAIL**, exit 1.
  Same obsolete inventory expectation and classified-payload `PROTOCOL_ERROR`.
  Captured failure output is retained externally as `BASELINE_FAILURE.log`.
- Final two-file regression: **30 PASS / 0 FAIL / 0 SKIP**, exit 0, including
  the two added classification negatives.
- Strict focused typecheck of both files and their imports: PASS, exit 0.
  Earlier focused typecheck failed on the existing literal timeout=25 fixture;
  the real API type resolved it without changing timeout behavior.
- Focused ESLint, Prettier and `git diff --check`: PASS, exit 0.
- Pinned Node 24.20.0; Vitest 5.0.0 / TypeScript 6.0.3 / ESLint 10.10.0 /
  Prettier 3.9.6. Dependency links are third-party only; Core/Worker were compiled
  from this checkout's exact base source, not borrowed workspace dist.
- The first local build invocation found a removed old toolchain path and used
  system Node 26.5.0; it is not qualifying evidence. Core/Worker were rebuilt
  under verified Node 24.20.0 before both measured test runs. No install or
  lockfile changes occurred.

## Remaining boundary / stop

Only disposable PGlite/local nonproduction HTTP and bounded wire fixtures ran.
Native PostgreSQL, full rerun, new CI, production SQL, Clock and production host
activation are NOT_RUN. No grants or actual economic source/admission were
created. This candidate does not convert technical approval into execution or
release authorization. Preserve others' branches and all original failure
evidence; stop after SHA/tree/hash handoff for Root/B review.
