# F staged durable Command intake — implementation handoff

Risk: **P0**. Candidate only; independent B review required before merge.
This is not Gate B approval, a formal step promotion or an end-to-end user flow.

- Exact baseline: `e8c4337aa6db3922eb13159264485cf5177703f4`.
- Exact implementation: `3223f3a45b12948aa400034bdc5df9d559a3440b`.
- Branch: `codex/f-durable-command-receipt`.
- Authority: 2026-09-27 code-first owner instruction, scoped in
  `docs/exec-plans/CODE_COMPLETION_2026_09_27.md` at the baseline.
- Native evidence: SUCCESS, [run 36302385602](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/36302385602),
  bound to the exact implementation above.

## Files and ownership

All implementation files are additions; no existing runtime file is changed.

| File                                                              | Responsibility                                                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/world-worker/src/intake/postgres-narrow-transfer-intake.ts` | Server-only staged acceptance, approval-gated queue dispatch and scoped durable status reads  |
| `tests/support/f-durable-command-intake-suite.ts`                 | Shared focused behavioral suite; existing two-country test-only identities and transfer terms |
| `tests/integration/f-durable-command-intake.test.ts`              | PGlite execution; no native parallel-session claim                                            |
| `tests/integration/f-durable-command-intake-postgres.test.ts`     | Existing `PostgresSqlDatabase` driver against guarded disposable PG16                         |
| `tests/support/tsconfig.f-durable-intake.json`                    | Typechecks implementation and test closure                                                    |
| `.github/workflows/f-durable-command-intake.yml`                  | One focused, isolated PG16 job; no full-repository rerun                                      |
| `docs/exec-plans/F_DURABLE_COMMAND_INTAKE.md`                     | Frozen plan, P0 boundary and sequencing                                                       |

No A migration/schema/manifest/approval-store, E API reader, original website,
production data or `status/progress.json` is modified. Test setup applies
existing 0001–0015 artifacts to an empty disposable database; it refuses an
existing Command table and never drops a schema. A's subsequently approved
0017 is intentionally not a dependency of this frozen candidate.

## Server contract and ordering

`PostgresNarrowTransferIntake` is constructed with the existing server-owned
`SqlDatabase` transaction adapter and canonical `Sha256Hex` adapter. Native
use supplies the existing `PostgresSqlDatabase`. It exposes:

```ts
submitPending(input: NarrowTransferIntakeInput): Promise<NarrowTransferIntakeState>;
enqueueApproved(input: NarrowTransferIntakeInput): Promise<NarrowTransferIntakeState>;
read(input: NarrowTransferIntakeInput): Promise<NarrowTransferIntakeState>;
```

All methods require the same canonical Command, trusted server observation
time, and `{ actorId, authorization: AuthorizedOfficeContext }` binding. This
binding must come from server authentication/actor resolution, not JSON. The
existing opaque Office context is validated; identity, country, Office,
capability, team and authorization revision must match the locked current
database projection. SQL does not invent an AuthSubject-to-actor mapping.

| State                         | Meaning and permitted interpretation                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PENDING_APPROVAL_OR_ENQUEUE` | Immutable intent exists; no queue row. Approvals may still be missing or complete but not explicitly dispatched. Not economic acceptance/settlement. |
| `QUEUED`                      | Exactly one existing discretionary queue row is PENDING. Not a final receipt and not proof of future execution approval.                             |
| `EXECUTING`                   | Queue is CLAIMED. Not proof of an economic commit.                                                                                                   |
| `FINAL`                       | Stored final Command receipt was read and bound to the exact intent. Only this variant contains `receipt`.                                           |
| `NOT_FOUND`                   | A successful scoped read found no durable intent. `enqueueApproved` does not implicitly submit.                                                      |
| `UNKNOWN`                     | The attempted operation could not be confirmed. Contains exact retry identity/fingerprint, `retryable: true`, no acknowledgement and no receipt.     |

1. `submitPending` locks World head, checks both ID/key identities and current
   authorization, enforces expected version and offer lifetime for first
   acceptance, then writes only `command_submission`. No queue is created.
2. Existing `NarrowTransferApprovalStore.openSellerOffer` and
   `signBuyerOffice` can now reference that actual durable intent. The intake
   adapter neither signs nor approves on behalf of anyone.
3. `enqueueApproved` locks the same head/submission, rechecks current scope and
   version, and calls the existing fixed approval guard for Seller Trade,
   Buyer Trade and Buyer Finance, including revision and expiration checks.
   Only then does it insert one existing `command_queue` row.
4. Existing Worker lease/claim, authorization cutoff, economic candidate and
   atomic repository remain the only economic execution path. Intake never
   claims, updates WorldVersion, writes Postings/Events/receipts/outbox, or
   retries the economic transaction.

Exact ID/key/fingerprint retries load original immutable audit timestamps and
correlation data; transport-only changes do not create new intent. Changed
payload, version, ID/key binding or actor scope fails closed. Once queued or
final, an exact retry returns that state despite a changed World head or
expired offer, while still requiring current caller access. This does not
renew approval; the Worker must recheck approval at its own commit cutoff.
Two distinct pending intents may observe the same version: intake does not
reserve N→N+1 or promise both can execute. Worker version/fence rules decide.

## Uncertain completion

The adapter never invisibly retries a write callback. On an operational
transaction failure it opens one fresh read transaction and rechecks identity
and access. A durable pending record confirms submission; queue or final state
confirms dispatch. A pending record alone cannot confirm enqueue. An absent
record, failed recovery query or still-pending enqueue yields `UNKNOWN`.
Even a locally observed precommit rollback is conservatively `UNKNOWN` at this
public recovery surface, not a forged terminal rejection. Semantic permission,
version and identity errors remain typed errors, not final receipts.

## Verification

Pinned Node 24.20.0 / pnpm 12.3.4, frozen lockfile.

- Focused four-file Vitest run: **52 PASS, 1 SKIP**. The skip is explicitly the
  native-only multi-session World-head test; PGlite serializes transactions.
- New PGlite suite: 25 executed cases. Existing approval-store, final receipt
  reader and local HTTP command bridge regressions are unchanged and pass.
- `pnpm --filter @econmind/core build`: PASS.
- `pnpm --filter @econmind/world-worker build`: PASS.
- `pnpm exec tsc -p tests/support/tsconfig.f-durable-intake.json`: PASS.
- ESLint and Prettier on the seven changed paths: PASS.
- `pnpm test:boundaries`: 34 tests PASS; both repository scanners PASS.
- `pnpm env:check`: PASS, database not configured, Supabase not linked.
- `pnpm secrets:check`: PASS.
- `pnpm migration:validate`: PASS, existing 16 migrations unchanged.
- `git diff --cached --check`: PASS.
- Local native PostgreSQL: NOT_RUN; no local PG16 service/CLI available.
- Native CI: **26/26 PASS, no skips**, job `108572328721`, exact run above.
  Container logs confirm PostgreSQL **16.15**. Existing `PostgresSqlDatabase`
  executes the transactions with a four-connection pool; this is not a
  PGlite suite merely run beside a PostgreSQL service.

Focused test command:

```sh
pnpm exec vitest run tests/integration/f-durable-command-intake.test.ts tests/world-core/v10-narrow-transfer-approval-store.test.ts tests/integration/world-api-postgres-final-receipt-reader.test.ts tests/world-api/local-nonproduction-http-bridge.test.ts
```

Faults tested: exception after submission/queue SQL but before COMMIT (no new
durable rows from that transaction); lost acknowledgement after real COMMIT
(recover by reading, one intent/queue); commit followed by recovery-read
unavailability (UNKNOWN then exact retry). These are deterministic wrappers,
not process crashes/network kills. No concurrency beyond two ordinary calls.

One test reads a genuine zero-effect REJECTED receipt written by the existing
Worker repository under a lease-bound claim. It does not claim a successful
economic reservation, delivery, full browser flow or COMMITTED business
transition. Intake write-boundary tests assert no economic Event/Posting/outbox writes.

Initial local failures were corrected before freezing the candidate: the test
lease helper originally passed an expiry timestamp instead of the existing
millisecond-duration argument; two unused test destructuring variables failed
lint. Subsequent runs above passed; no test was weakened to hide them.

## Exact remaining connection gaps

- Old `DurableNarrowTransferReceiptPort.acceptOrRead` and HTTP/browser DTOs
  are **unchanged**. They require approval before intake and promise final
  receipt synchronously; this staged adapter does not implement that interface.
- A future reviewed HTTP contract must expose pending/queue/status separately,
  bind verified JWT → current server actor/Office → canonical full transfer
  Command/SimTime/expected version, and preserve the exact retry identity.
  A proposalRef-only request cannot safely invent canonical economic terms.
- Connect approved 0017 immutable approval references and E's real Finance
  reader before replacing the current fixture boundary. This candidate has no
  dependency on unreviewed or guessed reference fields.
- Bind actual lease/claim scheduling and the existing approved Worker economic
  candidate path. No API can write economic facts or create a fake final result.
- Deployment roles/RLS/JWT gateway, browser usage, staging/TLS, production,
  full lifecycle/long-run and independent Gate B acceptance remain NOT_RUN or
  pending outside this slice. PG superuser fixture evidence is not deployed
  least-privilege authorization evidence.

No full `pnpm check` was repeated. No merge, formal status update, approval or
next-slice implementation is authorized by this handoff itself.
