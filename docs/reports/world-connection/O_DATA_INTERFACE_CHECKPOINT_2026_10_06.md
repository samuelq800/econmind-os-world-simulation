# Data-interface connection checkpoint

Date: 2026-10-06, Asia/Shanghai. Root repository base:
5abc537ce388728d24ac6645def581991f029951. This is evidence metadata and a bounded
public-read refresh, not an economic activation or Gate B approval.

## Current public-source connection

Reader root:
https://vimksjrhaxdpnkvgsavz.supabase.co/functions/v1/world-v2-official-read/.
Browser Origin: https://world.econmind.group (no trailing slash).
Selected source: BALANCED_2026_09_28_V1, 70 countries, population 14712146434,
selection checksum 88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315.

Root performed exactly eight public GETs at 05:36:19.515–05:36:25.186 UTC
(13:36 Shanghai). Result: 8/8 PASS, eight HTTP200 responses, zero retries,
imports, database writes or credential use. Each received body was retained
with its byte count and SHA256. All responses matched the selected package,
selection checksum, application/json, exact Origin/ACAO and absent ACAC;
`liveWorldState=false` remained literal.

| Relative route                                                                     | Actual bounded check                                                               |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `v1/world-data/countries`                                                          | Ordered 01–70 IDs and exact total population                                       |
| `v1/world-data/countries/visual-territory-01`                                      | Exact country identity                                                             |
| `v1/world-data/countries/visual-territory-70`                                      | Exact country identity                                                             |
| `v1/world-data/datasets`                                                           | All 34 unique source declarations, hashes and byte counts match the fixed registry |
| `v1/world-data/datasets/finance?countryId=visual-territory-01&offset=0&limit=1`    | Exact country filter, source identity and decimal-string/unit contract             |
| `v1/world-data/datasets/deposits?countryId=visual-territory-01&offset=0&limit=1`   | Same checks for mineral-source data                                                |
| `v1/world-data/datasets/facilities?countryId=visual-territory-01&offset=0&limit=1` | Same checks for infrastructure-source data                                         |
| `v1/world-data/datasets/geography?section=climates&offset=0&limit=1`               | Native climate-section page and source identity                                    |

Host-local raw receipt:
/Users/samuel/Documents/econclub/artifacts/o-interface-current-smoke-20261006.WpgPrw/receipt.json,
SHA256 172e669e3e2bf5bb84758abe3c0f105109bcbbf2b9336d425fe5bee8bfaa54a8.
Fixed check script SHA256:
6491ca21ade30fc7af5b1de12cc81660562aa2c371c62e1a918f50bedf1249a0.
Registry bytes SHA256:
cdc33568cfc86dc3949ad7f824752837d613148dd065cc54287d9d1d1bf68bf2.
Publishing this report does not implicitly upload host-local raw evidence.

This fresh check is not another 511-response traversal, all-country dataset
readback, native visual inspection, OPTIONS check or HTTP method-denial proof.
It checks declared original hashes, not fresh remote original-file bytes.
The finance source preserves `householdBankDeposits=17548540099.199997` exactly;
no rounding or claim of an approved bank-opening accounting closure is made.

## Retained wider evidence and permissions

The [October 5 interface report](O_OFFICIAL_INTERFACE_CONNECTION_2026_10_05.md)
binds the actual reader-v2 release, 511 successful new reads/303 groups,
22 new complete dataset trees, 70 details and 210 country associations. Together
with 12 earlier complete trees, all 34 have mixed-version complete-tree evidence:
`MIXED_VERSION_ALL_GROUPS_EVIDENCED`, `sameVersionFullPass=false`. The original
HTTP546 failure and its UNKNOWN cause remain unchanged.

The [online HOME report](O_ONLINE420_PAGE_RUNTIME_2026_10_06.md) binds 420
country/Office pairs and 840 desktop/mobile HOME cells. No repeat full traversal
was run here. Role selection is public display navigation, not an Office seat.
Source permissions do not authorize player writes or convert climate/mineral/
facility proposals into operating assets. The fixed shared source directory
remains reachable for all six Offices.

The machine-readable wiring matrix previously still said API deployment and
browser source connection were unverified. Only those stale metadata labels are
corrected to the scopes above. `runtimeState=NOT_LIVE_WORLD`, mixed-version and
all-HUD/economic verification limits remain explicit. No source-field mapping,
browser operation, API route, RLS, role, schema or authoritative state changed.

## Candidate checks and acceptance scope

Risk: P2 evidence metadata/test tooling; no P0 boundary change. The project
owner's standing authorization allows appropriate main merges. Root accepts
this metadata-only correction by OWNER_FAST_TRACK; no independent P0 review,
full-suite pass or runtime execution authorization is claimed.

Pinned Node 24.20.0/pnpm 12.3.4: the changed wiring test file passed 5/5 tests;
focused strict TypeScript, ESLint, Prettier and diff checks passed. The initial
standalone strict typecheck exposed existing relative node_modules React
imports without declaration resolution (TS7016). Imports were corrected to
the adjacent test's existing typed createRequire pattern, without changing
dependencies or assertions; strict typecheck and all five tests then passed.
Browser ownership boundaries, local environment admission and repository
secret scan passed. No full pnpm check, database test or repeated online420
was run. Automatic provider CI/publication outcomes require separate receipts.

## Remaining authenticated operation chain

The [local permission checkpoint](O_LOCAL_PERMISSION_RUNTIME_2026_10_06.md)
records the actual six-role installation, synthetic opening seed, three normal
Office approvals and initial projections in the retained TEST_ONLY local World.
It is not production Supabase. Both interrupted attempts are preserved; no
browser enqueue, Worker transition or native FINAL was performed. The original
command expired and cannot be extended or reused.

A's frozen successor protocol is PREPARE_ONLY. Root assigned C the isolated new
same-World normal-approval/native-enqueue harness and E the exact 22-policy
overlay install/revoke operator. These are implementation preparations, not
an actual overlay installation or a registered successor. The implementation
must preserve the original World/seed/auth/expired history; use the normal
new REGISTER, three live approvals, BIND, native ENQUEUE, lease-fenced once-only
Worker, final publication and receipt readback. No reseed, copied signature,
clock override, initial republish or CLI replacement for native enqueue.

Before execution: freeze C/E candidate hashes, obtain one independent narrow B
review, bind a new full prepared-state proof and exact overlay receipt, then
issue a distinct Root stage authorization. Missing bindings or real expiry
means STOP, with no automatic retry. Until actual evidence returns the native
successor and Command-to-FINAL result are NOT_RUN.

Formal 70-country World remains NOT_STARTED/HOLD; Gate B remains PENDING.
Production host/JWT/seat admission and approved source-to-opening ownership,
GCU, Treasury/CB and exact bank accounting semantics remain separate conditions.
No old-site public/auth/storage change or production mutation occurred here.
