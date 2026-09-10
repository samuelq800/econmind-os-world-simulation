# V08 package review bundle

## Status and requested review

```text
PACKAGE=V08 — 库存与金融posting基础
STATUS=IMPLEMENTED_UNVERIFIED
READINESS=READY_FOR_PACKAGE_REVIEW
BRANCH=codex/world-core-v08
AUTHORITATIVE_MAIN=ec3ceff57b2657b374432b5ab3b4cbc1f78e003d
INDEPENDENT_REVIEW=NOT_RUN
MERGE_AUTHORIZED=NO
PRODUCTION_MUTATION=NONE
V09=NOT_STARTED
```

Review B should independently inspect the immutable package target recorded in
`PACKAGE_REVIEW_TARGET.md`. This bundle is evidence, not self-approval.

## Fixed implementation lineage

| Step  | Exact contract                    | Code candidate                             | State                  |
| ----- | --------------------------------- | ------------------------------------------ | ---------------------- |
| V08.1 | 库存可用/预留/在途 Ledger         | `a73c35d32d93f4067ab4e6228dbb65a4ab64734e` | IMPLEMENTED_UNVERIFIED |
| V08.2 | 金融 Accounts/Postings 基础       | `f5c022c7957a1128660d25e36ea46df99964a850` | IMPLEMENTED_UNVERIFIED |
| V08.3 | 期初 Seed/Reconciliation Contract | `4f0da4104b928f3504c50164147324c8af0deab5` | IMPLEMENTED_UNVERIFIED |

ADR-02, ADR-05 and ADR-17 are owner-approved and recorded. ADR-07 remains
future construction/GDP scope. ADR-08 did not become applicable because every
implemented calculation is exact addition/subtraction/equality over canonical
`Money`/`Quantity`, with no rounding, FX, minor-unit conversion or formula
policy.

## Package invariants for attack

1. `WORLD_INVENTORY_POSTING` is the only V08 inventory balance writer. Every
   movement is exact two-leg batch-conserved and cannot produce negative stock.
2. Physical location, reservation, shipment, country, title, risk and economic
   recognition remain distinct. Only explicit delivery input may change the
   latter ownership/recognition identities; V10 behavior is not inferred.
3. `WORLD_FINANCIAL_POSTING` is the only V08 financial position writer. Every
   batch has two or more strictly positive legs and exact debit=credit in one
   currency; no unilateral or implicit-FX path exists.
4. Posting identities bind canonical intent. Exact retry is idempotent; reused
   identity with changed intent fails closed. V07 Command/Event/SimTime and
   WorldVersion evidence remains attached.
5. Opening sources bind kind, locator, version, canonical payload and SHA-256.
   Financial openings have explicit opposite counterpart legs and exact balance.
6. Ledger head is reconstructed from opening seed plus ordered postings.
   Snapshot is optional derived evidence; mismatch is reported and never
   averaged, repaired or written back.
7. V09 atomic writer, persistence, lease, fencing and recovery remain absent.

## Tests and migration state

- V08 focused: 6 files / 40 tests / PASS.
- Full repository: 37 files / 455 tests / PASS.
- Protected architecture: 3 files / 34 tests / PASS.
- Authoritative scanner: 28 Core / 40 total files / PASS.
- Boundary scanner: 45 files / PASS.
- Governance: 14 groups / PASS.
- Migration validation and clean/existing PGlite rehearsal: 4 existing
  migrations / PASS.
- Environment, lint, format, types, policy, secret scan (511 files) and all
  builds: PASS.

V08 added no migration. The separate production publisher preflight remains
blocked by remote migration-history divergence; this package neither repairs
nor bypasses it. No manual SQL, ad-hoc repair, second publisher, production
access or database mutation occurred.

## P0/P1 review focus

Attack exact conservation under ordering and retries, forged object boundaries,
zero and negative values, account identity redefinition, cross-currency input,
counterpart/source tampering, snapshot mismatch and V07/V09 ownership leakage.
There are zero recorded open P0 blockers and zero recorded open P1 majors, but
only independent review may confirm or overturn that record.

## Scope exclusions

No production/import/export/consumption/loss engine, trade settlement, banking,
debt issuance/interest/default, fiscal/monetary behavior, GDP/CPI/FX/rounding,
real 70-country seed, legacy migration, UI, persistence transaction, V09 runtime
or production release is included.
