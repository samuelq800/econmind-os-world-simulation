# EconMind World Simulation V2

This is the dedicated World Simulation V2 repository. It does not modify or
deploy the original EconMind main site. There is one authoritative World/Core
path; the product must not create separate ordinary-World and Season-1 economic
engines or hidden buffs.

## Current state (2026-09-24)

The repository has more than a foundation scaffold. `packages/core` contains
deterministic economic, command, ledger, replay, and preparation modules;
`apps/world-worker` contains authoritative-execution infrastructure;
`apps/world-api` contains command/query integration modules; and
`apps/world-web` contains a map, six-Office UI, authorized-client and forecast
preparation. Recent V27 provenance, calibration-closure and NPC-intent modules
are **non-production preparation**, not a generated 70-country World.
V29 now has a source-to-evidence gap baseline and a strict candidate-bound
evidence-claim helper (all 139 requirements default to `MISSING`); V30 has a deterministic,
non-network load-plan/latency-summary helper for 50/100/420 virtual sessions.
V29 also has a test-only two-country 600/1000-day exact-ledger/replay harness
and a disposable-PGlite driver for one real Worker goods-delivery commit/retry;
V30's injected runner is bounded and has no built-in service target.
These preparations are not a real 70-country World long run, measured load
test, security acceptance or V29/V30 gate pass; see [`docs/reports/V29.1/PREPARATION_GAP_AUDIT.md`](docs/reports/V29.1/PREPARATION_GAP_AUDIT.md)
and [`docs/reports/V30.1/IMPLEMENTATION.md`](docs/reports/V30.1/IMPLEMENTATION.md).

The runnable API process currently exposes health/readiness endpoints only.
The default web prototype is `LOCAL_FIXTURE`; an authorized local read requires
an explicit trusted-host opt-in and is not mounted by the default entrypoint.
There is no proven end-to-end authorized browser command/receipt flow, live
forecast model, production database rollout, or product release.

**Gate B is PENDING.** A narrow cleanup-decoding fix now passes the disposable
PostgreSQL fault runner, V09/V10 recovery suites and official `pnpm check`
on the same frozen code candidate (`ca5b056`, Actions run `35950584759`).
The previous main-candidate check failed in a V00.2 shutdown-test timing
race; a test-only fixture removed that race without dropping its repeated-
signal assertions. This is code/CI evidence, not dedicated staging evidence.
Dedicated non-production staging/TLS,
non-production RLS/grant evidence, two-country/two-Office browser E2E, and
final independent Gate B review remain open. See
[`docs/reports/gate-b/CURRENT_GATE_B_STATUS.md`](docs/reports/gate-b/CURRENT_GATE_B_STATUS.md)
for exact runs, scope, and the next evidence route. No green local test or
merged preparation module is Gate B approval.

`status/progress.json` is the formal governance ledger and still lists V09
onward as `PLANNED`; it has not been silently promoted to match merged
preparation code. Its old ADR-18 blocker wording is inconsistent with the
approved ADR-18 record in `status/decisions.json` and needs a separate
governance reconciliation. The V28 single-World candidate also remains outside
main while the older two-orchestrator V28.1/ADR-14 contract is reconciled.

## Frozen toolchain

- Node.js 24.20.0
- pnpm 12.3.4
- TypeScript 6.0.3
- Vite 8.2.2
- React 19.2.8
- Vitest 5.0.0
- ESLint 10.10.0
- Prettier 3.9.6

Use the exact Node and pnpm versions above. Installation fails closed when the
active versions differ.

## Workspace responsibilities

- `apps/world-web`: non-authoritative browser UI and derived local state.
- `apps/world-api`: authentication, command, and query boundary; its current
  process entrypoint is not the complete integration route.
- `apps/world-worker`: authoritative execution host, never imported by web.
- `packages/core`: deterministic domain logic without React, browser APIs,
  Supabase SDKs, or arbitrary persistence writes.
- `packages/testkit`: shared test support. Other shared packages are added only
  when a concrete implementation needs them; repository ownership boundaries
  still apply.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test:v09:postgres
pnpm test:v10.4:postgres
```

The PostgreSQL commands require an explicitly confirmed disposable local/CI
database. The manual `Gate B disposable diagnostic` GitHub Actions workflow
uses its own short-lived PostgreSQL service and records the exact checkout SHA;
it cannot replace dedicated staging or authorize Gate B.

Use `pnpm supabase:safe -- status` for the repository-approved Supabase status
check. Never run development migrations or resets against the shared
production Supabase project. See `docs/runbooks/ENVIRONMENT_SAFETY.md` and
`AGENTS.md` before integration work.
