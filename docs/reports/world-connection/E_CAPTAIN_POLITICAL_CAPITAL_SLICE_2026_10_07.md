# E CAP-1 source-to-draft handoff

Status: **IMPLEMENTED_UNVERIFIED**. Independent P0 review: **PENDING**.
This is an implemented, invoked TEST_ONLY mechanism slice, not official Captain
gameplay, production connectivity, V09 closure, database activation or Gate B.

## Fixed implementation

- Repository: `econmind-os-world-simulation`.
- Checkout: `/Users/samuel/Documents/econclub/.econmind-worktrees/e-opening-decision-reconciliation`.
- Branch: `codex/e-captain-political-capital-slice`.
- Base: `afff74f3b7dd3611aa3d8a8d62dc8e9f0eb33c11`.
- Implementation: `b9d2bdb5623272f61b5e93395501bbf6f4f50fe7`.
- Implementation tree: `47c278ba9e34b23236392187e21bf161c2729ae7`.
- Final documentation commit/tree/diff and file hashes: external
  `/Users/samuel/Documents/econclub/artifacts/E_CAPTAIN_POLITICAL_CAPITAL_SLICE_2026_10_07/E_FREEZE.json`.

Scope is two new modules, dedicated test/config/plan/report, and exactly one Core
root command export. No existing engine, AtomicTransitionRepository, shared
intake, dispatcher, UI, database schema, governance status or frozen A/C/D/F/G/E
candidate was rewritten. Root owns normal integration and independent review.
Concurrent main advancement is not silently rebased into this fixed candidate.

## What actually executes

`processQueuedCommand` issues the existing command-bound authorization proof;
the new factory requires CAPTAIN / CAPTAIN_CABINET, reauthorizes that real proof,
then invokes the server source port. The test source supplies explicit immutable
TEST_ONLY capital and an actual TEST_ONLY cabinet reason record. No new proof
issuer, alternate clock, economic engine or persistence writer exists.

Command type: `CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1`.
Payload schema: `captain-political-capital-allocation-v1`; exactly
`schemaVersion`, `fromBucket`, `toBucket`, `amount`, `reasonFactRef`.
Amount is a positive canonical string quantity in `political_capital`.
Unknown/missing fields, numeric amounts, extra balances, GDP/financial patches,
same/unknown buckets, non-Captain or unversioned envelopes refuse before read.

The one server read binds world/country, global WorldVersion and event sequence,
explicit SimTime, exact capital and actual reason record to the same trace/hash.
The existing `preparePoliticalCapitalAllocation` performs the allocation.
The factory emits one event, existing transition and final-receipt semantics,
one notification and a derived event-bound country checkpoint. Financial and
inventory postings are empty because this operation moves neither money nor goods.
Tests also invoke the existing `prepareAtomicTransitionCandidate`; they do NOT
invoke `AtomicTransitionRepository.commit` or invent a replacement transaction.

The reducer validates event and command hashes/bindings, recomputes the existing
kernel and compares the complete event payload. It accepts only the matching
predecessor capital/head. Exact duplicate event/command identities return the
same state; conflicting identities refuse. Global intake/idempotency-key
enforcement remains the existing Core/durable submission responsibility.

## Actual TEST_ONLY before/delta/after

World `WORLD_TEST_ONLY_CAPTAIN_01`, country `COUNTRY_01`, version `7 → 8`,
global event sequence `12 → 13`, SimTime `24000`. These are explicit mechanism
fixtures, NOT adopted opening values or fallback defaults.

| Bucket              | Before | Delta  | After  |
| ------------------- | ------ | ------ | ------ |
| FISCAL_REFORM       | 10.25  | -7.125 | 3.125  |
| INDUSTRIAL_STRATEGY | 15.75  | +7.125 | 22.875 |

The other five balances remain `10, 10, 10, 10, 14`. Bucket sum remains `80`;
opening `90`, generated `10`, total `100`, available `80`, spent `20`, closing
`80` are unchanged. No capital generation, spending, macro buff, cash movement,
free official opening, zero initialization or random source is introduced.

Queued retry reads the existing final receipt with exactly one source invocation
and one captured TEST_ONLY effect. Replay retry returns the same state object.
Invalid intent, missing state/reason, wrong world/country/head/hash/time,
insufficient bucket, wrong/cloned/mismatched proof, revoked authority and expired
or cross-world lease produce no returned draft/captured effect. Revocation before
queued execution records the existing zero-effect receipt and calls neither the
factory nor source. Event outcome tampering and replay predecessor conflicts refuse.

## Fixed server port and remaining authority

`CaptainPoliticalCapitalCandidateSource.load({ command, observedAtReal })` returns
either `{ kind: 'MISSING', missing }` or `{ kind: 'READ', snapshot, lease }`.
`snapshot` contains world/country/global head and event sequence, trace, capital
fact and actual country reason fact (`countryRef`, `recordRef`, non-empty `reason`).
The port belongs ONLY to trusted Worker composition. No balance or source object
is accepted in the command/request payload.

**READ is a port result, not an authority certificate.** A production adapter must
verify durable event lineage and actual reason-record provenance at one consistent
cutoff before supplying it. A DTO, FoundationFact, hash, sourceRef or READ tag is
not proof that those records exist or are authoritative. This candidate ships NO
production-ready reader, SQL adapter or official source issuer. The injectable
port is a server dependency contract, not a safe verifier for arbitrary callers.

Without a server adapter the default refuses with exactly:

- `CURRENT_WORLD_HEAD`
- `POLITICAL_CAPITAL_EVENT_LINEAGE`
- `REASON_RECORD`
- `WRITER_LEASE`

Root integration still requires:

1. Existing authenticated intake catalog and shared dispatcher routing to the
   factory, not another intake or an uninvoked capability declaration.
2. Shared authoritative domain replay reader joining the current global head,
   actual political-capital event lineage and real reason records. Root must
   maintain global version/sequence context through unrelated World events.
3. Checkpoint policy compatible with the existing atomic materialization CAS.
   A sparse country checkpoint can be older than the global predecessor after
   unrelated commands; current repository CAS rejects that update. No bypass,
   shadow balance or repository/SQL change was made here. Root must resolve this
   before activation; a checkpoint alone is never authority.
4. Real transaction/fence/CAS/event/receipt/outbox readback and authorization
   projection/UI consumption. All remain NOT_RUN / NOT_CONNECTED in this slice.

## Real checks

Node `24.20.0`, pnpm `12.3.4`; existing frozen dependencies, own checkout links,
own `node_modules/.vite` and own Core dist (1.7 MiB). No installs, full-map build,
PostgreSQL process, production Supabase request, key access, SQL or migration.

| Check                                                                                                              | Actual result                                     |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `pnpm --filter @econmind/core build` using pinned Node/pnpm                                                        | PASS                                              |
| `vitest run tests/world-core/captain-political-capital-slice.test.ts` after repair and atomic-candidate validation | exit 0; 27/27 PASS                                |
| Existing V24.1 Captain preparation + command-receipts regression in first combined run                             | 30/30 PASS; not repeated                          |
| `tsc -p tests/support/tsconfig.captain-political-capital-slice.json --pretty false`                                | exit 0 PASS                                       |
| `eslint` on new Core/Worker/test modules                                                                           | exit 0 PASS                                       |
| `prettier --check` on six implementation files                                                                     | exit 0 PASS                                       |
| `node scripts/check-boundaries.mjs`                                                                                | PASS; 263 files                                   |
| `node scripts/check-authoritative-patterns.mjs`                                                                    | PASS; 258 files / 77 Core files                   |
| `ECONMIND_ENV=local node scripts/assert-safe-environment.mjs`                                                      | PASS; no configured database; mutation disallowed |
| `node scripts/check-repository-secrets.mjs` before documentation freeze                                            | PASS; 2055 files                                  |
| `git diff --check` / staged diff check                                                                             | exit 0 PASS                                       |
| Real PG/Supabase/SQL/transaction persistence, deployment, UI gameplay                                              | NOT_RUN                                           |

Failures retained, not relabeled: first combined run was exit 1, 8 failures and
49 passes (27 new + 30 legacy tests total). Tests initially mixed Core src/dist
brands and SimTime instances. They were repaired to import the own linked Core
package. First focused retry had 26/27 passes and one incorrect existing
`classifyCommandIdentity` argument order; focused typecheck also identified it.
After correction 27/27 passed; adding the actual existing atomic-candidate
validation then passed 27/27 again. No invariant/test was removed or weakened.
Only the new bounded slice was rerun; successful legacy checks were not repeated.

Permissions/migrations/legacy impact: none. Secrets: no values copied into
source, commit or report. Disk pressure constrained work to small sources/checks;
no other window's generated files or evidence were deleted by E.

Delivery: fixed candidate for Root/B review; P0 approval pending. E stops after
handoff. Passing mechanism checks do not approve merge, activate the source,
complete V09, or establish an official playable Captain path.
