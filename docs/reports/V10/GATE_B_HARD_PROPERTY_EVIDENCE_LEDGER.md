# Gate B hard-property evidence ledger

**Recorded:** 2026-09-16
**Candidate status:** `STAGING_DATABASE_EVIDENCE_PARTIAL_FAIL_CLOSED`
**Authority:** evidence index only; not an approval, promotion, merge, staging,
or Supabase authorization

## Reading this ledger

`MAPPED` means that an executable test surface has been identified. `OBSERVED`
means that a named immutable commit completed the named disposable-CI run.
Neither label means the relevant Gate B property is closed: the final frozen
candidate needs one bounded full regression run, an independent review, and
the owner-approved browser/RLS evidence called out below.

All PostgreSQL evidence in this ledger uses the disposable GitHub Actions
`postgres:16-alpine` service guarded by `V09_TEST_DATABASE_URL`; it does not
contact Supabase, staging, or production.

## Dedicated staging run — 2026-09-16

The owner-authorized, dedicated non-production target was executed once from
candidate `21cc41e`. The runner applied all 16 migrations and recorded PASS
for lease, grants/RLS, commit, role-boundary, marker-bound cleanup, durable
evidence, and independent residue inspection after cleanup. A new client then
confirmed that the scoped schema and v09 roles were absent.

The only failed stage is `CRASH_CONNECTION_LOSS`:
`ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC` from the managed PostgreSQL
pooler/TLS path. The runner retained that first failure and still performed
strict marker-bound cleanup; it is therefore a fail-closed record, not a
passing crash-recovery claim. The durable local evidence artifact is
`evidence/vzwrereseklnrjbtmsmc-gate-b-staging-ownership-matrix.json` outside
this source checkout and contains no connection credential.

This run closes neither a frozen whole-candidate regression nor independent
review. Per the owner instruction, no repeated network retry is planned for
this managed-service failure; Gate B remains `PENDING` until an approved
alternative evidence route or an explicit waiver is recorded.

## Evidence map

| Gate B hard property                              | Mapped executable evidence                                                                                                                    | Observed or pending V10 increment                                                                                                                                                  | Residual Gate B decision boundary                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1. Clock deterministic                            | `tests/world-core/simulation-clock.test.ts`; `tests/property/simulation-clock-properties.test.ts`                                             | MAPPED                                                                                                                                                                             | Must be rerun at the frozen candidate SHA.                           |
| 2. SimTime monotonic                              | `tests/property/simulation-clock-properties.test.ts`; `tests/property/simulation-scheduler-properties.test.ts`                                | MAPPED                                                                                                                                                                             | Must be rerun at the frozen candidate SHA.                           |
| 3. Commands canonical                             | `tests/world-core/command-event-contracts.test.ts`; `tests/property/command-event-properties.test.ts`                                         | MAPPED                                                                                                                                                                             | Must be rerun at the frozen candidate SHA.                           |
| 4. Authorization server-side                      | `tests/world-core/command-receipts.test.ts`; `tests/world-core/v10.4-local-acceptance.test.ts`                                                | OBSERVED: `1e04d72` / CI `34855645977`; approval-aware model `802ba25` / CI `34855951453`                                                                                          | Fresh independent review of the later range remains required.        |
| 5. Idempotency durable                            | `tests/world-core/command-receipts.test.ts`; `tests/property/command-receipt-properties.test.ts`                                              | MAPPED; V10 exact retry model observed in `0391a66` / CI `34852941751`                                                                                                             | Must be rerun at the frozen candidate SHA.                           |
| 6. Events append-only                             | `tests/world-core/command-event-ledger.test.ts`; `tests/world-core/command-event-contracts.test.ts`                                           | MAPPED                                                                                                                                                                             | Must be rerun at the frozen candidate SHA.                           |
| 7. Replay exact                                   | `tests/world-core/replay.test.ts`; `tests/property/replay-properties.test.ts`; `tests/world-core/durable-v08-ledger-lineage-reader.test.ts`   | MAPPED                                                                                                                                                                             | Must be rerun at the frozen candidate SHA.                           |
| 8. Single writer enforced                         | `tests/world-core/world-writer-lease.test.ts`; real PostgreSQL workflow                                                                       | MAPPED                                                                                                                                                                             | Must be rerun at the frozen candidate SHA.                           |
| 9. Transactions atomic                            | `tests/world-core/v10.4-local-acceptance.test.ts`                                                                                             | Reserve/Ship/Deliver five-boundary strict process-kill runs observed through `69b5e22` / CI `34856697664`; dual-pool lifecycle contention observed in `46476c9` / CI `34914425241` | A frozen whole-candidate run and independent review remain required. |
| 10. Inventory conserved                           | `tests/world-core/inventory-ledger.test.ts`; `tests/property/inventory-ledger-properties.test.ts`; V10 lifecycle model                        | MAPPED; lifecycle model observed in CI `34852941751` and `34855951453`                                                                                                             | Must be rerun at the frozen candidate SHA.                           |
| 11. Money conserved                               | `tests/world-core/financial-posting-ledger.test.ts`; `tests/property/financial-posting-properties.test.ts`; V10 delivery acceptance           | MAPPED                                                                                                                                                                             | Must be rerun at the frozen candidate SHA.                           |
| 12. Recovery works                                | `tests/world-core/v09-world-recovery-preparation.test.ts`; V10 restart and strict process-kill cases                                          | Reserve strict kill `7541da7` / CI `34856225295`; Ship strict kill `69b5e22` / CI `34856697664`; Delivery strict kill CI `34850501755`                                             | A frozen whole-candidate run and independent review remain required. |
| 13. Projections non-authoritative and rebuildable | `tests/world-core/v10-authoritative-activity-read-projection-publisher.test.ts`; `tests/world-core/durable-v08-ledger-lineage-reader.test.ts` | MAPPED                                                                                                                                                                             | Must be rerun at the frozen candidate SHA.                           |
| 14. Concurrency safe                              | `tests/world-core/v10.4-local-acceptance.test.ts`                                                                                             | Delivery competition observed in CI `34846740076`; Reserve/Ship dual-pool, same-version competition observed in `46476c9` / CI `34914425241`                                       | A frozen whole-candidate run and independent review remain required. |

## Lifecycle evidence sequence

The current narrow Treasury-GCU lifecycle evidence is bound to these immutable
increments:

| Commit    | Evidence increment                                                                | Disposable CI        |
| --------- | --------------------------------------------------------------------------------- | -------------------- |
| `0391a66` | 250-sequence approval-aware Reserve/Ship/Deliver model                            | `34852941751` passed |
| `42cb6a6` | Ship rollback/restart followed by one Deliver commit                              | `34854082029` passed |
| `4bb27c5` | durable current authorization and approvals for Reserve                           | `34855449298` passed |
| `1e04d72` | Reserve denial after current Finance revocation at transaction cutoff             | `34855645977` passed |
| `802ba25` | generated Finance-revocation lifecycle sequences                                  | `34855951453` passed |
| `7541da7` | Reserve strict `SIGKILL` at five atomic boundaries                                | `34856225295` passed |
| `69b5e22` | Ship strict `SIGKILL` at five atomic boundaries                                   | `34856697664` passed |
| `46476c9` | Reserve and Ship distinct-command contention through independent PostgreSQL pools | `34914425241` passed |

The `SIGKILL` rows require exact `{ code: null, signal: 'SIGKILL' }`, an
unchanged durable footprint after termination, and one later fresh-pool commit
of the same candidate. They are controlled disposable-CI evidence, not a
claim about an external service crash or production recovery.

## Explicit non-closures

- The narrow Treasury-GCU vertical slice does not establish evidence for
  arbitrary future command families.
- No independent review has approved the post-`3a15fac` evidence range.
- Browser E2E and RLS/grant negative verification against an exact
  owner-approved non-production target are unstarted and remain mandatory for
  Gate B. Deferring them keeps Gate B `PENDING`; it does not waive them.
- No main merge, deployment, production mutation, or V11 work is authorized
  by this ledger.
