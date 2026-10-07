# A — Owner non-host financial adoption increment

Base `278c9c98527bcda4f3942f3b6b47e8e926a14ca0`; branch `codex/a-non-host-financial-adoption`; clean new checkout. P0 source-only parallel implementation preparation. No shared status/ADR promotion, production activation, migration, host or second World.

## Authority and scope

Owner instruction bytes SHA-256 `57bfdec38a9a400991cb26362a99d33d7a81c8e6258c03460185e51501fb5ac5` and D02 implementation supplement `5d07a94e087f545dc3c1948a321ccd74c16aecb4483f5266de59085186c7d29b` read completely. Root records real adoption; old proposal/audit remains historical. D01=B=TGA claim, D02=R mirrored claim plus complete sourced CB sheet and once-only signed net worth, D03=five explicit policies, D05 excluded. No default-zero classification or full-manifest self-approval.

A owns only existing opening-economic-decision.ts, official-world-opening-admission.ts, opening-canonical-seed-bridge.ts and their focused tests/config. E owns the new source-adoption loader; C/G/F own command/API/domain integration. Shared Core factories, OpeningSeed, WorldState, public barrels, migrations and status are not edited. Existing constructors and durable seed/readback remain the only path.

## Minimal E consumer requirements (for Root integration)

Consume E's `OwnerNonHostSourceAdoption` as a runtime-verified branded server object, not caller JSON. Please expose the existing brand assertion/guard and exact producer export. A needs:

- VerifiedOfficialOpeningSource + existing officialOpeningTrustedDecisionSource, not another mapper.
- Independently resolved actual Owner policy record and reference/content hash/decision subset; TEST_ONLY records explicitly scoped and rejected by production composition. A will not create a fake old full-intent adoption record.
- Per country frozen raw finance strings/pointers/hash, existing five entity IDs, currency code and approved openingFX with source/version, field-level denomination (GCU equivalent vs actual LC); no Number conversion.
- Existing 840 stock cells and 619 adopted title=risk=OP rows, keeping 221 zero cells in reconciliation only.
- CB 10 asset / 7 liability / 4 equity category inventory with instrument amount/currency/source pointer/class/counterparty/claim/available status, or explicit approved zero/NOT_APPLICABLE; missing/null stays a concrete SOURCE_MISSING. No bank A/R/B used as CB backing. Independently established list completeness is mandatory before net-worth derivation. Equity components must not fabricate earnings/loss history.
- A will form existing FinancialAccount/FinancialOpeningLeg/OpeningSeed carriers from validated actual E output. Per-currency financial batches are required by existing Core; GCU reserves cannot be renamed LC. CB net-worth valuation is once-only opening metadata/leg semantics, not a runtime balancing updater.

No new financial factory required so far: existing Core supports signed equity via positive DEBIT/CREDIT legs and multiple single-currency batches. Any representation gap will be reported by exact module path before shared changes.

## Validation / exit

Real source identities; FX not 1; CB net worth positive/zero/negative; missing/full-list checks; claims do not duplicate B/R; H/D holders; exact source L/E deltas; existing non-deposit runtime liability remains unchanged; accepted seed passed to existing durable store/lineage reader in isolated in-memory SQL fixtures, idempotent retries/conflict/rollback with persisted readback (not printing input).

Only focused impacted regressions, pinned Node24.20.0/pnpm12.3.4, strict type/build/lint/format/boundary/secret/environment checks. No native/live DB or API/Worker/Clock startup. Independent review PENDING; freeze source-only head/tree/base/diff/checks/hashes, list precise non-host gaps and STOP. No source review is independent economic admission publication.

## Implemented consumer and integration boundary

`prepareOwnerAdoptedOpeningSeed` now consumes E's actual WeakSet-branded policy/source output. It does not turn the subset Owner receipt into a fictitious legacy full-intent adoption record. The real NON_ACTIVATED input returns null seed with field/category/country blockers. Formal World, native LC/opening FX and complete CB holding register are not available from the fixed source; null is not approved zero. Known R/TGA are liabilities, not a backing portfolio.

The current parser rejects the superseded independent-pool/GENESIS_POOL grammar and requires full source B as a mirrored TGA claim, without separate CB cash. Existing admission diagnostics reject GCU-as-LC and the old SPLIT_APPROVED label. Existing selected-source bootstrap remains distinct from diagnostic readiness and still requires AUTHORITATIVE_DATASET provenance; multiple single-currency native/GCU batches may cover a country. This patch does not publish any admission row or change approval/status authority.

The isolated TEST_ONLY composition is the same existing Core OpeningSeed, FinancialOpeningLeg, claim/account and inventory path. Each CB register requires 21 explicit category dispositions per country, with no null-as-zero. Fixture native LC/FX and synthetic cash holdings are explicitly not real source/Owner economic approval. Unsupported nonzero CB instruments or deposits with undeclared paired carriers fail closed. No production register constructor exists. DOCUMENTED_ASSUMPTION fixture seed provenance is explicit and cannot satisfy the official bootstrap's AUTHORITATIVE_DATASET provenance check.

Source L/E and original equity inputs are retained with derived deltas. Opening CB A-L is signed and recorded once; native currency components are not fabricated retained earnings, government injection or spendable cash. Existing running Financial Posting/replay can add a non-deposit bank liability without resetting L to H+D or recomputing opening equity.

## Review assembly provenance

A branch contains only the three owned modules, focused tests/config and this plan. It intentionally does not copy/commit E's module or Root's Owner files. Standalone A compilation therefore requires their integration; build/test evidence below is for a clean base archive plus byte-identical A files and independently owned dependencies, not an assertion that A alone includes them.

Disposable composition: `/private/tmp/a-owner-financial-composition.q8rQ4C`.

- E module `apps/world-worker/src/preparation/owner-non-host-source-adoption.ts`: SHA256 `971491ce144ad3fb9c81518ba2c79d1e1dc5a109e39fb18ed423ad7b702b85cd`. E's own revision fixed its TS4058 declaration export error; A did not edit E.
- Portable actual Owner original: `docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md`, SHA256 `57bfdec38a9a400991cb26362a99d33d7a81c8e6258c03460185e51501fb5ac5`.
- Portable Root receipt: `docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json`, SHA256 `2c06c4bd1157a2d245143190c4d17b0499b5d09f42159a414846d0f9bcb8d99e`.
- Unchanged base sources: 8/8 original spec hashes match requirements/source_manifest.json; actual E loader verifies mapping, checksums, fixed proposal and all 34 structured datasets. No raw source rewrite or historic approval overwrite.

Tests cover exact non-1 FX including overflow/zero rejection, no double conversion, full B/R claim mirrors, H/D holders, retained raw L/E/deltas, positive/zero/negative CB net worth, native GCU cash distinct from LC, missing/duplicate/counterparty/category failures, TEST_ONLY brand/scope exclusion, 619 inventory entries/221 retained zero cells, actual PGlite store/readback/reconstruction, identical retry/conflict, injected insert rollback and deterministic running non-deposit-liability replay. Duplicate authoritative transition facts are rejected, not executed twice; durable opening retries remain idempotent.

Independent review, formal admission, full same-lineage command/API/UI loop, native PostgreSQL failure proof, activation and production deployment remain PENDING/NOT_RUN as applicable. C/G/F/D own their integration. This candidate is source-only preparation, not V09 stage entry or package/Gate B completion.

## Final local validation

Final unchanged composed runtime/test bytes: 20 test files / 155 tests PASS (7 financial/source/durable files plus architecture). Core build, composed Worker declaration build, four focused TypeScript configurations, owned-file ESLint/Prettier, diff whitespace, boundary and authoritative-pattern scanners PASS. Repository secrets PASS (2010 files), local environment PASS with databaseConfigured=false, NOT_LINKED and databaseMutationAllowed=false. A-owned runtime/test/config files byte-match the tested composition; E dependency remains separately pinned above. Earlier failing fixture adaptations and E declaration error were corrected before this final matrix; no test was skipped or weakened to permit an economic mismatch.

The first frozen candidate is retained under `/Users/samuel/Documents/econclub/artifacts/a-non-host-financial-adoption-20261007.h8tUSF/`. A forward-only R2 adds field-level denomination/source/FX provenance to the persisted source payload (alongside the raw values) and asserts its exact preservation. Final immutable review evidence is under `/Users/samuel/Documents/econclub/artifacts/a-non-host-financial-adoption-20261007-r2.qGxLld/`; its head/tree/diff/hash handoff is the review target. No frozen historical bytes or commits were overwritten. No main merge, publication, formal seed/admission, migration, database activation, credentials, production connection or service startup was performed.
