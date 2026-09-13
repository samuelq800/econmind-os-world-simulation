# ADR-12 — Projection classification and confidentiality

## Status and authority

```text
Decision: APPROVED
Authority: RESPONSIBLE_HUMAN_OWNER
Approved on: 2026-09-13
```

This record transcribes the project owner's explicit approval to directly
approve the V10.1 projection-classification rule. It is not a Codex
self-approval and it does not approve a later transaction, deployment, or
production release.

## Approved resolution

One server-enforced classification policy applies wherever a World V2 read
projection is eventually exposed:

- `PUBLIC` contains only aggregate, non-sensitive completion information.
- `COUNTRY` contains only the current member country's permitted balances and
  summaries; it is never selected by a caller-provided country claim.
- `OFFICE_PRIVATE` requires the current server-resolved Office assignment.
- `NEGOTIATION_PARTY` requires current server-resolved membership of a named
  party and any required Office scope.
- `ADMIN` is resolved separately by the server and is never inferred from a
  browser or ordinary country/Office membership claim.

Every row is derived, watermark-bound to authoritative WorldVersion and event
sequence, and replaceable from authoritative facts. Browser state, fixtures,
caches, Realtime, and projections are not World State or portable Office
authority. Client-side filtering cannot substitute for this policy.

## Exact V10.1 boundary

This approval releases the ADR-12 gate for V10.1's classification, derived
read-projection publication, and authenticated read boundary. It does not
create a public route, a live JWT verifier, an entitlement writer, a forecast
product, Realtime/cache behavior, a production/shared-Supabase connection, or
an original EconMind website change. Those surfaces retain their own gates and
evidence requirements.

ADR-09 remains unapproved and still blocks V10.2's versioned Office approval
and transaction rule; this ADR-12 decision does not select that rule.

## Alternatives not selected

- One country-wide read model with browser-side field filtering.
- Accepting country, Office, party, or admin authority from client claims.
- Treating a projection or fixture as economic state.

Affected work packages: V05, V10, V24, V25 and V26.
