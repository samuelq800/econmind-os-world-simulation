# G production runtime binding consistency contract

Date: 2026-10-07 Asia/Shanghai. Status: **IMPLEMENTED_UNVERIFIED**. Risk: **P0**.

## Authority and ownership

Root's `artifacts/O_AUTHORITY_CHAIN_IMPLEMENTATION_SCOPE_2026_10_07.md` and
explicit G delegation authorize isolated source preparation only. Fixed base:
`21a6a6fa4a64f95cb9f5141bce5af43dff86d7c7`, tree
`c6618ebe9a239521b1858e5d5b272d4c6e5e20a2`, branch
`codex/g-production-runtime-binding-contract`. The scope document's older
`e3a3b985...` main reference has the same whole tree; the explicit fixed base
above controls this checkout. Existing PR87 implementation is untouched.

Owned paths are the new API integration module, its focused test and TypeScript
config, and this plan. No existing consumer, barrel, startup, environment policy,
governance, A opening contract, E reconciliation, C Worker or package is changed.
The interface names were sent to Root before dependent consumer work. API owns
consistency diagnostics; Worker remains the sole execution owner, Core owns
canonical admission/lease/atomic transition, and browser presentation remains
non-authoritative.

## Dependency and decision gate

`AGENTS.md`, `PLANS.md`, repository boundaries and centralized FAST_MAINLINE
policy were read. `status/progress.json` still has V09.1 PLANNED/PENDING and
`next_step_ready=false`; this work neither starts V09 nor verifies it. V25.2 is
NORMAL/PLANNED; V10.4, V14.3 through V24.3 and V25.1 remain unmet PLANNED
dependencies. This is Root's specifically authorized isolated preparation,
not a substitution for those hard dependencies or a topology/economics approval.
Production/Auth/single-writer boundaries make this P0: immutable integrated
candidate independent review is required before adoption/merge/VERIFIED.

## Contract and checks

`checkProductionRuntimeBinding(manifest, evidenceRecords)` is a pure offline
inspector with no ambient configuration, credential lookup, HTTP, SQL, process
launch, Clock or mutation. It normalizes inert data using existing Core canonical
serialization, then returns immutable field-specific diagnostics. It reuses
`HttpsReadCompositionConfig` endpoint/admitted-World pins,
`ServerVerifiedReadBinding` model/readback types, `JwtClaimsPolicy` issuer/audience,
`ApiRuntimeConfig` environment, and Core `WorldWriterLease` identity. No parallel
identity policy, lease issuer or read provider is installed.

The versioned manifest explicitly distinguishes GitHub Pages frontend publication,
real HTTPS API origin/routes, the existing separately built Worker executable
and separately identified target, DB project/environment/namespace/fingerprint,
Auth issuer/audience/verifier build/project, current session/provider/seat-readback
references, same admitted World/seed/source/model/orchestrator build/release,
head readback and lease/fence/lifecycle evidence identities. Component build hashes
can differ; every component must match its own reference record and the one release
commit. Every reference record must carry the same global binding identity.
There is no inferred host, issuer, audience, project, orchestrator version or
deployment default. The existing executable path and Core model constant identify
code, not a deployed target or approved release.

Missing inventory entries return `MISSING_EVIDENCE` at the exact frontend, approved
host, API/Worker deployment, DB, Auth, provider/session/current-seat, World readback,
lease and lifecycle slots. Loopback production origins, Pages API/Worker substitutions,
mixed world/seed/source/model/build/release/environment, expired observed leases,
missing issuer/audience, unknown role/seat/capability fields and simulation activation
are blocked. Host approval strings, `approved:true`, caller runtime booleans, local
self attestations and self-signed local receipts grant nothing. Schema tags and
reference hashes cannot authenticate their own provenance.

The largest success state is **BINDING_CONSISTENCY_CHECKED**, with
`evidenceVerification=NOT_PERFORMED`, `runtimeReady=false`,
`simulationEnabled=false`, `authorizationGranted=false` and
`workerActivationAllowed=false`. Even consistent external-looking reference
metadata is only supplied metadata. It must never be used as RUNTIME_BOUND,
WORKER_ACTIVE, runtime-ready, a capability/seat grant, authenticated claims,
deployment receipt or Core lease. `RUNNING` inside the supplied lifecycle pins is
an unverified observation label, not a returned Worker status. A later actual
evidence reader and independent approval must verify artifact bytes, provider
deployment/current state, actual JWT/session/seat, same World/seed/head, release
provenance and current fencing/liveness. This module implements none of them.

## Verification and delivery

Offline TEST_ONLY fixtures exercise consistency, detached deep immutability,
stable integrity hashes, each missing evidence slot, normal contradictory topology,
World/version/build/release mismatches, expiry/fence boundaries, unsupported receipts,
caller boolean/URL seat attempts and inert-data rejection. Fixture records use the
reference schema to test its mechanism; they are not actual external evidence.
Relevant existing HTTPS read/identity tests remain unchanged and are required.

Pinned Node 24.20.0 / pnpm 12.3.4, frozen lockfile, offline installation only.
Run focused Vitest, scoped tsc, API typecheck/build, changed-file lint/format,
repository import/authority/env/secrets/governance checks and diff whitespace.
Required Core/Worker builds generate ignored exports only and never launch a
Worker. Exact commands, native logs, result counts and immutable tip/base/tree/
patch/file hashes are frozen outside the checkout at handoff. No full suite,
new attack campaign, real DB/PG, network, source regeneration, external credentials,
old-site/Supabase, provider purchase, HTTP service, push/main or deployment is run.

No actual approved host, provider, session, admitted-World readback or runtime
deployment evidence was supplied to G. Their honest result is BLOCKED/MISSING;
official source hashes alone cannot fill them. The frozen missing-input diagnostic
is produced by this module with null supplied manifest/inventory, without selecting
or regenerating an official dataset. Actual economic decisions remain owned by A/E,
durable consumption by C, and future approval/activation by their existing gates.
Deliver the fixed candidate and limitations to Root, then STOP. No monitor or
runtime installation follows this preparation.
