# Gate B V09/V10 hard-property matrix

**Recorded:** 2026-09-23  
**Code candidate:** `ebc5fcbe010559d5d6a94e86792a77ecc02502d2` (`origin/main`)  
**Decision:** `GATE_B_WORLD_CORE_HARD_GATE = PENDING`

This is a candidate-bound evidence index. It records source inspection and the
focused local execution listed below. It is not an independent approval,
deployment, staging run, production action, or a Gate B PASS decision.

## Result vocabulary

- `EVIDENCED` means the named source test ran successfully against this code
  candidate with the pinned local toolchain.
- `NOT_RUN` means the required execution mode was not run against this code
  candidate. It is not a substitute for `EVIDENCED`.
- `FAIL` preserves an observed failed required route; it is never converted to
  `EVIDENCED` by local tests.

## Candidate-bound source and local evidence

The code tree contains an executable test surface for every hard property. No
new property, state-machine, or attack-vector test was added by this evidence
change: the residual gaps are required execution environments, not an
unrepresented source invariant.

| #   | Hard property                                 | Candidate test surface                                                                                                                                                  | Source/local result                                                            | Required residual evidence                                                                                                |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Clock deterministic                           | `tests/world-core/simulation-clock.test.ts`; `tests/property/simulation-clock-properties.test.ts`                                                                       | `EVIDENCED`                                                                    | Exact full regression: `NOT_RUN`.                                                                                         |
| 2   | SimTime monotonic                             | `tests/property/simulation-clock-properties.test.ts`; `tests/property/simulation-scheduler-properties.test.ts`; `tests/property/command-sequence-state-machine.test.ts` | `EVIDENCED`                                                                    | Exact full regression: `NOT_RUN`.                                                                                         |
| 3   | Commands canonical                            | `tests/world-core/command-event-contracts.test.ts`; `tests/property/command-event-properties.test.ts`                                                                   | `EVIDENCED`                                                                    | Exact full regression: `NOT_RUN`.                                                                                         |
| 4   | Authorization server-side                     | `tests/world-core/v09-commit-authorization-cutoff.test.ts`; `tests/world-core/v10.4-local-acceptance.test.ts`                                                           | `EVIDENCED` for the local/PGlite cutoff and revocation vectors                 | Disposable PostgreSQL cutoff path: `NOT_RUN`; non-production RLS/grant verification: `NOT_RUN`.                           |
| 5   | Idempotency durable                           | `tests/world-core/command-receipts.test.ts`; `tests/property/command-receipt-properties.test.ts`; `tests/world-core/v10.4-local-acceptance.test.ts`                     | `EVIDENCED`                                                                    | Exact full regression: `NOT_RUN`.                                                                                         |
| 6   | Events append-only                            | `tests/world-core/command-event-ledger.test.ts`; `tests/world-core/command-event-contracts.test.ts`                                                                     | `EVIDENCED`                                                                    | Exact full regression: `NOT_RUN`.                                                                                         |
| 7   | Replay exact                                  | `tests/world-core/replay.test.ts`; `tests/property/replay-properties.test.ts`; `tests/world-core/durable-v08-ledger-lineage-reader.test.ts`                             | `EVIDENCED`                                                                    | Exact full regression: `NOT_RUN`.                                                                                         |
| 8   | Single writer enforced                        | `tests/world-core/world-writer-lease.test.ts`; `tests/world-core/world-writer-lease-postgres.test.ts`                                                                   | `EVIDENCED` for the local lease invariant                                      | Disposable PostgreSQL lease path: `NOT_RUN`.                                                                              |
| 9   | Transactions atomic                           | `tests/world-core/v10.4-local-acceptance.test.ts`                                                                                                                       | `EVIDENCED` for isolated local atomic commit/retry and lifecycle vectors       | PostgreSQL restart, acknowledgement, and process-kill vectors: `NOT_RUN`.                                                 |
| 10  | Inventory conserved                           | `tests/world-core/inventory-ledger.test.ts`; `tests/property/inventory-ledger-properties.test.ts`; `tests/world-core/v10.4-local-acceptance.test.ts`                    | `EVIDENCED`                                                                    | Exact full regression: `NOT_RUN`.                                                                                         |
| 11  | Money conserved                               | `tests/world-core/financial-posting-ledger.test.ts`; `tests/property/financial-posting-properties.test.ts`; `tests/world-core/v10.4-local-acceptance.test.ts`           | `EVIDENCED`                                                                    | Exact full regression: `NOT_RUN`.                                                                                         |
| 12  | Recovery works                                | `tests/world-core/v09-world-recovery-preparation.test.ts`; `tests/world-core/v10.4-local-acceptance.test.ts`                                                            | `EVIDENCED` for local lineage, orphan, fencing, and rollback/retry vectors     | PostgreSQL restart and five-checkpoint process-kill recovery: `NOT_RUN`; staging connection-loss evidence remains `FAIL`. |
| 13  | Projections non-authoritative and rebuildable | `tests/world-core/v10-authoritative-activity-read-projection-publisher.test.ts`; `tests/world-core/durable-v08-ledger-lineage-reader.test.ts`                           | `EVIDENCED`                                                                    | Exact full regression: `NOT_RUN`.                                                                                         |
| 14  | Concurrency safe                              | `tests/world-core/v10.4-local-acceptance.test.ts`                                                                                                                       | `EVIDENCED` for local same-version and authorization-aware lifecycle modelling | PostgreSQL independent-pool contention: `NOT_RUN`.                                                                        |

## Executed local commands

All commands used Node `24.20.0` and pnpm `12.3.4`, with the frozen lockfile.
The repository's normal host defaults were not used because they were Node
`26.5.0` and pnpm `11.19.0`, which the repository correctly rejected.

| Command                                                                                                                      | Result                  | Observed scope                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                             | `EVIDENCED`             | Frozen install completed with the pinned toolchain.                                                                             |
| `pnpm --filter @econmind/core build`                                                                                         | `EVIDENCED`             | Core declaration build passed.                                                                                                  |
| `pnpm --filter @econmind/world-worker build`                                                                                 | `EVIDENCED`             | Worker declaration build passed.                                                                                                |
| `pnpm exec vitest run` over the eight listed property/state-machine files with `--testTimeout=30000`                         | `EVIDENCED`             | 8 files, 18 tests passed.                                                                                                       |
| `pnpm exec vitest run` over the nine listed command/ledger/replay/lease/recovery/projection files with `--testTimeout=30000` | `EVIDENCED`             | 9 files, 76 tests passed.                                                                                                       |
| `pnpm exec vitest run tests/world-core/v10.4-local-acceptance.test.ts --testTimeout=30000`                                   | `EVIDENCED` / `NOT_RUN` | 13 local tests passed; 22 PostgreSQL-only tests were correctly skipped because `V09_TEST_DATABASE_URL` was deliberately absent. |

The V10.4 skipped PostgreSQL tests include independent-pool Reserve/Ship/Deliver
contention, restart/acknowledgement recovery, and the five atomic checkpoints
for each of Deliver, Reserve, and Ship. They are not counted as passed.

## Mandatory non-local evidence still open

| Requirement                                           | Status    | Candidate-bound fact                                                                                                                                 |
| ----------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Official unmodified `pnpm check`                      | `NOT_RUN` | No Actions run is attached to `ebc5fcbe`; the current PostgreSQL workflow does not trigger on `main`.                                                |
| Disposable PostgreSQL V09/V10 suite                   | `NOT_RUN` | `V09_TEST_DATABASE_URL` was intentionally absent locally; no exact-SHA Actions execution is recorded.                                                |
| Non-production Supabase RLS/grant negative evidence   | `NOT_RUN` | No same-candidate non-production execution exists.                                                                                                   |
| Non-production staging crash/connection-loss recovery | `FAIL`    | Historical managed-pooler run `21cc41e` failed with `ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC`; no retry, substitute, or waiver is recorded here. |
| Two-country/two-Office browser E2E                    | `NOT_RUN` | No immutable candidate-bound browser result is recorded.                                                                                             |
| Independent final Gate B review                       | `NOT_RUN` | This evidence package does not self-approve a P0/Gate B change.                                                                                      |

## Next route

1. Run the existing disposable PostgreSQL workflow and the unmodified official
   check on this exact code SHA (or record a new immutable replacement SHA).
2. Preserve the staging `FAIL` until the owner records an approved alternate
   non-production evidence route or an explicit waiver.
3. Bind the browser result to an approved two-country/two-Office target.
4. Submit the resulting code and evidence SHAs for independent final Gate B
   review. Until then the decision remains `PENDING`.
