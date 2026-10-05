# Local narrow reservation Worker bridge

Status: `IMPLEMENTED_UNVERIFIED` — P0 independent review required.

Base: `5e4b9d9ae50b04149a5a6e67478051dc1b1d8ec1`.
Branch: `codex/live-command-bridge`.

## Exact gap and shortest path

Existing durable staged HTTP already registers canonical intent, records the
Seller Trade / Buyer Trade / Buyer Finance signatures, binds the immutable
Finance reference and enqueues. Existing Worker execution already owns the
atomic commit and FINAL recovery; existing authenticated receipt and projection
readers are not missing. Existing SQL-backed automatic delivery preparation
does not prepare the preceding discretionary inventory reservation.

This slice adds one bounded **local/CI reservation execution bridge** and composes
the existing authenticated queries into the same optional staged HTTP server:

`verified HTTP → immutable Command → three durable signatures/reference → queue
→ SQL/current membership → Core opaque Office context → fenced claim → immutable
opening + Posting reconstruction → narrow reservation draft → existing atomic
Worker commit → FINAL → existing publisher → authenticated HTTP query`.

The existing runtime/main entrypoints remain health/source-only. There is no
background scheduler, automatic startup, production host or production connection
in this slice. The isolated acceptance harness explicitly invokes the bounded
Worker and the existing publishers; it does not claim a deployed execution loop.

## Ownership and authority

- No new economic model, ledger, schema, migration, source-data adoption or owner
  decision. GRAIN, GCU, maximum settlement 6, country/asset scope and expiry come
  from the existing narrow Core parser.
- `createLocalNarrowReservationWorker` accepts only durable World/Command identity
  at execution. No caller-supplied candidate, ledger, authorization verdict or
  `AuthorizedOfficeContext` is accepted. SQL reconstructs current membership and
  Core produces the opaque context. The durable Command supplies the original
  authenticated subject; its audit envelope is not a new JWT/login credential.
- The SQL approval store remains the fixed approval boundary. Its existing
  proposal identity/policy mapping is reused rather than manufacturing branded
  proposal/signature objects or interpreting policy version as proposal version.
  The same three signatures are checked again in the authoritative transaction.
- Submission lock precedes lease/head preparation. Existing lease acquisition,
  claim-fencing triggers and atomic commit guard remain authoritative. A claimed
  command with another holder/fence is not silently reassigned; reviewed recovery
  remains necessary.
- Only AVAILABLE → RESERVED occurs. No shipping, delivery or Financial Posting
  is created. Event, Inventory Posting, receipt, WorldVersion and outbox commit
  together through the existing repository. Financial balances remain unchanged.
- Projection publication remains a separate derived operation; a committed
  receipt does not imply projection publication or outbox delivery has succeeded.
  Outbox dispatch is not run here.
- Source6 monetary/inventory ownership, official opening seed, formal publisher,
  deployment credentials/roles, teams/personnel and production start are not
  resolved or fabricated here. Gate B and legacy step status are unchanged.

## Actual local evidence

Pinned Node 24.20.0 / pnpm 12.3.4; frozen offline lockfile install.

| Check                                      | Result                                       |
| ------------------------------------------ | -------------------------------------------- |
| Core / Worker / API pretest builds         | PASS                                         |
| Scoped staged HTTP TypeScript check        | PASS                                         |
| Scoped ESLint                              | PASS                                         |
| Repository import boundaries               | PASS                                         |
| Authoritative patterns                     | PASS                                         |
| Migration manifest, unchanged 22 artifacts | PASS                                         |
| Repository secret scan                     | PASS                                         |
| Staged actual HTTP + PGlite, 20 cases      | PASS                                         |
| Native PostgreSQL                          | NOT_RUN locally; dedicated GitHub CI pending |
| Independent P0 review                      | PENDING                                      |
| Merge / production / formal World startup  | NOT_RUN                                      |

The positive case bootstraps a fresh disposable **test-only** dataset via the
existing opening store. Its identifier and numbers are not official World or
Source6 adoption. As in existing native-opening tests, storage provenance uses
the dataset contract with an explicitly `TEST_ONLY_NOT_OFFICIAL` locator/version.
The original V10 `TEST_FIXTURE` opening source is never relabelled or persisted.

Actual causal result: real signed loopback HTTP registers/enqueues a transfer of
2 tonne at 3 GCU/tonne; before reservation AVAILABLE=4; after canonical lineage
reconstruction AVAILABLE=2 and RESERVED=2; WorldVersion 0→1; one Event, one
Inventory Posting, one FINAL and one outbox fact. Payment is **NOT_EXECUTED**.
The authenticated projection returns watermark 1/1 and posting-derived movement
AVAILABLE=-2 / RESERVED=+2. These projection values are **net Posting movement,
not opening-inclusive stock balances**; full balances are read separately from
opening + lineage. Existing publisher semantics are not redefined.

Query tests use the disposable database's trusted server/superuser adapter and
verified-JWT subject binding. They are not proof of a deployed least-privilege
role. The existing migration intentionally denies browser `authenticated`
schema usage; no test or production grant is added to change that boundary.

## Focused failure matrix

Existing HTTP cases remain intact: forged identity/clock, invalid JWT, wrong
country/Office, changed fingerprint, missing Finance signature, reference binding,
current authorization revocation, UNKNOWN acknowledgement/recovery and browser
protocol behavior.

Added cases: positive numerical HTTP→FINAL→authenticated projection/receipt;
missing opening (no persisted lease/claim); Finance revoked after enqueue;
insufficient stock; another active writer; failure before FINAL receipt (Event
and Posting rollback, safe retry); acknowledgement loss after atomic commit
(durable FINAL recovery and no duplicate Posting); production environment denied;
concurrent bounded writers; not-yet-due SimTime; revoked Seller membership;
lease takeover with the old claimed fence rejected.

The earlier five-file local regression run passed 45 tests, before the four
additional HTTP failure cases were added; the final staged run passes all 20.

## Exact API handoff to the frontend owner

All routes below are **POST**, loopback local/CI only, with a cryptographically
verified `Authorization: Bearer ...` header. No default dev/start runtime installs
these handlers. Browser origin must be an explicitly configured exact loopback
origin; absence means no browser access. Supabase configuration is rejected.
Verifier/issuer/audience, actor directory, SQL connections and clocks are held
by the trusted server, never inferred from role URLs or request JSON.

| Route                               | Exact request type / schema                               | Exact response type                                                       |
| ----------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| `/local/v1/staged-narrow-transfer`  | `StagedTransferRequest` / `world-staged-transfer-v1`      | `{schemaVersion,ok,state}` or explicit error                              |
| `/local/v1/narrow-transfer-receipt` | `FinalReceiptReadRequest` / `world-final-receipt-read-v1` | `WorldFinalReceiptReadResponseEnvelope`, `{ok:true,receipt}` or error     |
| `/local/v1/world-read`              | `WorldReadRequestEnvelope` / `world-read-api-v1`          | `WorldReadResponseEnvelope`, `{ok:true,data:WorldProjectionDto}` or error |

Staged common fields: `schemaVersion`, `action`, `worldId`, `commandId`,
`idempotencyKey`, `countryId`, `officeId` (TRADE/FINANCE). REGISTER requires
`intent:{expectedWorldVersion,buyerCountryId,quantity,price,assetSource,expiresAtReal}`.
SIGN_SELLER, SIGN_BUYER_TRADE, SIGN_BUYER_FINANCE and BIND_REFERENCE additionally
require `commandFingerprint`; ENQUEUE requires `commandFingerprint` and `approvalRef`.
INSPECT/READ have no additional fields. Unknown identity/clock/authorization
fields fail. INSPECT returns immutable intent/fingerprint; signing returns
`SIGNATURE_RECORDED`, not FINAL. READ preserves PENDING_APPROVAL_OR_ENQUEUE,
QUEUED, EXECUTING, FINAL, NOT_FOUND and UNKNOWN literally. A FINAL state contains
the actual `FinalCommandReceipt` and acceptance, with SimTime encoded as ticks.

Receipt operation: `READ_FINAL_NARROW_TRANSFER_RECEIPT`, payload
`{worldId,commandId,idempotencyKey}`. Projection operation:
`READ_WORLD_PROJECTION`, payload `{worldId,classification,scopeKey}`.
Both envelopes require a canonical UUID `requestId`. `WorldProjectionDto` contains
world/classification/scope, `watermark:{worldVersion,eventSequence,generatedAt}`,
payload, receipts and events. The activity projection in this test contains
Posting movement, not opening-inclusive balances; its events/receipts arrays
remain empty, so FINAL is read through the dedicated receipt route.

Country/Office are selectors checked against SQL current membership. Finance
reference binds an already durable signature. Worker separately reconstructs
the Core opaque context from immutable intake subject + SQL current authority.

Optional `queries:{executor,policy}` on `createLocalStagedNarrowTransferBridge`
composes the existing query handlers. Omission keeps those routes unavailable.
The old synchronous `/local/v1/narrow-transfer-command` route remains unavailable
in this composition: use the staged lifecycle, never fabricate immediate FINAL.
The bounded Worker is invoked server-side as `execute({worldId,commandId})`;
there is no browser execute-Worker route or automatically configured loop.

Exact server contract sources are `staged-narrow-transfer-handler.ts`,
`authenticated-final-receipt-query-handler.ts`, and `contracts.ts` in
`apps/world-api/src/integration`. Frontend must not import private Worker/server
implementation; reuse an approved shared browser DTO boundary. This handoff
does not authorize publishing or starting a formal World.

Native PostgreSQL, fixed candidate SHA, CI run identity and actual causal console
record must be added to the handoff after the dedicated run completes. Normal
focused engineering verification only; no full V09/V10 rereview, open-ended
attack campaign or production operation.
