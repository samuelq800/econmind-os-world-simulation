# V01 two-repository identity, route, and Legacy integration contract

This document freezes the V01 integration boundary between the main-site
repository (`econmind-os`) and World V2 (`econmind-os-world-simulation`). It is
a contract and plan, not an implementation claim. Any later code that changes
identity, authorization, RLS, migrations, authoritative state, or settlement is
P0 and still needs blocking independent review.

## Immutable baselines

- World V2 planning baseline:
  `02f5bf2b172cceb1e952c8f5095510b198b6a4e6`.
- Main-site authority inspected from `origin/main`:
  `cd559dffba0af3f1007203243771601cb0f81c17`.
- The local main-site working tree was dirty on another branch. It was read-only
  and was not treated as contract authority.

## Shared identity whitelist

Only these profile fields may cross the repository contract:

| Field          | Meaning                         | Explicit limit                                                |
| -------------- | ------------------------------- | ------------------------------------------------------------- |
| `user_id`      | Stable internal Auth subject    | Not display identity and never sufficient authorization       |
| `display_name` | Optional presentation label     | Cannot grant roles, ownership, or access                      |
| `school_id`    | Optional organizational context | Must not substitute for current membership/eligibility checks |

World V2 may validate the standard signed-token envelope (`sub`, `iss`, `aud`,
`exp`, `iat`). It must then resolve current team, country, Office, suspension,
and assignment authority server-side. Email, passwords, refresh tokens,
service-role keys, main-site `role`/`platform_role`, client role checks, and
portable membership/assignment claims are not shared identity fields.

Revocation must deny new access. Profile removal must not cascade-delete
immutable World V2 economic history. The final lifecycle semantics remain
subject to ADR-20 and P0 review when implemented.

## Ownership

The main site owns public navigation, Supabase Auth lifecycle, shared profile
and school/team administration, League, V1 World, Legacy World, and the sole
production Supabase migration publication chain.

World V2 owns exactly one authoritative World State, its command/event/receipt
contracts, economic ledger/postings, deterministic/idempotent execution, atomic
settlement, projections, API, worker, and non-authoritative UI. The main site,
V1, League, Legacy World, browser state, caches, snapshots, replay views, and
forecasts can never be alternate authority for World V2 economic state.

The only shared layer is a versioned contract: identity whitelist, validated
token envelope, route links, and migration artefacts. World V2 may prepare a
versioned migration artefact in later authorized work; only the main-site
release chain may publish it to production.

## Route behavior

Existing main-site behavior is preserved:

- `/world` continues to redirect to `/simulation/world`.
- `/simulation/world/*` remains the current V1 Simulation World.
- `/league/world/*` remains the League/V1 World surface.
- `/simulation/legacy-world/*` remains the explicit Legacy World surface.
- `/country`, `/lobby`, `/room`, `/results`, `/replay`, and `/view` retain their
  existing compatibility behavior.

V01 does not rebind, proxy, or silently redirect any of these routes to World
V2. A separately configured World V2 origin may be linked only after its release
gate. A future same-origin route requires an approved ADR-19 design and a
separately reviewed implementation. Access/refresh tokens must never travel in
URLs or unrestricted `postMessage` payloads.

## Legacy reuse

Reusable, with an explicit source commit, path, provenance/license, and content
hash: brand images, country flags, the world-map SVG and provenance record,
design tokens, purely presentational styles/components, and reviewed static
copy. Reuse is by versioned copy, not a runtime cross-repository import.

Prohibited as World V2 truth or authority: V1/Legacy rows, snapshots, IDs,
balances, inventory, contracts, scores, policy state, Supabase mutations/RPCs,
Edge Functions, migrations, RLS policies, credentials, browser/React/Realtime/
cache/local-storage state, settlement/scoring/policy-effect engines, calibration
outputs, and any client-side League role check.

## World V2 authoritative-state boundary

The only state-change path is:

`authorized command → validated receipt/idempotency → deterministic worker → atomic append-only events/postings → derived projections`

`apps/world-api` is the authentication and command/query boundary;
`apps/world-worker` is the authoritative execution host; `packages/core` is
deterministic domain logic; `apps/world-web` is non-authoritative. There is no
direct main-site, V1, League, Legacy, UI, cache, snapshot, replay, or forecast
write path and no direct macro buff.

## Gate

V01.3 ends at `V01 PACKAGE-LEVEL REVIEW`. V02 must not start before that gate
passes.
