# G economic read disclosure closure candidate

Status: `IMPLEMENTED_UNVERIFIED`; P0 independent review `PENDING`.

## Exact scope and authority

Branch `codex/g-economic-read-privacy`, based on main
`d4e3a8cfba318372d534cf2b281d291edb93333b`. Root authorized the sole activity
publisher, a server visibility consumer, pure shared contract/export, and focused
tests. Root subsequently authorized the PostgreSQL read adapter's mandatory
payload validation and five affected test fixtures. No production publication,
SQL/schema/grant, admission producer, Clock, command, settlement or ledger change.
The fixed G intake/rollback/export/O candidates and original gap report are intact.

Governing source:

- Constitution R099, `CONSTITUTION-U0381-U0382`: classified Treasury/CB detail
  must be isolated in the database/API. Original/requirements SHA256
  `960a7745a8e18b8f1cb10c754ce6681d46bdfc5933a979c4a989bd3a07ff5d49`.
- `FINANCE-U0831-U0847`: Finance-exclusive fiscal registers/forecasts; Captain
  and other Offices receive relevant summaries, not all fiscal ledgers. Original
  SHA256 `5970033c01ba9592a8efac5c6e319c1d7424a6df562e1833e08920bf927a5576`.
- `CENTRAL_BANK-U0585-U0602`: full CB accounts and sensitive banking/facility
  detail are private; named public summaries are distinct. Original SHA256
  `c0fb17cc37a912938957a879b828c7b6139dd9e1ceef0976dc6c35ca072c36e9`.

No source permits arbitrary raw financial/stock accounts in COUNTRY or gives
all Bank/Household/Operator details to Finance. No entity prefix, account class,
capability, or country membership invents disclosure rights.

## Actual carrier and server behavior

`SqlEconomicReadVisibilitySource.loadFrom` checks/holds the exact world head in
the caller's transaction, reads the existing immutable
`runtime_opening_admission`, and loads the same seed through
`WorldOpeningSeedStore`. Admission must match world/seed/fingerprint/model/replay.
The existing complete canonical bridge embeds decision and country assembly in
`opening_seed.sources[].canonicalPayload`; this is the carrier, with no new table.
It must match the frozen mapping/checksums/finance source identities, current
decision parser/fingerprint/scope, seed/source/replay/assembly identity, explicit
country legal entities, and the adopted assembly provenance node. Financial
batch facts must equal that same seed; leg ordering is normalized with Core's
exact ASCII comparator because the adopted assembly retains its original order.

Parsing still returns `UNTRUSTED_DECISION_CANDIDATE`. Labels/adoption references
alone never authorize disclosure: the independent immutable SQL admission is a
separate prerequisite. The production admission veto remains unchanged. The
consumer implements no admission writer. The current non-host TEST_ONLY source
is unsupported; source/bootstrap/technical review does not turn it into a grant.

Only actual country Treasury owner detail is selected for FINANCE and actual
central-bank owner detail for CENTRAL_BANK. Cross-world/country, wrong Office,
unresolved owner and unsupported source are `NOT_AUTHORIZED`. Raw inventory
detail and unproven monetary COUNTRY summaries remain `NOT_AUTHORIZED`.
The same held-transaction port classifies both existing movement accounts and
future opening accounts; this increment does not wire opening-inclusive balances.

The sole publisher selects accounts per Office **before** aggregation. It no
longer copies all country money/stock detail into COUNTRY or all Offices. Exact
currency-specific debit movements keep their legacy meaning; opening amounts
are not added. Account metadata redefinition is rejected rather than merged.
Current authorization rows are held with `FOR SHARE`, protecting active/revision
updates until publication completes. Existing writer assertion and head guards
remain mandatory. No current authorization/entitlement publisher is modified.

Each ledger carries `economic-read-visibility-v1`: financial detail is
`AUTHORIZED_FILTERED` or `NOT_AUTHORIZED`; stock detail and monetary country
summary are `NOT_AUTHORIZED`. Empty withheld arrays do not mean a zero balance.
D owns the corresponding UI handling. The pure direct package export is
`@econmind/core/economic-read-visibility-contract`; it targets the same source's
dist runtime/declaration without a copied DTO or a browser root-barrel import.

The actual PostgreSQL read adapter requires that complete bounded classified
wire shape for COUNTRY/OFFICE_PRIVATE, including canonical scope binding,
supported statuses, no unapproved raw extra fields, and empty denied arrays.
Financial detail can occur only in Finance/CB private scopes. An old raw cache,
or a raw extra field with a new marker, fails with `PROTOCOL_ERROR` before any
payload is returned. This is a server rejection, not a frontend filter or a
deployment-only rebuild suggestion. NEGOTIATION_PARTY semantics, parameterized
query, signed/current binding, minimum watermark and entitlement checks remain.

## Measured verification

Toolchain: Node 24.20.0 / pnpm 12.3.4, offline frozen lockfile. No native cluster
was created for this change. PostgreSQL concurrency/RLS/real grants and actual
browser acceptance are `NOT_RUN` here.

- Core/Worker/API builds: exit 0. Final Worker-only build after leg-order fix is
  recorded in the external receipt.
- Source/publisher 8, read adapter 16, Country/Office source-to-query 3, pure
  export 1, existing architecture boundaries 29: **57 PASS**, exit 0 at 22:50:39
  Asia/Shanghai, 29.82 seconds. These use real disposable PGlite SQL plus bounded
  wire fixtures; they do not prove native lock concurrency or production grants.
- The full source suite passed **8 PASS** at 23:00:33 after order normalization.
  A final inspection aligned the comparator exactly with Core's ASCII ordering
  and added a hyphen/underscore fixture: the two affected admitted-source cases
  then passed **2 PASS / 6 unselected** at 23:03:20, 7.27 seconds. Worker build,
  expanded strict typecheck and affected lint also returned exit 0. The 57-case
  matrix above predates these ordering fixes and is not a fresh final rerun.
  Source tests cover real persisted seed/admission, all six Offices,
  initial opening classification and legacy movement, wrong world/country/owner,
  rejected non-host source, hash/assembly mismatch, stale head/sequence, revoked
  projection scope, filtered amounts, and withheld stock/country detail.
- Seventeen affected old positive fixture assertions and four seat/seed/cutoff
  controls: **21 PASS**, exit 0 at 22:54:59, 5.91 seconds. 84 other cases were not
  selected in this bounded rerun. The native provider's 13 cases remain
  **NOT_RUN**; its updated fixture is typechecked, not called native PASS.
- Strict mixed test typecheck uses the repository browser Bundler/React/Vite
  environment while actual server builds use their unchanged NodeNext configs.
  Final type/lint/format/boundary/authority/secret/environment/diff results and
  exact immutable implementation identity are in the external receipt.

Preserved earlier failures:

- Initial source suite **3 PASS / 4 FAIL**, 22:43:41: fixture used superseded
  independent-pool fundsModel. Current A parser was not weakened.
- Next source suite **3 PASS / 4 FAIL**, 22:44:49: fixture omitted required
  fieldProvenance entries. Fixture was completed; source parser remained intact.
- Initial lint had four errors (unused callback arguments and regex escapes),
  then passed after ordinary repairs.
- Broader old-fixture read matrix **17 FAIL / 92 PASS / 13 NOT_RUN**, 22:51:18:
  old generic raw payloads are now correctly refused. Root authorized only
  fixture adaptation to classified activity. Unknown Trade/all-other-Office
  money remains withheld; raw balance/amount/canonicalValue was not merely
  relabeled. The route byte-boundary fixture uses bounded Finance-only wire
  positions, retaining both the reader and outer-envelope size assertions.
- Expanded NodeNext test typecheck failed on existing browser extension/CSS
  requirements and readonly PGlite test-array typing. The focused test config
  now uses the actual web compiler environment; a fixture query copies the
  readonly array, preserving all negative assertions. No browser source changed.
- During shared-host disk exhaustion a patch write and heredoc temp creation
  failed. File completeness was checked; neither was reported as successful.
  Only exact completed G candidates' untracked dist outputs were removed after
  checking tracked-file absence. Source/report/log/image evidence was preserved.

## Remaining boundaries

Official current admitted visibility is still unavailable until the real
admission/source producer supplies a lawful complete carrier. Finance/CB initial
mechanism tests use a disposable explicit source/admission fixture; they do not
approve actual owner decisions or monetary opening numbers. Other stock/private
holder mappings and supported public monetary summaries require real sources.
No missing source is replaced by zero, an empty grant provider or a legacy raw
fallback. D consumer acceptance and Root's later opening/joint wiring remain
separate. The frozen O movement assertions remain original evidence; Root owns
new composition assertions after this privacy change. B must review the fixed
P0 source/reader boundary before normal main integration. No release/Gate or
production readiness is claimed.
