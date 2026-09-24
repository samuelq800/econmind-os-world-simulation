# Single-World Core configuration — preparation candidate

## Authority and status

- Branch: `codex/v28-1-single-world-config-preparation`; initially prepared on `origin/main` `4d38a9f6ef4191edd84ded58a2c90b130267b69f`, then rebased onto `b14d7becad757769ba6299f2c0d5674dca0482bd`.
- Status: `PREPARATION_ONLY`. `status/progress.json` still lists V28.1 and its outstanding dependencies as `PLANNED`; ADR-14 remains `PROPOSED_NOT_APPROVED`.
- The owner explicitly corrected this slice to **one World only**, with no separate Season instance, label or World/Season mode. The repository's V28.1/ADR-14 text still anticipates two orchestrators, and Constitution R002 requires separate orchestrators. A new [ADR-14 single-World supersession proposal](../../architecture/ADR-14_SINGLE_WORLD_SUPERSESSION_PROPOSAL.md) records the exact conflict and proposed forward contract. It is `DECISION_REQUIRED / NOT_APPROVED`; no historical ADR, Constitution, step manifest, prompt or Gate has been silently rewritten. Formal V28.1 entry remains OPEN pending owner/governance reconciliation and hard dependencies.

## Delivered behavior

The new pure Core module parses exactly six versioned single-World fields: `worldId`, current Core `modelVersion`, configured positive `countryCount`, existing `clockVersion`, `economicExpiryClock=SIM_TIME`, and its own schema version. It rejects unknown/missing fields, alternate modes, Season registration fields, resource bonuses, invalid count, mismatched model/clock, and real-time economic expiry. It emits an immutable canonical snapshot and deterministic SHA-256 binding, not a World State or policy decision.

One read-only binding verifies existing replay evidence belongs to the configured World/model and returns that same input unchanged to the existing `replayAuthoritativeEvents` Core path. No new reducer, physics formula, time multiplier, participation/admission policy, Command, Event, Posting, settlement, state write or main-site file was introduced. The focused test runs the same physical opening state and Event twice through the same existing reducer and compares the identical result. It does **not** prove product-wide V28.1 equivalence or authorize runtime integration.

## Verification and limits

- Focused single-World plus existing replay Vitest: PASS, 2 files / 21 tests. First run had one test assertion using substring `mode`, which also appears in `modelVersion`; corrected to inspect the absent `mode` property. Final run passed.
- Core build/typecheck, targeted ESLint/Prettier: PASS.
- Architecture boundary suite: PASS, 3 files / 34 tests; authoritative-pattern and boundary scans PASS.
- Repository secrets and local safe-environment checks: PASS; Supabase unlinked, database mutation disallowed.
- Governance alignment: additive proposal/plan only; active R2/ADR/Constitution records unchanged. Focused governance validator and diff checks are recorded in `TEST_EVIDENCE.json` after this addendum.
- Full repository suite, authoritative integration, old-world compatibility, formal owner reconciliation, independent P0 review, migration, production and release: NOT_RUN. No Gate/status/ADR record changed.

## Later isolated rebase (2026-09-24)

The two preparation commits were cherry-picked onto the newer `0fa8da7`
main base as `cd7b7bd` and `528c207` on
`codex/v28-v30-preparation`. The focused V28.1 suite passed 5/5 and Core
build plus architecture boundaries passed on that base. The earlier branch's
21-test evidence is preserved as historical, not silently attributed to
this new SHA. The status remains `PREPARATION_ONLY`; the R002/ADR-14 conflict
and formal dependencies are unchanged.
Independent Review B then found no code blocker/major in the narrow V28.1
preparation diff, but recorded one governance blocker to formal merge and
promotion. See [`INDEPENDENT_REVIEW_B.md`](INDEPENDENT_REVIEW_B.md).
