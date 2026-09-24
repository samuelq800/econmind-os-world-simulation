# V28.1 isolated preparation — independent narrow review B

**Review conclusion:** code BLOCKER=0, MAJOR=0 for the reviewed preparation
slice; **formal V28.1/merge governance BLOCKER=1**. Keep isolated
`PREPARATION_ONLY`; do not mark V28.1 `VERIFIED` or merge the Core code.

Review B bound the exact base
`0fa8da7e74488f4554185afb68c19b4933d72586`, code
`cd7b7bd64dfab634d08bd426559b5c0c091cf574`, and ADR-14 proposal
`528c20712c9bf1c996894f4994631a4c48a590e7`; all are ancestors of the
pushed `origin/codex/v28-v30-preparation@ab6783a7e088c1a9551c44c740a1e21dd2a3c2e3`.
Later commits did not alter the three reviewed V28.1 files.

The reviewer found the exact-key canonical parser, model/clock/count checks,
immutable hash snapshot, forged-snapshot rejection, and same-World existing
Core replay pass-through sound within this narrow preparation scope. Five
focused tests, Core typecheck and boundary scans passed on byte-identical
V28.1 files; this was not a final product-wide acceptance run.

The blocking issue is governing scope, not a reported code defect:
Constitution R002 still requires separate orchestrators; the active V28.1
manifest still specifies World/Season differences; ADR-14 remains
`PROPOSED_NOT_APPROVED`. The owner's single-World product direction needs a
deliberate R002/ADR-14 contract reconciliation and hard-dependency closure
before formal V28.1 implementation or merge. No original main-site,
production database, status or ADR authority changed in this review.
