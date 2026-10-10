# A — Formal financial opening calculation slice

2026-10-10 · **P0 / IMPLEMENTED_UNVERIFIED / independent review PENDING**.

## Fixed scope and candidate binding

- Base: `42991acfee9d0eacc702ba47a380c938a4516f03`, tree `1254c4144279717c9075e9bbf07b4b2ac4710558`.
- Branch: `codex/a-formal-financial-opening-20261010`.
- Checkout: `/Users/samuel/Documents/econclub/.econmind-worktrees/a-start-ready-audit-20261010`.
- Final commit/tree and this report's SHA-256 are provided in the immutable delivery handoff; source/test file hashes and actual command outputs are in `FORMAL_FINANCIAL_IMPLEMENTATION_EVIDENCE.json`. No self-referential commit hash is embedded here.
- Existing `OPENING_CHAIN_GAP_AUDIT.md` is preserved as the preceding fixed-base audit, not rewritten as implementation or current passing evidence.

This batch implements actual parsing, exact conversion, deterministic financial batch construction and reconciliation. It does **not** integrate preflight/publisher, create a formal source-adoption authority, or return a seed that can be imported. There is no P0 approval, merge/push, step advancement, production or startup claim.

## Changed files

| File                                                                     | Responsibility                                                                                                                                        |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/world-worker/src/preparation/formal-financial-opening-contract.ts` | Strict versioned financial input schema, source byte/hash/pointer/value checks, real existing subset-adoption binding, non-authoritative parser brand |
| `apps/world-worker/src/preparation/formal-financial-opening-producer.ts` | Exact D01/D02/D03 calculations, LC/native batches, reciprocal claims, source-preserving reconciliation and Core validation                            |
| `tests/world-core/formal-financial-opening.test.ts`                      | Dedicated shape/source/financial/property/restart tests; all supplemental positive records are generated mechanism vectors                            |
| `tests/support/tsconfig.formal-financial-opening.json`                   | Dedicated strict test configuration inheriting existing strict defaults, no global relaxation                                                         |
| `docs/reports/start-ready-20261010/A/*`                                  | Preserved audit, first failing test artifact, implementation report and command/hash evidence                                                         |

No existing code file, dependency manifest/lockfile, Core export, loader pin, runtime composition, private authority, preflight/publisher, schema/migration, status/gate, formal dataset, Map/CSS or legacy public/auth/storage file is changed. Existing Core interfaces already suffice for this calculation slice.

## Implemented APIs and semantics

`parseFormalFinancialOpeningContract(input, realNonActivatedAdoption)`:

- Requires a genuine WeakSet-branded `OwnerNonHostSourceAdoption` from the existing independently pinned source/Owner loader, in `NON_ACTIVATED_PREPARATION`. Copied DTOs and TEST_ONLY adoptions fail. Binds exact receipt SHA, adoption-manifest fingerprint and original finance SHA.
- Requires exact schema keys, 70 unique source country IDs, an explicit non-GCU LC, positive canonical decimal `localCurrencyPerGcu`, explicit version and valid `YYYY-MM-DD` value date. Does not invent a currency-uniqueness rule; countries may share a source-declared LC.
- Supplemental documents carry relative provenance path, ID, SHA-256, version, date and canonical UTF-8 JSON bytes. Per-document limit 4 MiB; total 16 MiB; at most 256 documents. Source references resolve existing JSON pointers and compare exact semantic values. Duplicate-key/noncanonical JSON, numeric financial values, changed bytes, missing pointers and stale source versions fail.
- CB register explicitly covers all 21 existing categories, with source-linked declared holdings versus source-linked no-declared-instrument entries. Amount/unit/currency/holder/counterparty, usability text, valuation rate, version/date and completeness summary are required; missing/unknown amounts do not become zero. A declared zero remains a distinct sourced calculation input.
- Supported carriers are cash, same-country source-backed reciprocal claims among the existing roster, and original equity audit components. Unsupported issuer/counterparty carriers fail explicitly rather than fabricating a legal entity or reserve backing. One native-currency valuation rate per country/date is enforced; LC identity valuation is 1 and GCU valuation equals opening FX.

`produceFormalFinancialOpening({adoption, contract})`:

- Rechecks both parser provenance and actual adoption binding. Converts all seven original scenario-GCU finance fields to LC exactly once using the existing exact helper. Original lexemes/fields/source pointers remain visible.
- Emits B/TGA and R as single two-sided claims, with reciprocal identity/amount/currency; neither becomes CB cash/backing. H and D retain adopted HOUSEHOLDS/OP holders. Explicit bank-loan counterpart registers must sum exactly to the source A component.
- Applies the approved opening-only bank `L=H+D`, `E=R+A−L`; preserves original L/E and deltas. An extra CB→BANK opening loan that would contradict that fixed anchor is blocked, not hidden by resetting equity.
- Derives CB opening net worth only from the supplied complete asset/liability register valued in LC; positive/zero/negative outcomes are supported. Native balances are retained in separate currency batches rather than duplicated as LC assets. Opening equity records native net positions, not cash injections; source equity subcomponents stay in reconciliation with derived/original/delta disclosure.
- Produces stable hashed batch/account/claim/leg IDs, sorted per-country/currency batches and fingerprints; validates counterparts and exact conservation with the existing Core constructor, canonical parse and ledger rebuild. The internal validation seed is explicitly `TEST_FIXTURE` and is discarded. No seed or branded source is exposed.
- Returns no partial candidate when any country's arithmetic, source-component consistency or Core validation fails.

The result is deliberately `status: BLOCKED`, `seed: null`, `admissionAllowed: false`, `activationAllowed: false`, even when actual financial computation succeeds. The candidate contains usable calculated batches/reconciliations and fingerprints, labelled `UNADOPTED_FINANCIAL_CALCULATION_NOT_IMPORTABLE`. The current real receipt approves D01/D02/D03/D04 rules in non-host scope; it does not verify a chosen World or adopt arbitrary supplemental LC/FX/CB values. Accordingly `SUPPLEMENTAL_FINANCIAL_SOURCE_ADOPTION_UNRESOLVED` and `FORMAL_WORLD_BINDING_UNRESOLVED` remain explicit; mechanism vectors have an additional non-formal-source blocker. Changing `evidenceKind` or choosing a formal-looking World ID cannot grant authority.

D04 physical/portfolio book values are not admitted as financial backing or converted into cash. Other domain ownership remains unchanged. Existing TEST_ONLY guards are untouched.

## Actual verification

Environment: Node **24.20.0**, pnpm **12.3.4**, frozen offline installation (161 cached packages, no downloads; lifecycle scripts disabled). Commands used a cleared environment with `ECONMIND_ENV=local`; safe-environment check reports no configured database, linked Supabase NOT_LINKED and mutation disallowed. Full command strings/stdout/exit codes are retained in the evidence JSON.

| Check                                                                                         | Observed result                                                                      |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Core build (`pnpm --filter @econmind/core build`)                                             | Exit 0                                                                               |
| Final Worker build (`pnpm --filter @econmind/world-worker build`)                             | Exit 0                                                                               |
| Dedicated strict `tsc -p tests/support/tsconfig.formal-financial-opening.json --pretty false` | Exit 0, no strict-default overrides                                                  |
| Targeted ESLint, report/source Prettier check, `git diff --check`                             | Exit 0                                                                               |
| New calculation + three existing source/bridge/preflight test files                           | Exit 0: 74 tests = 29 new + 45 existing                                              |
| Final dedicated calculation file after adding restart/shared-LC coverage                      | Exit 0: **31/31**; replaces earlier new-file counts, not additional duplicated cases |
| Repository boundary / authoritative-pattern checks                                            | Exit 0 / PASS                                                                        |
| Toolchain / safe environment / repository secret checks                                       | Exit 0 / PASS                                                                        |

There are **76 distinct passing cases across the applicable final commands**, not one 76-case run. The earlier 28/30-case passes and 8 bounded property iterations are not added as extra cases.

First dedicated run was **23 PASS / 2 FAIL / exit 1**, retained in `FORMAL_FINANCIAL_FIRST_TEST_RESULT.json`. Both failures were test construction defects: the copied-adoption helper rejected unrelated numeric diagnostic fields before the intended brand assertion, and the overflow vector generator overflowed before calling the producer. Fixed assertions now exercise the actual brand/producer boundaries. No existing regression was deleted, weakened or skipped. Removed only the duplicate tool-generated `.vitest/json/output.json` after preserving its first-failure contents in this report directory.

The final tests exercise FX≠1, exact source conversion, LC+GCU and an extra native currency, per-currency conservation, reciprocal B/R, unchanged raw finance, positive/zero/negative CB net worth, sourced original equity/deltas, supported securities, incompatible bank funding, missing fields/category coverage/source references, source tampering despite updated hashes, duplicate instruments, valuation conflict, canonical shape/range, all-or-zero failure, deterministic ordering/reparse and a **fresh Node process** reloading the genuine source/adoption and reproducing the candidate fingerprint.

## Not covered / remaining dependencies

- No real complete supplemental LC/FX/CB package or formal World adoption is present or approved by this implementation. All positive supplemental data is **MECHANISM ONLY**, not formal source evidence. A server-owned independently reviewed source/adoption resolver is a later dependency; no signing keys, persistent credentials or authority callback were invented.
- All 70 actual fixed-source bank A components are zero. Unexpected loan totals are tested and rejected; a positive-A source-backed admission is **NOT_VERIFIED**, not synthesized by modifying the fixed source. Unsupported cross-country/other issuer instruments require their exact source/counterpart carrier, not manufactured balances.
- No full check/420/native database run; no PostgreSQL/PGlite or production access; no DB bootstrap/idempotency/SQL permission/recovery evidence is claimed for this pure calculation slice.
- No preflight/publisher/loader integration, versioned ready-selection change, formal canonical seed/inventory assembly, sole-publisher resumable import/readback, outbox/atomic writer integration, deployment or Clock/economic action. These cannot depend on this P0 candidate until independent approval and scoped integration authority.
- Existing main and deployed HOLD sources remain distinct. Nothing here changes the deployment or previously recorded readiness/gates.

Next authorized handoff is the fixed commit/tree plus evidence to independent B or another non-implementer. **No merge, VERIFIED status or dependent integration before approval. Report delivered; STOP.**
