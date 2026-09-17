# Gate B minimal evidence matrix

**Recorded:** 2026-09-17
**Evidence-only tip:** `ca96cbace21e365f2548cf3188c9f89ca5a8a70e`
**Decision:** `GATE_B_WORLD_CORE_HARD_GATE = PENDING`

This is a read-only reconciliation of immutable artifacts. It is not a test
run, approval, merge, deployment, staging authorization, or production action.
`EVIDENCED` means the named requirement has exact evidence for the named
candidate only. It never fills an untested database, browser, or staging gap.

## Exact evidence matrix

| Gate B requirement | Status | Immutable source and evidence | Boundary |
| --- | --- | --- | --- |
| Exact candidate, pinned toolchain, full repository regression | EVIDENCED | `ca96cba`; GitHub Actions [35185858398](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/35185858398), Node 24.20.0 / pnpm 12.3.4; unmodified `pnpm check` passed (51 files / 581 tests passed; 2 files / 10 tests skipped). | This is a V09 candidate/evidence tree, not a composed V10 Gate B candidate. |
| V09 atomic/recovery on real isolated PostgreSQL | EVIDENCED | `ca96cba`; CI 35185858398 disposable PostgreSQL 16 job passed migration validation, writer-lease, atomic-preparation, authorization-cutoff, atomic-recovery, and recovery/preparation suites. | CI disposable PostgreSQL is not Supabase staging evidence. |
| V10.4 delivery concurrency and controlled process-kill recovery | MISSING | Historical narrow evidence: `3a15fac` / CI 34850501755 independently approved for continuation; later Reserve/Ship increments through `46476c9` / CI 34914425241 are automated evidence. Source: `6833ea4:docs/reports/V10/GATE_B_REAL_POSTGRES_CI_CANDIDATE.md`. | No reviewed, frozen V10.4 range is integrated into `ca96cba`; these do not constitute the full Gate B campaign. |
| V10.5 immutable opening lineage | MISSING | `2a3122f` has local focused checks and PGlite rehearsal only. Source: `6833ea4:docs/reports/V10/V10.5_OPENING_SEED_INCREMENT.md`. | No exact real-PostgreSQL, browser, staging, or independent package evidence. |
| V10.6/V10.7 durable lineage replay and delivery preparation | MISSING | Combined range `00649d3..6c1330b` was reviewed only to prepare Gate B; `86d2bae` repaired null expected-version replay. Source: `6833ea4:docs/reports/V10/V10.6_DURABLE_LINEAGE_REPLAY_INCREMENT.md`. | The review explicitly excludes real PostgreSQL, browser, and staging Gate B evidence; the range is not in `ca96cba`. |
| Entire example/property/state-machine and attack campaign at one frozen Gate B SHA | MISSING | `6833ea4:docs/reports/V10/GATE_B_HARD_PROPERTY_EVIDENCE_LEDGER.md` maps all 14 properties and records narrow observed increments. | Its ledger requires a frozen whole-candidate rerun; mapped or observed slices are not closure. |
| Non-production Supabase RLS/grant negative evidence | MISSING | Dedicated target candidate `21cc41e` recorded grants/RLS PASS. Source: `6833ea4:docs/reports/V10/GATE_B_HARD_PROPERTY_EVIDENCE_LEDGER.md`. | The result is not bound to the current candidate and does not close the staging crash requirement. |
| Non-production staging crash/connection-loss recovery | FAIL | `21cc41e`; dedicated staging runner recorded `ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC` during `CRASH_CONNECTION_LOSS`. Source: `6833ea4:docs/reports/V10/GATE_B_HARD_PROPERTY_EVIDENCE_LEDGER.md`. | Preserved fail-closed; no retry, waiver, or substitute is recorded. |
| Two-country/two-Office browser E2E | NOT_RUN | No immutable browser run is recorded in the candidate or Gate B ledger. | Required by V10.4; no unit or PostgreSQL suite substitutes for it. |
| No production mutation and no V11 implementation by this candidate | EVIDENCED | `ca96cba`; CI 35185858398 uses disposable services only, and `docs/reports/V09/TEST_EVIDENCE.json` records production access/mutation false and main merge unauthorized. | This is a candidate-local boundary, not a release authorization. |
| Independent final Gate B review binding code and evidence commits | MISSING | No final independent Gate B decision exists for `ca96cba` or a composed V10 candidate. | Scoped V10 review and V09 implementation assessment are not final Gate B review. |

## Candidate-lineage check

The current evidence tip is V09-only. Historical V10/Gate-B documentation is
reachable from `6833ea437857b1b3265b8e0486ef9e8c20de99cd` on
`codex/v10-1-implementation`, but that commit is not an ancestor of
`ca96cba`. It can inform the matrix, not be silently inherited as evidence for
the V09 candidate.

## Smallest truthful next route

No single run can make a truthful Gate B decision today:

1. The staging crash row is an explicit `FAIL`, not a runnable local gap; it
   needs an approved alternate non-production evidence route or an explicit
   waiver.
2. Browser E2E needs an owner-approved target and is `NOT_RUN`.
3. Existing V10 slices need a single immutable composed candidate before their
   full regression can be attributed to one Gate B SHA.

After those non-test prerequisites exist, the smallest one-run code evidence
route is one unmodified `pnpm check` on that frozen composed candidate using
Node 24.20.0 and pnpm 12.3.4. It would still not convert the staging `FAIL` or
browser `NOT_RUN` into `PASS`; a final independent Gate B review remains
mandatory.
