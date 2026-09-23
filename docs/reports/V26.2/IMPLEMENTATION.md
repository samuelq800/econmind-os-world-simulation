# V26.2 scoped cache and reconnect preparation

**State:** `PREPARATION_ONLY_NOT_V26_2_STARTED`
**Implementation commit:** `52ada0b78dc934c578ed04afb5eba4a80fd80f5e`
**Immutable base:** `f4815cc3d24e4876e9f09858f5536aac560592ef`
**Branch:** `codex/f-v26-reconnect-cache-preparation`

## Implemented slice

`apps/world-web/src/reconnect/scoped-cache.ts` provides a deterministic,
in-memory presentation cache. A JSON-tuple key binds world, AuthSubject,
authorization revision, country, Office, scope, model, projection and canonical
WorldVersion. BigInt comparison preserves version order beyond JavaScript's
safe integer range. The payload is copied through canonical JSON; invalid,
cyclic, accessor, sparse-array and non-finite values are rejected.

`acceptSnapshot` advances only on a newer authoritative snapshot. An older
version is stale; the same version with different reference or payload is a
conflict. `observeNotice` accepts a scoped outbox notification only as an
invalidation watermark. It never applies an economic delta. A replacement
snapshot must cover the highest notice version. `onReconnect` marks cached
values as requiring a new snapshot comparison, including if WorldVersion did
not change. `revokeAuthorization` clears all values and binding. Every read
reports `UNAVAILABLE_NO_LIVE_CHANNEL` for live availability.

The API is `createScopedProjectionCache()` with `bindAuthorization`,
`revokeAuthorization`, `acceptSnapshot`, `observeNotice`, `onReconnect`, `read`
and `liveAvailability`; `scopedCacheKey` is exported for future storage
adapters. The future read adapter must call `bindAuthorization` only with a
currently verified identity/revision and must call `revokeAuthorization` on
revocation. This preparation does not decide entitlements or classification.

## Boundary and gate

The touched boundary is non-authoritative world-web client memory, a P2
preparation candidate. It performs no authoritative reads/writes, commands,
events, receipts, postings, DB/RLS, migration or production operation. No
Core/API/worker, D-owned page, SixOffices/map/CSS, or original EconMind site
file changed. It does not use a wall clock or simulation clock.

At the exact base, V10.4, V17.3, V20.3, V23.3, V25.3 and V26.1 remain
`PLANNED` in `status/progress.json`; ADR-12 remains
`PROPOSED_NOT_APPROVED`. Formal V26.2 implementation is therefore not
started. No global status/Gate, owner acceptance or merge claim was made.

## Verification and remaining work

At Node 24.20.0 / pnpm 12.3.4, 6 new tests and 7 adjacent V26.1 regression
tests passed. World-web typecheck and build, scoped ESLint/Prettier, boundary
and authoritative-pattern scanners, secret scan and staged diff check passed.
Exact commands and exit codes are in `TEST_EVIDENCE.json`.

Actual private channel/outbox transport, authorized API snapshots, classified
scope/RLS, IndexedDB persistence, restart recovery, UI wiring and product E2E
were `NOT_RUN`. Cached values remain explicitly derived; a future adapter
must fetch authoritative snapshots after notification/reconnect and must never
promote this cache to World State.
