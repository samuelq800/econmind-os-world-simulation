# G opening-inclusive classified financial position candidate

Status: `IMPLEMENTED_UNVERIFIED`; P0 independent review `PENDING`.

## Identity, scope and authority

Root authorized this separate source increment after reporting B approval of
frozen privacy candidate `b17c9c9518f6f2dc389692f09cb297263f0f5e75`.
The new branch `codex/g-opening-inclusive-financial-read` starts at requested
Root composition `521ef209e73075ff685d1b620ca817b39c7a0898`. That base lacked
b17, so dependency commit `e340a5d` applies the unchanged reviewed privacy
implementation, resolving only Core package/index conflicts by retaining both
public subpaths and the existing Central Bank OMO export. The implementation
increment is separately diffable against that dependency. Original b17, intake,
O, gap evidence and other workers' source are unchanged.

Owned changes: the same SQL visibility consumer/sole publisher, pure existing
visibility contract and its sole Core barrel, actual PostgreSQL API strict wire
validator, focused tests/helper and this report. No migration, database/seed/
admission writer, grants, official source mutation, host, Clock, settlement,
production activation, UI or independent approval.

Authority remains Constitution R099 / `CONSTITUTION-U0381-U0382`, Finance
`FINANCE-U0831-U0847`, and Central Bank `CENTRAL_BANK-U0585-U0602`. Exact original
source hashes and actual admitted-carrier requirements remain those recorded in
`G_ECONOMIC_READ_PRIVACY_2026_10_07.md`. Classified owner detail remains Treasury
for Finance and central bank for Central Bank; account class/prefix/membership
cannot invent further disclosure rights.

## One authoritative replay and exact carrier

The existing `SqlEconomicReadVisibilitySource` now retains a bounded
`openingBinding` only after its actual SQL admission + immutable canonical seed
carrier successfully resolves the lawful roster. The binding contains seed ID,
fingerprint and opening WorldVersion. No caller provides or overrides it.

The sole publisher invokes the existing `DurableV08LedgerLineageReader.rebuildFrom`
in the same held publication transaction. That reader loads the immutable seed,
reconstructs real global Command/Event/FinancialPosting and InventoryPosting
facts with existing Core constructors, calls the existing joint
`rebuildV08LedgersFromLineage`, and checks the actual complete durable head. The
publisher compares replay seed ID/fingerprint and financial World/head with the
held admitted binding before any replacement. There is no copied balance
algorithm, alternate ledger, caller snapshot or opening arithmetic. Owner
classification selects from the Core-authorized financial positions before
serialization. Unresolved source and unauthorized Offices return a denial;
malformed admitted lineage/head fails before the projection is replaced.

The exact new wire field is `payload.ledger.authoritativeFinancialPosition`,
exported as `AuthoritativeFinancialPosition` through the existing pure direct
`@econmind/core/economic-read-visibility-contract` subpath:

- Denied: schema `authoritative-financial-position-v1`, status `NOT_AUTHORIZED`,
  and a bounded denial reason. No positions, seed metadata or zero is supplied.
- Authorized: the same schema, status `AUTHORIZED_FILTERED`, semantics
  `OPENING_PLUS_POSTING_LINEAGE`, positionCoverage `NONZERO_LEDGER_POSITIONS`,
  sourceHead `{ worldVersion, eventSequence }`, opening
  `{ seedId, seedFingerprint, openingWorldVersion }`, governing sourceUnits,
  and positions `{ accountId, accountClass, currency, netDebitBalance }`.

The positions are the existing Core sparse nonzero signed debit positions.
Credit/equity positions may be negative. This field is not a spendable-funds,
liquidity or cash-availability calculation. It emits no synthesized zero for a
missing source or omitted account. Original `ledger.financialPositions` retains
its exact net-posting-movement semantics and is not silently relabeled or added
to the new field. COUNTRY, other Offices and stock/public monetary details remain
withheld. D has no UI change in this increment.

The actual API accepts prior classified movement-only wire for compatibility;
absence of the new field supplies no absolute-position claim. If present, the
new field must pass an exact bounded shape, lawful private Office/status,
canonical sparse Money/account identities, exact outer watermark/source-head
binding, canonical seed fingerprint/version and bounded source units. Extra raw
fields, zero/duplicate positions, wrong head/semantics and denied objects carrying
positions fail with `PROTOCOL_ERROR`. Legacy unclassified raw cache rejection,
parameterized SQL, real signed/current authorization, entitlements, minimum
watermark and NEGOTIATION_PARTY behavior remain intact. A shape/marker is not an
admission or disclosure grant; the actual sole publisher/source retains that
responsibility.

## Observed verification

Pinned Node 24.20.0 / pnpm 12.3.4. Offline frozen install: 161 reused, 0 downloaded.
Core, Worker and API builds each exited 0. Expanded focused strict test typecheck
exited 0. Final lint/format results are in the external receipt.

Focused nine-suite matrix: **89 PASS**, exit 0, starting 23:21:05 Asia/Shanghai,
51.67 seconds. Source/publisher 13, actual API validator 24, Country/Office flow
3, pure direct runtime/type export 1, durable lineage reader 3, opening seed
reconciliation 16, existing architectural boundaries 29. The positive uses real
disposable PGlite tables, persisted canonical admitted source/seed, native Core
Command/Event/FinancialPosting constructors, actual durable global posting replay,
sole publication and actual SQL API read: opening 10 plus movement +3/-3 produces
Treasury 13 and buyer central bank 7, while old movement remains +3/-3. It checks
all six Offices/COUNTRY withholding, wrong subject/scope and explicit entitlement
revocation. Negative cases cover bad head, corrupt Event-only lineage, missing
admission, mismatched canonical source and eight strict API wire failures.

Ordinary boundary scan PASS 288 files; authoritative patterns PASS 87 Core/283
files; secrets PASS 2142 files; safe environment PASS local, databaseConfigured
false, NOT_LINKED and databaseMutationAllowed false. Diff check exited 0.

Preserved earlier failures in this increment:

- Initial source suite **7 PASS / 1 FAIL** at 23:18:54: exact old expected DTO
  lacked the new explicit withheld field. Expectation updated; no guard weakened.
- Next bounded source/API matrix **27 PASS / 2 FAIL** at 23:19:45: entitlement
  revocation fixture omitted mandatory revoked_at, and SQL correctly rejected
  a FinancialPosting bound to a corrupt Event hash before the intended replay
  test. Revocation now uses the actual valid inactive+revoked form. Corrupt
  Event-only negative fixture emits no FinancialPosting and proves actual
  replay hash rejection; no SQL trigger/evidence guard was bypassed.
- Initial final lint found two unnecessary quote escapes in pure export smoke.
  They were removed. A subsequent script continued later checks despite this
  lint failure; its overall shell exit 0 is not a lint PASS. Final separate lint
  result is recorded explicitly.

## Literal remaining boundaries

Native PostgreSQL concurrency/RLS/grants, native/full 420 matrix, D browser/UI,
production host execution, official admission, activation and release are
`NOT_RUN`. The current real official admitted carrier remains unavailable. The
explicit disposable admission/source is mechanism evidence and never an owner
approval, actual monetary adoption or production grant. Existing runtime
admission veto remains unchanged. This increment provides conditional lawful
opening-inclusive replay, not official activation, available funds or a finished
joint native/browser product. Independent B source P0 review and normal Root
integration remain pending; no selfmerge or Gate/readiness claim.
