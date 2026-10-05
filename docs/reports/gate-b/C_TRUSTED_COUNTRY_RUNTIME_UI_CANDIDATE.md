# C trusted static-country runtime candidate

Status: `IMPLEMENTED_UNVERIFIED`. Independent narrow review required.

Implementation base: `a6951f298096ed055d76165f01fa283d246afaa7`.
Branch: `codex/c-trusted-runtime-ui-bridge`.
API contract source: A PR 76, fixed `07c4ad43547e40fd4f4b3369569501a4ec9c428e`,
`LOCAL_NARROW_RESERVATION_BRIDGE.md` and its actual staged HTTP DTOs. The API
candidate is not copied into this frontend branch. Its implementation and native
PostgreSQL result are A evidence, not a C browser runtime result.

## Actual gap and bounded implementation

The selected six-role static page had no mount for D's trusted controller;
`country-confirm` stored local allocations only. This candidate adds a stable
built module, loaded by the existing derived `country-game.js`. The pinned
`index.html`, shared CSS, source loader, source/provenance datasets, map assets,
all six public role views and source mode remain unchanged.

No trusted host is discovered from URL, browser storage, VITE variables, source
API, fixtures or prototype defaults. `window.EconMindCountryRuntime.connect`
requires explicit host injection. Without it, `NOT_CONNECTED` and disabled
Confirm are native defaults even if the module fails to load. Local slider
planning remains; it cannot author, sign or submit an economic Command. Existing
local decision records are preserved but new allocation confirmation is disabled.

Only the separately prepared seller TRADE **inventory reservation** family may
connect. Other roles stay disconnected, and the old `NARROW_TRANSFER` family is
rejected. This is not six fully implemented Office operation families.

Exact sequence:

1. Read authenticated scoped projection through the reviewed browser client and
   D projection/liveness controller.
2. POST `INSPECT` through `/local/v1/staged-narrow-transfer`; compare original
   command/idempotency/fingerprint/version and the complete immutable payload,
   retaining exact numeric strings.
3. Review the inspected host-prepared intent and existing approval reference.
4. Confirm **ENQUEUE once**. No REGISTER, signature, approval, Worker execution,
   payment, shipping or delivery is manufactured by this UI.
5. Preserve PENDING_APPROVAL_OR_ENQUEUE, QUEUED, EXECUTING, NOT_FOUND and UNKNOWN;
   no blind resend. Explicitly READ the original lifecycle and POST the dedicated
   `/local/v1/narrow-transfer-receipt` lookup. A staged FINAL acknowledgement is
   not itself a verified receipt.
6. Accept only the original durable receipt identity/fingerprint through the
   existing receipt validator, then explicitly refresh `/local/v1/world-read`.
   Behind-FINAL projections remain unavailable.

The old `/local/v1/narrow-transfer-command` submit is never called. Existing
local loopback-only transport restrictions are not broadened. Private responses
are retired on host invalidation, token-time expiry, DOM country/role changes,
root replacement, disconnect and pagehide. Returning to the old view does not
reconnect. Shared local pending markers survive reload; only a matching scope
and verified FINAL can clear them. A marker is browser safety, never authority.

## Typed trusted host contract

See `apps/world-web/src/country-runtime/trusted-runtime.ts` and
`staged-reservation-client.ts` for executable types:

- Full `AuthorizedBrowserIdentity`, exact loopback origin and token callback.
- Session reference, current-session callback and explicit invalidation subscription.
- Seed World/reference/content hash. These are host prerequisites, **not** evidence
  of server seed admission, human approval or source adoption.
- `STAGED_INVENTORY_RESERVATION` capability matching the full identity/revision.
- Explicit display binding (DOM country key `01`, public role `trade`) independent
  of server country identity such as `COUNTRY_01`. It is a consistency check,
  never authorization inferred from URL.
- `preparedReservation`: original command/idempotency/fingerprint/approval reference,
  expected WorldVersion and the complete immutable INSPECT payload. The host must
  separately have completed registration, three signatures and Finance-reference
  binding. The server must reconstruct and validate current authority and terms.

`econmind-country-runtime-ready` announces the API mount, not authenticated
readiness or an activated World. The host must connect only after its selected
country DOM exists. Root replacement retires the injected session conservatively.

The activity DTO adapter uses the real `world-activity-projection-v1` schema,
scope/country/Office binding and exact strings. It displays **net Inventory
Posting movement**, not opening-inclusive stock. AVAILABLE=-2 / RESERVED=+2 is
not a claim of balances -2 / 2. The original source HUD and local preview values
are not replaced or relabelled as live. No browser arithmetic is authoritative.

## Actual local checks

Pinned Node 24.20.0 and pnpm 12.3.4; frozen offline lockfile installation passed.

| Check                                                                       | Actual result                                                                                                                                                          |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Five focused files, including new staged adapter and existing D regressions | PASS, 90 tests; all transport responses fake/test-only                                                                                                                 |
| World web typecheck                                                         | PASS                                                                                                                                                                   |
| Focused test CLI typecheck with DOM and vite/client declarations            | PASS                                                                                                                                                                   |
| Scoped ESLint and Prettier                                                  | PASS                                                                                                                                                                   |
| Core/Worker builds needed for boundary resolution                           | PASS; compilation only                                                                                                                                                 |
| Repository browser ownership/import boundary                                | PASS                                                                                                                                                                   |
| Selected immutable UI publication/source check                              | PASS, 288 original + 75 derived + 2 reviewed visual files; 70 countries                                                                                                |
| Environment/secret checks                                                   | PASS; database not configured, production mutation disallowed                                                                                                          |
| Static world-web build                                                      | PASS; source NOT_CONFIGURED, liveWorldState=false                                                                                                                      |
| Local built UI, actual browser                                              | Default country01/trade dialog inspected: NOT_CONNECTED and six runtime actions disabled; role switch to finance retains disabled allocation Confirm and no seat grant |
| Connected browser + actual trusted nativePG server session                  | NOT_RUN                                                                                                                                                                |
| 420 online source/page matrix                                               | NOT_RUN by C; D/F/G retain fixed published baseline                                                                                                                    |
| Production host, JWT, seed adoption, Worker loop, Gate B                    | NOT_RUN / not established                                                                                                                                              |
| Independent candidate review                                                | PENDING                                                                                                                                                                |
| Merge / Pages publication / production activation                           | NOT_RUN                                                                                                                                                                |

Browser screenshot is stored separately at
`/Users/samuel/Documents/econclub/artifacts/c-trusted-runtime-ui-20261005/DEFAULT_NOT_CONNECTED.jpg`.
This is one local default-mode visual observation, not connected/mobile/420 acceptance.

The first exploratory test run failed due to a fake response/transport mismatch
and an overbroad source-text regex; the final tests use the actual response DTO
and explicit fake fetch injection. A boundary check rejected dynamic import of
a computed URL; final wiring mounts a fixed same-origin generated module script
and the build validates its actual TS entry. A focused CLI typecheck initially
lacked Vite CSS declarations; the final command includes `vite/client`. No
existing guard or mandatory check was weakened to suppress these diagnostics.

## CI and handoff limits

The new `trusted-country-runtime.yml` is no-deploy, contents-read only, pinned
toolchain, normal offline fake-transport tests, typecheck/lint/format, boundary,
environment/secret/source and disconnected build checks. No secrets, production
connection, SQL, OIDC, deployment or automatic merge step is added. Actual run
identity/conclusion must be bound to the fixed PR head separately after completion;
CI success is not connected-server or production runtime evidence.

Root owns review, merge and version transition. This candidate must remain PR-only
while the original published 420 matrix is frozen. It changes no economic
initial values, source semantics, Core/API/Worker implementation, schema/migration,
root status or production permissions. Production HTTPS transport, real host
session, legal seed admission, registrations/signatures, server execution loop
and full economic gameplay remain separate prerequisites.
