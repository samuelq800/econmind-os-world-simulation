# Six-role authorized projection wiring candidate

2026-10-07 (Asia/Shanghai). Status: IMPLEMENTED_UNVERIFIED.
Preparation/integration only; independent review required. Not six-role gameplay
completion, Gate B, V09 activation, production publication or merge approval.

Base: `d0926f288dcb84559cfdef94c7d283ea7ac180e7`.
Branch: `codex/d-six-role-projection-wireup`.
Checkout: `/Users/samuel/Documents/econclub/.econmind-worktrees/d-six-role-projection-wireup`.

## Ownership and actual delivery

New `apps/world-web/src/office-projection/{model,controller,view}.ts`, dedicated
`tests/world-web/office-projection*` and this report. Two additive lines in
`country-runtime/entry.ts` import and mount the view. No immutable public file,
map geometry, opening JSON, existing production-read/authorized/staged client,
backend, Core, migration, governance status or original local DEMO is changed.

The approved country HOME receives one additional icon entry. The drawer reuses
existing national drawer/atlas surface and font classes. Country art, regional
backdrop, HUD, facilities and existing tools/forms remain the source UI. Original
opening figures are not overwritten by Posting values. There is no new API.

## Existing contract consumption

The controller uses the unchanged `createProductionReadClient` and
`ProductionReadConfig`. A trusted host must explicitly call
`window.EconMindOfficeProjection.connect(binding)` with its existing approved
read configuration, selected display view and, optionally, the ORIGINAL
`FinalLookupIdentity`. No config is obtained from URLs, VITE, localStorage,
opening data or TEST_ONLY fixtures. Display country keys are never converted
into server world/country IDs. Host config strings are not authorization;
the existing client still verifies the server read binding and lifetime.
Connection is reported from that existing port as NOT_CONNECTED or
READ_ONLY_BOUND, separately from field availability; no host config means
NOT_CONNECTED with MISSING fields and disabled controls.

The browser parser mirrors existing `world-activity-projection-v1` payload:

- `activity.authoritativeEventCount` and its last event sequence/World version;
- `ledger.financialPositions`: account/class, exact `netDebitBalance`, currency;
- `ledger.inventoryPositions`: commodity, bucket, exact quantity, source unit.

These are ACTIVITY_COUNT and NET_POSTING_MOVEMENT, not opening-inclusive
balances, spendable cash, stock, budgets, capacity, rates or causal estimates.
No summation, Number conversion, rounding, forecasting or local settlement.
Duplicate/malformed positions, mismatched country/office, unknown schema,
inconsistent source head or future activity head yield typed missing output.

Source detail displays the verified world/country/office/classification,
World/event head, snapshot/readback reference, seed/admission/hash/seat pins,
authorization revision and model/projection version. Successful data is frozen.
Every new read clears old visible fields while pending. Country/role/session
loss retires the client and clears fields/receipt; late completion cannot restore
them. No automatic reconnect or automatic new intent exists.

With a supplied original lookup reference: read original FINAL through the
existing client, then refresh at least its authority readback head. Receipt
success is distinct from refresh success: failed/stale refresh keeps the verified
FINAL but displays no current fields. No FINAL is inferred from QUEUED/HTTP ACK,
and nothing is submitted. Random UUIDs are request-correlation IDs only, never
fabricated actor/identity IDs, seat/admission references or simulation time.

## Precise six-role gaps

All six roles consume the common activity and Posting DTO. None has a complete
role-specific operational projection or production submit caller in this base.

| Role         | Missing operational fields (`ROLE_FIELD_NOT_PROJECTED`)       | Production action boundary                                           |
| ------------ | ------------------------------------------------------------- | -------------------------------------------------------------------- |
| Captain      | National priorities; cabinet approvals; political capital     | No authorized production command family/client                       |
| Finance      | Available treasury balance; budget commitments; debt maturity | Existing local narrow transfer is not a production submit port       |
| Central Bank | Policy rate; eligible collateral; bank liquidity              | No authorized production command family/client                       |
| Industry     | Operating capacity; power dispatch; construction progress     | No authorized production command family/client                       |
| Trade        | Shipment arrival; supplier quote; trade contract terms        | Existing staged reservation workflow remains separately local-scoped |
| Social       | Employment matching; training places; healthcare capacity     | No authorized production command family/client                       |

New UI submit is always disabled, `PRODUCTION_COMMAND_PORT_MISSING`.
This does NOT mean existing Trade staged workflow is removed or authority has
been granted to other roles. The existing FINAL lookup operation is specifically
`READ_FINAL_NARROW_TRANSFER_RECEIPT`, not a generic six-role receipt family.

Root/G report an upcoming public `world-authenticated-financial-intake-v1`
contract with Trade/Finance only. It is NOT consumed here before fixed contract
and approved client exports are provided. A future consumer must retain
`OFFICE_COMMAND_FAMILY_UNSUPPORTED` for the other four roles and NOT_CONNECTED
when actual host/ActorDirectory/Clock/publisher bindings are missing. A static
supported-actions list is not permission. This candidate does not copy that
unfrozen schema, invent an execute port/endpoint, or enable policy actions.

## Verification and provenance

Pinned Node 24.20.0, TypeScript 6.0.3; reused offline third-party dependencies.
Workspace package links resolve to this checkout. No network install or copied
node_modules, production credentials, database or real authority fixtures.

Environment correction: the initial offline dependency links inadvertently also
linked `.vite` and `.vite-temp` to another checkout's mutable cache directories.
Vite may have written those caches. Both temporary servers were stopped; only
this checkout's two symlinks were moved into the evidence directory, and owned
cache directories replaced them. No borrowed cache contents were deleted or
restored. Focused tests and the web build were rerun using owned caches. This is
a build-cache isolation incident, not a source/backend/data change.

PASS, actual commands:

```sh
node node_modules/vitest/vitest.mjs run tests/world-web/office-projection.test.ts tests/world-web/production-read-client.test.ts tests/world-web/trusted-country-runtime.test.ts
node node_modules/vitest/vitest.mjs run tests/architecture/boundaries.test.ts
node node_modules/typescript/bin/tsc -p apps/world-web/tsconfig.json --pretty false
node node_modules/eslint/bin/eslint.js apps/world-web/src/office-projection apps/world-web/src/country-runtime/entry.ts tests/world-web/office-projection*.ts
node scripts/check-boundaries.mjs
node scripts/check-authoritative-patterns.mjs
ECONMIND_ENV=local node scripts/assert-safe-environment.mjs
node scripts/check-repository-secrets.mjs
node scripts/verify-authoritative-ui-publication.mjs
git diff --check
```

Focused/regression: 3 files / 118 tests PASS. Architecture: 29 tests PASS.
Canonical boundary: 256 files PASS.
Core/worker prerequisite builds exited 0 to generate local declaration exports;
this is not backend runtime or acceptance. Existing publication check: 288
published files, 75 derived files, 70 country pages, 140 map assets PASS with
economicStateConnected=false.

Latest web typecheck, Vite production build and existing map publication pipeline
passed. Read endpoint build config explicitly unset (NOT_CONFIGURED). Published
map package: 203 files, 160 images, 70 countries. Total built site 937,608,016
bytes, within existing 1GB guard (remaining 62,391,984 bytes). Existing Vite large
chunk warning and runtime-resolved shared CSS warning remain; no performance
improvement or production deployment is claimed.

Browser evidence is at
`/Users/samuel/Documents/econclub/.econmind-artifacts/d-six-role-projection-20261007/`:

- `browser-checks.json`: all six roles exact decimal/unit display, three precise
  missing fields, disabled submit, original FINAL -> v3 read refresh PASS in the
  explicitly marked OFFLINE TEST_ONLY fixture document. The fixture uses the
  real production client with a client-local transport stub; no global fetch
  override, real endpoint, seat, admission, token or command exists.
- `01-test-only-final-sourcehead.png`; `02-test-only-session-retired.png`.
- `04-built-home-unbound-full-map.png`: actual built HOME uses original regional
  backdrop and honest missing binding; all six built role views inspected.
- `03-actual-home-unbound.png`: dev-source mount, where unbuilt map publication
  namespace is unavailable. Built output check above resolves that dev-only gap;
  no original map or routing code was modified.

An initial development-server dependency resolution cache and directory-fallback
role navigation failed; after local dependency links/restart, final built-page
role navigation passed across six roles. No timeout is promoted to a pass.

NOT_RUN: live endpoint/seat/actor/admission, production submit/queued/FINAL chain,
all 120 forms, all 18 decision workflows, full 420 view audit, database/runtime
integration, full workspace tests/build and independent acceptance. The six-role
gameplay mainline remains incomplete pending real role DTOs and approved command
clients. Source/authorization/FINAL consumption requires independent review;
this implementation does not self-approve a lower risk class.

Original preview http://127.0.0.1:4178/local-demo/ remains live and untouched;
GET returned 200. Its fixed b0db98 delivery is not replaced by this candidate.
The TEST_ONLY development server on 4181 is stopped after verification. At the
user's request to finish the preview, the candidate's loopback-only built preview
on 4182 remains available at `/season1-immersive/index.html?country=01&role=captain`.
The original DEMO service also stays running. Neither preview is a deployment,
live binding or Gate B result. No merge, release or host purchase.
