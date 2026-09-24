# V29 requirement-binding tool — scoped P2 mainline acceptance

`OWNER_FAST_TRACK_ACCEPTED` for preparation tool commit `74df825` on base
`95eb1064df14a823024a87c419c93fa5a7d3b7e2`, under the owner's
2026-09-24 instruction to build quickly and publish suitable lightly checked
changes. This is **not** V29.1 VERIFIED, an actual 139-item coverage audit,
Gate B approval or a World release.

The changed code is only `tools/v29` plus a focused test. It maps requirement
IDs to explicit candidate-bound claims, defaults unbound rows to `MISSING`,
rejects unsupported/duplicate/orphan claims, and always reports
`formallyVerified=false`. It neither verifies referenced artifact contents
nor changes Core, API, worker, web, database, authorization, source registry,
status, or the original main site.

Focused tests 4/4, strict TypeScript, targeted ESLint/Prettier, secret scan and
diff check passed. The first test invocation failed due to an incorrect
expectation for the 138 other default-`MISSING` rows; the expectation was
corrected and rerun. Real code/test mapping, independent requirement review,
V29 long run and V30 acceptance remain `NOT_RUN`.
