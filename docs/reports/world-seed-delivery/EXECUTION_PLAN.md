# Execution plan: World Seed delivery preparation

## Authority and scope

- User request: complete the Seed work and deliver the final version.
- Base: `f4384167cc26aec693f9e40c7ed5caf30da06f43`, branch `codex/world-seed-delivery`.
- Reuse existing OpeningSeed, source adoption, bootstrap store, admission and replay implementations.
- Binding requirements: Constitution R025/R026/R027; repository single-state, provenance, authorization and production isolation rules.
- This package is a read-only diagnostic/release-preparation tool plus verification of existing code. It does not implement or claim completion of V27 or bypass V09.

## Dependency and decision gate

- `status/progress.json` records V02.3, V07.3 and V08.3 VERIFIED, the V09.1 hard dependencies.
- V09.1 remains PLANNED / next_step_ready=false with isolated evidence pending. V09.2, V09.3 and V27 dependencies are not unlocked.
- ADR-18 permits disposable local/CI isolation, not production topology or cutover.
- Complete CB holdings/denomination, political-capital genesis, formal World identity, lawful seats and deployment evidence remain unresolved.
- Effective change risk: P2 diagnostic tooling, with no authority, arithmetic or production behavior changes. Existing P0 mechanisms are exercised unchanged. No self-approval or VERIFIED claim.

## Change plan

- Add an offline Seed preflight CLI that calls the existing verified-source/non-host preparation functions and returns current per-country blockers, source references and explicit capability limits.
- Export a deterministic report and editable input worksheet. Unknown values remain null; the worksheet is not an OpeningSeed and cannot be consumed as approval.
- Add targeted tests for the actual repository source, deterministic output, explicit refusal and diagnostic CLI behavior.
- Exercise existing Seed bootstrap/retry/conflict/readback and deterministic replay regressions; use an owned disposable loopback PostgreSQL instance where available.
- No economic owner changes; reads are repository files only. Writes are generated local diagnostic artifacts and evidence files.
- No schema, grants, RLS, route installation, production SQL, clock startup, secret access or legacy-site changes.

## Validation plan

- Pinned Node 24.20.0 / pnpm 12.3.4; frozen lockfile unchanged.
- Core/Worker/API build and typechecks; lint, formatting, boundary, safe-environment and secret checks appropriate to changed files.
- Real-source preflight, source drift rejection, CLI unknown-argument rejection, explicit non-readiness and deterministic regeneration tests.
- Existing opening source/Seed/admission/replay regressions, native isolated bootstrap/retry/conflict evidence and V09 preflight evidence as separately recorded.
- Record actual commands, versions, exit codes, failures and NOT_RUN using TEST_EVIDENCE.template.json conventions.

## Exit condition

Deliver reproducible local tooling, generated reports, an input worksheet, immutable implementation identity and actual evidence. Missing source/identity/host inputs remain blockers. No production-ready, P0 VERIFIED, Gate B approval or activated World claim is permitted from this package.

## October 8 release follow-up

- Direct user request: turn preparation into the formal version, deploy, and explain the current World. The user selected Cloudflare Workers within the free allowance as the service target.
- Main source refreshed to `96217db583db4c1bd6ef74714b2e0a5ef6b7ed6d`; local integration candidate `1006d5df213c34b533637165fcc4c03a77480418`, PR124.
- Publish the already integrated main web through the existing Pages workflow; capture the exact run and public HTTP readback.
- Run existing isolated PostgreSQL 16 CI and retain its actual durable receipt. Do not equate disposable evidence with dedicated staging, review approval or Gate B closure.
- Prepare a Cloudflare configuration reusing the previously integrated public source Fetch handler and snapshot reader. Keep their frozen-source hash checks, public origins and read-only route contract. No new economic handler, SQL binding, queue, state store, cron or background executor is introduced.
- Use isolated Wrangler 4.148.0 under `D:\dev\node\isolated\world-cloudflare-tools`, leaving the repository toolchain and lockfile unchanged. Verify provider bundling and local workerd requests before any Cloudflare publication.
- The account token cannot read billing subscriptions (HTTP403). Obtain the account owner's factual plan confirmation before publishing under the free-only constraint. This is a missing account fact, not a request to reauthorize deployment.
- Formal economic activation remains blocked by the actual opening/identity/schema/runtime gates. This follow-up must report partial publication plainly and must not manufacture an ACTIVE World or self-approve a P0 gate.
- Actual workerd testing found that Cloudflare rejects `redirect: "error"` before I/O. Add a narrow source transport adapter using `manual`; the existing loader rejects every non-200 response without following redirects. Preserve the original failing smoke separately. Six regression cases and the subsequent real local workerd smoke pass.
- The user explicitly confirmed the existing account uses Workers Free. This confirms the account fact; no plan upgrade or paid resource is authorized. Effective incremental scope is non-authoritative public-read transport/configuration, without a P0 economic boundary change. Formal gate status remains unchanged.
