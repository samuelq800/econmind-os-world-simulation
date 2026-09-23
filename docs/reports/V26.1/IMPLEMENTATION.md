# V26.1 browser forecast protocol preparation

**State:** `PREPARATION_ONLY_NOT_V26_1_STARTED`
**Implementation commit:** `e8fc88f97cfd4a099944602e2c16bdae59f0c4cb`
**Base:** `c91744a6d02865829b82df2088025949de99d88d`
**Branch:** `codex/f-v26-forecast-worker-preparation`

## Implemented

- A typed derived-snapshot contract binds world, country, authorized scope,
  authorization revision, projection version, model version, snapshot reference
  and canonical WorldVersion to every request/result.
- A Comlink browser worker exposes a cancellable task API. Its current executor
  returns `INPUTS_MISSING` or `MODEL_NOT_CONNECTED`; it creates no numerical
  forecast in the absence of an authorized model.
- The client accepts only the newest task for the current snapshot identity.
  It drops completions after a scope, authorization, version or snapshot change,
  or after cancellation/disposal.
- The worker copies only named input fields into an executor and normalizes
  output fields. Forecast values require decimal strings, units and source
  references present in the supplied facts or assumptions.

## Boundary and risk

The highest changed boundary is the non-authoritative browser presentation
layer, classified P2 preparation under the centralized policy. The worker
imports no API/server modules and makes no secret, storage, network or
authoritative-state reads. It performs no commands, events, receipts, postings, DB/RLS changes,
migrations, production access, or simulation-time advancement. The original
EconMind website and D's SixOffices/map/CSS files were not touched. The only
new package is pinned `comlink@4.4.2` in world-web and root test dependencies.

The caller must supply an already-authorized projection. This package does not
decide classification, entitlement, grants or revocation; ADR-12 is still
`PROPOSED_NOT_APPROVED`. The client must receive the _current_ identity from
the future UI/read adapter. Cancellation is cooperative for asynchronous
executors; stale-result filtering remains effective even when computation
settles after cancellation.

## Validation

At Node 24.20.0 and pnpm 12.3.4, the final implementation passed 7 focused
Vitest tests, world-web typecheck/build, scoped ESLint and Prettier, boundary
and authoritative-pattern scanners, repository secret check, frozen lockfile
policy, and staged `git diff --check`. Real Comlink RPC was exercised over a
MessageChannel. Exact commands and exit codes are in `TEST_EVIDENCE.json`.

Earlier attempts failed because temporary pinned binaries were missing, the
root test runner could not resolve a world-web-only `comlink` dependency, two
Markdown lines had trailing whitespace, and one callback parameter lacked a
type annotation. All were corrected before the final passing checks. No failed
mandatory check was ignored.

## Pending integration

V10.4 is recorded `PLANNED` at the immutable base. V26.1 product start, the
authorized projection adapter, model execution, real browser UI wiring,
browser-worker production asset loading, storage/realtime, database/RLS and
product acceptance were `NOT_RUN`. No global status, Gate or merge record was
changed. Review this immutable preparation candidate before any integration.
