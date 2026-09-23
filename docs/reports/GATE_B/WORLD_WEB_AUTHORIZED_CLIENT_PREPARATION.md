# World Web authorized client preparation evidence

- State: `PREPARATION_ONLY_NOT_BROWSER_INTEGRATED`
- Immutable base: `2dc1de3fc4b4ea4c5f4792538d961420317912db`
- Implementation commit: `9662dd075c8de70c95643e3335dd913087268074`
- B-blocker remediation commit: `550b0be70ea40ef7bbda297d8a73767dba1db3c0`
- E protocol candidate inspected: `dbcf7c52452d0e452ff19299d310ef69f0a89dd6`

**Branch:** `codex/f-world-web-authorized-client-preparation`

The new, unimported World Web client mirrors E's two local HTTP paths,
request fields and response envelopes. It accepts only an explicit loopback
origin, rechecks the active browser identity and authorization revision,
stores only a derived projection in the V26.2 scoped cache, rejects stale or
cross-scope projections, and treats an unacknowledged command as `UNKNOWN`.
It strips token data from returned results and does not persist it. A typed
durable-receipt declaration is accepted only when command identity and receipt
invariants match; this is not proof of server durability without the E handler.

B's narrow review identified a real ambiguity: a server could commit and send
a 200 response whose body is truncated, which the first candidate mislabeled
`UNAVAILABLE/INVALID_RESPONSE`. The forward fix returns `UNKNOWN` for every
post-dispatch response without a verified final receipt, marks the derived
cache for reconciliation, and retains the unresolved request identity in
memory. New command IDs or changed payloads are blocked even after a snapshot
refresh; only an exact-ID retry can clear the guard with a verified final
receipt. The committed-once/truncated-JSON regression and wrong envelope,
missing/invalid receipt, and service-error cases are covered. This is not
durable across page restart; persistent pending-command recovery remains
outside this preparatory, unmounted client.
This remediation is submitted for B closure review, not self-approved.

Focused Vitest: 2 files, 18 tests passed. World Web typecheck, Vite build,
scoped ESLint and Prettier, authoritative-pattern scan, secret scan and staged
diff check passed. The boundary scan initially failed because the clean
worktree had not built `@econmind/core`; after building that package it passed
with 133 files scanned. Commands and exact results are in the adjacent JSON.

Compatibility is partial, not an integration claim. E's candidate is not on
this base and has no OPTIONS/CORS support; a different-port browser page
cannot call its authenticated JSON routes directly without local CORS support
or a same-origin development proxy. E's narrow command request also lacks a
server-side expected WorldVersion fence; the client's freshness check is only
a pre-submit guard. E provides no separate receipt lookup route. UI wiring,
actual local bridge requests, Chrome E2E, database/RLS/staging, production
access, independent review and Gate B are `NOT_RUN`. No status/progress or
authoritative business logic was changed. This candidate is suitable for
non-production mainline preparation only after review of the stated gaps.
