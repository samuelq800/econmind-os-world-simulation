# CB instrument declarations and real financial reads

IMPLEMENTED_UNVERIFIED, independent branch from World
`cbc908bafb9a17fcefbe97f7415ebc073ca29e28`. This branch does not include the
unadopted Finance cap-only proposal or change the frozen native candidate.

## Existing source and actual block

The financial genesis explicitly checks all 70 source rows for publicDebt=0,
bankLoanAssets=0, existingContracts=[] and historicalClaims=[]. Its policy says
`EXPLICIT_NEW_SCENARIO_NO_DECLARED_INSTRUMENT_NOT_OBSERVED_ZERO` and generates the
complete CB category register. A treasury deposit or bank reserve claim is not
a government-security holding. The GCU opening adds BANK cash/equity, not an OMO
security, bank mandate or executable security price.

These financial facts already have their own genuine genesis/admission and
bounded projection path. They are not missing merely because independent OMO
adoption is absent. The new reader consumes the existing `cb-categories`,
`cb-holdings` and `bank-loans` documents through the existing exact-seat/World
bounded SQL reader, verifies full bounded pages and matching source pins, and
separates a verified no-declared CB government-security category from a missing
or revoked document. Unknown source counts remain null, never zero.

## Connected read path

- The existing posting-aware financial store opts into this fixed reader for
  CENTRAL_BANK `ledger-balances`; other datasets and default store consumers are
  unchanged. Its current financial rows are retained, including actual CB claims
  and the controlled domestic BANK cash/claim crop. No economic row is inferred
  from the instrument status.
- The existing API enables this option and includes
  `source.centralBankOpeningInstruments` plus its raw seed/bundle hash bindings.
  No new endpoint, SQL, source role, table grant or custody publisher is added.
- The existing browser client checks office/dataset, country, seed fingerprint,
  admission and hashes. The existing read view labels **CB opening holdings** as
  no-declared or source unavailable beside the current financial table.

The status measurement is
`ADMITTED_OPENING_DECLARATION_NOT_CURRENT_TRADABILITY`, with origin 0/0 even at a
later observed head. It is not current zero inventory or a tradability claim.
The parent financial page still needs its supported complete-prefix coverage
and actual observed head. Unsupported/unknown event effects keep the existing
current read unavailable; this change neither ignores a frame nor changes that
reducer. Bad hashes/scope or contradictory declared/empty holdings fail. A truly
missing source document can be labeled unavailable while valid current funds
remain visible. No quote, securities, loan, spendable balance or readiness token
is created.

## Correction of the initial non-H0 read path

The initial `6ed87e0d` implementation incorrectly called the legacy H0 page RPC
for these documents even at a positive World head. The real old SQL returns
STALE there; the H6 transport vector incorrectly supplied a PAGE and did not
exercise that SQL gate. The original 93 light cases are not evidence for that
non-H0 composition. The preserved real H1 regression first confirms the old RPC
returns STALE and reproduces the original helper failure after a valid current
funds read. No SQL gate is loosened and STALE is never translated to absence.

The fixed reader first reads the actual current CB seat/header on the same
executor. At exactly H0 it retains the old H0 route; at positive heads it uses
the existing posting-aware financial store with the instrument option omitted
(no recursive decoration). Each immutable dataset still has origin 0/0, but
observedHead and complete financial coverage must match the current funds page,
as must scope, seed/admission, canonical/bundle hashes, model and replay binding.
A missing current-head projection of an immutable original means the source
**readout is unavailable**, not that the original never existed or is zero.

The added actual SQL H1 case holds a low-role RR READ ONLY snapshot, reads real
stored current funds and all three immutable opening datasets together, and
asserts four posting-aware RPC calls and no legacy H0 page calls on that path.
Its setup uses explicit TEST_ONLY small source/admission/cache metadata and an
actual Core reconstructed financial ledger plus stored Social frame; it is SQL
infrastructure evidence, not native consumer or formal opening acceptance.

## The 24-account interface

`assertCentralBankOmoOpeningOriginal` / `reconcileSnapshot` require distinct
real accounts for all BANK14 and CB10 fields, including zero fields, and reject
unmapped owner accounts. That is a strict existing **trading adapter**. The real
ledger has sparse zero-free accounts, distinct household/operator deposit claims
and additional GCU cash/equity. Reading those real rows does not require 24
accounts. It would be wrong to add dummy zero accounts or merge legal claims to
make this adapter pass. This branch leaves the settlement kernel and exhaustive
mapping unchanged and uses the existing financial read model instead.

An executable OMO still needs an independently registered source/adoption,
actual security terms/batch/issuer/holder/face/maturity/encumbrance/carrying value,
and an admitted current quote. The old source publisher requires an adopted
quote; the startup header requires independent source adoption. This branch does
not turn empty financial originals into either record. A future quote-free
empty-source custody registration would require a separately reviewed fixed
admission seam; it is not a blocker to these legitimate financial reads.

## Evidence and limits

The added PGlite case uses the real existing baseline/permit/projection SQL,
low reader role, TEST_ONLY signed permit and bounded source documents. It checks
verified empty CB security declarations, actual non-security TGA claim DATA,
source hashes and revocation returning unknown. It does not reconstruct the
70-country seed, constitute official source approval or prove OMO settlement.

Store/contract vectors check a current BANK GCU row remains unchanged alongside
origin-0 absence, missing originals produce null counts, and substituted seed
pins fail. Browser protocol/DOM checks show the balance and the opening-only
label together, preserve funds when the source is unavailable, and clear private
rows on bad source binding. These are protocol fixtures, not Chromium/native.

No new institution, economic policy, OMO adoption, instrument issuance, price,
consumer, Clock, raw online seed grant or production action is introduced. This
is a bounded CB financial read improvement, not completion of the CB office or
permission to transact.
