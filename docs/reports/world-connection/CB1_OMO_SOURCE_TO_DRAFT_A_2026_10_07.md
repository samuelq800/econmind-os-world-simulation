# CB-1 source-to-draft A — fixed candidate handoff

## Candidate identity and authority

Branch: `codex/a-cb1-omo-source-draft`. Base:
`afff74f3b7dd3611aa3d8a8d62dc8e9f0eb33c11`, tree
`a4aebf121ad122010230b4fc7f418421978a10d7`. Final commit/tree/diff digest are
bound by the external fixed receipt, avoiding a self-referential commit hash.

Status: IMPLEMENTED_UNVERIFIED / NON_ACTIVATED / PARALLEL_PREPARATION.
Independent review: PENDING. This does not start V09, modify governance status,
complete the formal 70-country source, authorize a host, or replace the frozen
financial opening bridge. No existing tracked file was changed.

Binding references: immutable E backlog at `bb285afe2f6405678b096f84b560aeb07291859a`
(`docs/reports/world-connection/E_FOUR_OFFICE_RUNTIME_GAPS_2026_10_07.md`),
Central Bank U0270–U0289 and U0815–U0817, and the approved ADR-17 ownership.
The disappeared mutable E checkout path was not treated as missing specification.
No original source audit or merged bridge verification was repeated.

## Delivered boundary

- `CORE_CENTRAL_BANK_OMO_V1` / `CENTRAL_BANK_MONETARY_POLICY` / CENTRAL_BANK.
  Strict direction, security/batch, LC face value, immediate settlement tick,
  optional text policy note. No client quotation, balances, backing aggregates,
  settlement cash amount, M1/TGA patch or caller authorization verdict.
- Server reader contract supplies a coherent current WorldVersion/Event sequence,
  actual quote, issuer, complete held-batch register, encumbrance, maturity,
  complete BANK/CB snapshots and canonical opening-plus-global-lineage financial
  state. Each monetary field reconciles to an existing posted account, with no
  omitted BANK/CB accounts. R asset and R liability are the same actual mirrored
  claim. Missing source rejects before downstream factory entry.
- `calculateOpenMarketOperation` remains the only financial calculation kernel.
  Face × actual price is exact decimal Money. BUY has CB securities DEBIT,
  CB reserve liability CREDIT, BANK reserve asset DEBIT, BANK securities CREDIT;
  SELL reverses all four. No Treasury injection or duplicate reserve claim.
- One global authoritative transition binds the Financial Posting Batch, securities
  rights Event, final receipt and outbox. Securities face/carrying value transfers
  conserve the batch; encumbrance is unchanged and actual available face bounds
  sale. No fake physical-inventory transfer or independent version stream.
- Rights replay regenerates the canonical command/source/kernel Event, checks
  predecessor holdings, rejects altered evidence and preserves exact duplicates.
  Financial replay uses the existing V08 global lineage reconstruction/apply.
- Worker adapter emits the existing Atomic Draft; current commit proof is
  re-resolved before/after source acquisition and at factory entry. The existing
  server-held SQL transaction-cutoff guard and lease/fencing repository are
  unchanged and remain authoritative. No second table, host or economic writer.

## Actual validation

Pinned environment: Node 24.20.0 / pnpm 12.3.4; one offline frozen-lockfile install,
no downloads, no repeated large checkout/build copies.

| Check                                                                      | Result / boundary                                                          |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Core build                                                                 | PASS, exit 0, new module included                                          |
| Focused CB-1 matrix                                                        | PASS, 25 tests, one file, exit 0                                           |
| Existing regressions                                                       | PASS, 52 tests, four files, exit 0                                         |
| Scoped source-composition typecheck                                        | PASS, exit 0                                                               |
| Scoped ESLint                                                              | PASS, exit 0                                                               |
| Worker composition build                                                   | PASS, exit 0, with Root's one export simulated in generated artifacts only |
| Repository boundary check                                                  | PASS, 263 source files, exit 0, after Worker build                         |
| Authoritative pattern check                                                | PASS, 77 Core / 258 total files, exit 0                                    |
| Safe environment                                                           | PASS; databaseConfigured=false, mutationAllowed=false                      |
| Secrets                                                                    | PASS, 2057 files, exit 0                                                   |
| Production SQL / concurrent writer / deployment / formal source activation | NOT_RUN                                                                    |

Regression files: `v19-bank-central-foundation.test.ts`,
`v08-ledger-authority-boundary.test.ts`,
`v08-global-transition-reconstruction.test.ts`, `command-receipts.test.ts`.

Focused cases: BUY/SELL four exact legs; non-par 1.25 quote; fractional face
0.1 → settlement 0.125; actual batch into explicit zero holding with unrelated
holdings unchanged; insufficient R on SELL; unchanged TGA; same R claim; exact
financial/rights replay; existing final receipt prevents a second factory call;
altered Event rejected; missing quote/holdings/source, encumbrance, zero price,
wrong currency/issuer, maturity, stale version/time, snapshot/ledger mismatch,
valuation mismatch, forged ledger brand, wrong account mapping and zero fence
reject with no downstream factory/economic effects; optional note; copied proof
rejected before source read; revocation before/during acquisition; server SQL
authorization revision mismatch at the existing cutoff guard.

The cutoff test exercises the real guard against a bounded SQL-executor fixture;
it is NOT real database/concurrency/release evidence. Initial test/type failures
were fixture contract mistakes and were repaired without weakening assertions.
An initial boundary run failed on unbuilt Worker export artifacts; rerun after
composition build passed. Standalone Worker build FAILS until Root adds the
owned Core export. Do not describe composition PASS as standalone branch CI PASS.
`tsconfig.cb1.json` adds DOM types for Vitest's tinybench declaration only; no
production configuration or skipLibCheck relaxation was made.

## Exact Root integration dependency

Root alone adds to `packages/core/src/index.ts`:

```ts
export * from './commands/central-bank-open-market-operation.js';
```

A did not edit that shared source file. Scoped tests use a TEST_ONLY composition
barrel with the same single export; Worker build used this line in the ignored
generated Core JS/declaration artifacts. Regeneration removes those artifact
edits. Root must build from its actual stitched source and rerun the focused
matrix; no borrowed mutable workspace packages/cache were used.

Root must call `loadCentralBankOmoCandidateSource` before entering
`createCentralBankOmoCandidateFactory(...).prepare(...)`. Bind real durable
reader/ID allocation to the command identity/fingerprint and same lease/version;
retain the existing authoritative transaction cutoff, fence and version checks.
Domain-invalid rejection handling remains the existing Root command lifecycle.

## Remaining gaps and exclusions

REAL_CB_SOURCE = INSUFFICIENT_EVIDENCE. Official current quote, actual securities
batch/rights, complete BANK/CB snapshots and real simulation clock are not
fabricated. The E opening manifest, R/A aggregates and the already merged A
financial bridge cannot supply missing securities or full CB books.

The deliberately minimal supported boundary is immediate single-LC settlement,
existing one-account-per-snapshot-field mapping, and carrying-value slices equal
to the actual trade price. Explicit zero held batches are permitted; missing
ledger accounts are not invented as approved zeros. Multi-account valuation,
foreign-currency books and any required mark-to-market/P&L postings fail closed
pending their proper source/owned implementation. Future settlement needs Root's
existing scheduler, not client timing or invented clock values.

SHARED_DOMAIN_PERSISTENCE = PENDING. Draft currentMaterializations is empty:
Root owns securities domain replay/intake/dispatch/checkpoints and must atomically
compose them with the canonical global lineage before activation. This candidate
alone is not a production-executable complete CB host. There is no new migration,
schema, table, source seed, writer, API route, UI patch, release or production
access. No status, ADR, existing ledger implementation or frozen bridge changed.

Stop at the fixed candidate for Root integration and independent review. No
self-approval, merge/promotion, formal opening activation or next package entry.
