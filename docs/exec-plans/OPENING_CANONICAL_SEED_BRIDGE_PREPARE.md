# Opening decision → existing canonical seed bridge

## Scope and authority

Authorized non-activated parallel preparation; not a formal dependency-gate promotion. P0. Fixed implementation base: approved decision contract `bc45f68fd65fffc8d13af470205f269da1b8fb15`. Root owns subsequent main reconciliation and independent review. Other owners' changes are preserved.

New owned paths only: `apps/world-worker/src/preparation/opening-canonical-seed-bridge.ts`, `tests/world-core/opening-canonical-seed-bridge.test.ts`, dedicated `tests/support/tsconfig.opening-canonical-seed-bridge.json`, and this plan. No E/C/F/G module, shared export, Core algorithm, status, schema, migration or activation changes.

## Reuse investigation

Existing `createOpeningSource` / `createOpeningSeed` build canonical source/seed and enforce positive opening quantities, opposite financial legs and exact batch balance. `parseOpeningSeed` revalidates all canonical evidence; `rebuildV08LedgersFromLineage` reconstructs the existing ledgers. Reuse these functions; do not copy their accounting rules.

`WorldOpeningSeedStore` persists an already built seed and rejects fixture sources; it is not a decision builder. `inspectOfficialWorldOpeningAdmission` inspects frozen mapping/gaps/coverage; `OfficialWorldOpeningBootstrapper` takes an already built seed and executes bootstrap. Neither constructs a seed from the new decision contract. No equivalent decision→seed bridge was found at the owned boundary.

Existing official admission still requires approved mapping/gaps and the Treasury `SPLIT_APPROVED` label. A candidate is never admitted by this bridge; deposit-at-CB admission compatibility remains a later explicit review issue, not a label rewrite.

## Intended mechanism

Server-only explicit input: decision plus independently resolved source/owner records, exact frozen mapping bytes, and fully specified canonical seed assembly. Re-run approved A inspection inside the bridge. Never accept a caller approval flag or a precomputed validation result as authority.

Missing or invalid country inputs return `BLOCKED` and `seed = null`. Bind the entire explicit per-country assembly hash into a `DOMAIN_ADOPTED` provenance node covered by the existing A owner intent, including roster, inventory account bindings and every financial leg. An assembly hash without that independently loaded adoption is not approval.

Validate all 70 country identities, fixed five-entity roster, 840 original stock cells (619 positive/221 zero), exact inventory amount/unit/location/title/risk and explicit financial owner/claim/positions against the approved decision. Retain zero cells and original finance lexemes in source provenance; emit no zero-amount Core entries/legs. Never synthesize CB backing, funding equity, counterparty legs, IDs or allocations to make a batch balance.

Construct only through existing Core constructors and parser/reconstruction. Maximum output is `NOT_ADMITTED` candidate. No Store/bootstrap/database/World/Worker calls.

## Progress

- [x] Governance and existing builder/admission investigation.
- [x] Implement isolated bridge and explicit adoption binding.
- [x] Focused mechanism tests, typecheck, lint and import boundary.
- [x] Actual official-input blocked evidence and dedicated emit.
- [ ] Freeze head/tree/base/diff for independent review.

## Risks and checks

P0: untrusted adoption/source boundary; amount-conserving but semantically wrong financial legs; missing claim opposite account; zero versus missing; CB backing; rights/source coverage; canonical seed mistaken for admission. Tests will cover these normal engineering failures without broad scans or an attack campaign.

P1: deterministic ordering, duplicate identities, unsupported schema/model/replay and reproducible source/fingerprints. Focused type/lint/format/build/import-boundary checks and this slice's tests only; repair failures without skipping invariants. Actual economics and admission remain unresolved unless explicit records are supplied.

## Implemented API and ownership boundary

`prepareOpeningCanonicalSeed({decision, trusted, frozenMappingBytes, assembly})` re-inspects A internally and returns per-country blockers with `seed = null`, or a Core-parsed/rebuilt `NOT_ADMITTED` candidate. Always `activationAllowed = false`, `admissionEvaluated = false`. No callback can activate it. Malformed assembly fails closed. `sourceIdentity` carries pinned expected scope counts; `mappingBytesVerified` distinguishes actual byte verification from those expected constants.

`OpeningCanonicalSeedAssembly` names explicit seed/source IDs, current Core replay binding, decision-bound orchestrator version and all 70 country assemblies. Each contains the fixed five-entity roster, positive inventory entries with complete existing Core accounts, one explicit Core-compatible financial batch and a provenance reference. `openingCountrySeedAssemblyFingerprint` binds the global header, exact frozen mapping identity and the full per-country assembly excluding only its own adoption reference. This utility produces identity, never approval. Every country requires an A-validated `DOMAIN_ADOPTED` / `EXPLICIT_OWNER_VALUE` node with that value, current owner-record reference and all seven original source-field input refs. This does not create a new owner-record protocol or load authority from a caller.

Financial validation checks declared CB positions and reserve/Treasury claim accounts, the bank component totals, household/business reciprocal deposits and explicit genesis funding. All legs and any funding equity must already be supplied and adopted; the bridge calculates no missing leg/account/amount. Claims require two reciprocal asset/liability legs with one ID, exact amount and opposite directions; claim/account reuse across countries is rejected. Core remains authoritative for batch balancing and seed acceptance.

The narrow bridge supports the fixed source's zero bank-loan opening. A nonzero loan model is explicitly blocked rather than building an unreviewed borrower/history adapter or modifying Core. Non-roster accounts and unsupported account classes are also blocked. Treasury deposit-at-CB is mechanically Core-compatible in the focused inert test; its existing official-admission labeling remains unresolved. No full domain initialization or real backing-asset existence is proven by a consistent declared balance sheet.

Inventory keeps 840 original cells in source provenance, creates only 619 positive entries and keeps 221 zero cells without zero Core entries. Exact original finance strings remain alongside the adopted decision/explicit assembly; canonical Core amounts never overwrite them. Country/source enumeration is normalized; bound leg/inventory order remains part of the adopted assembly identity.

## Actual checks so far

- Offline frozen install, ignore install scripts: PASS (161 reused, zero downloaded).
- Existing Core package build: PASS. No Worker process/build or DB.
- Focused bridge test file: PASS, 16/16. Includes inert candidate parser/replay, real-source pending inputs, approval spoofing, missing adoption, changed mapping, country/pointer mismatch, missing/zero/wrong-owner stock, roster change, missing/cross-country claims, source-inconsistent balanced finance, unadopted CB backing, schema/replay/numeric failures, Core opposite-leg rejection and restart/order determinism.
- Dedicated TypeScript check: PASS. Initial iteration had one branded account-ID Map key declaration error, corrected without weakening an assertion.
- ESLint on new module/test: PASS.
- Existing AST import/ownership analyzer, new module only: PASS, zero violations.
- Dedicated two-file config emit into external evidence directory: PASS. No source-adjacent JavaScript emitted.
- Bounded plaintext-secret / dangerous `VITE_*` environment scan over the four new files: PASS, no findings. This is not a repository-wide secret audit or live environment verification.

Mechanism fixture owner records, World and explicit funding/backing are labeled inert; they are not actual owner economics or admission evidence. No approved test is rerun as a full-runtime claim. Status endpoint remains `IMPLEMENTED_UNVERIFIED` until independent review.

## Actual official-input diagnostic

Evidence directory: `/Users/samuel/Documents/econclub/artifacts/a-opening-canonical-seed-bridge-20261007.1qpMKI`.

The external read-only diagnostic checks frozen mapping bytes, passes its exact 70-country finance strings to A and supplies no owner records, World ID, allocation/rules/roster/CB positions or assembly. Model/orchestrator are explicitly `UNRESOLVED`, not guessed deployed versions. Result: `BLOCKED`, `seed = null`, 70 countries, 840 field blockers; admission unevaluated and activation forbidden. The full result is `OFFICIAL_PENDING_RESULT.json`. The 840 blocker count is coincidental, not the count of stock mismatches.

Codes: `WORLD_ID_BINDING_REQUIRED`, `OWNER_ADOPTION_RECORD_MISSING`, `UNRESOLVED_HUMAN_ECONOMIC_INPUT`, `UNRESOLVED_LEGAL_ENTITY`, `VALUE_PROVENANCE_NOT_ESTABLISHED`, `CANONICAL_SEED_ASSEMBLY_MISSING`. With legal/model choices absent, this is an unresolved diagnostic, not a claim that later account/backing/domain checks have passed.

No official source table or reconciliation report was regenerated. Diagnostic code/compiled outputs remain outside the Git patch. Initial artifact dependency-link setup ran before the output directory existed; retried after emit completion. Pretty JSON exceeded the tool-output capture limit, so evidence collection changed to compact stdout without changing validation; full JSON was then saved. These collection/setup failures do not represent a passing check or an economic code fix.
