# ADR-09 — V10 required Offices for the narrow Treasury-GCU fixture

## Status and authority

```text
Decision: APPROVED
Authority: RESPONSIBLE_HUMAN_OWNER
Approved on: 2026-09-13
```

This record transcribes the project owner's explicit ADR-09 approval. It is
not a Codex self-approval, and it does not itself authorize implementation,
main merge, deployment, staging, production access, or a transaction.

## Approved resolution

For the exact V10 below-threshold, non-strategic registered-commodity fixture
paid in Buyer Treasury GCU:

- Seller Trade signs the offer.
- Buyer Trade accepts it.
- Buyer Finance approves the Treasury payment.
- Central Bank is not required because the fixture does not draw official
  reserves; Captain is not required because the fixture is non-strategic and
  below threshold.

The required-Office resolver is versioned and binds the World, both country
sides, proposal/version, payload fingerprint, policy version, complete Office
set and expiry. Every named Office signs separately even if one person holds
more than one Office. Signing and protected execution/recovery re-resolve
current identity, membership, country, Office, capability and revision.

A change to asset source, threshold, commodity classification, terms, payload
fingerprint, policy version, Office set, or expiry invalidates prior approval;
stale or revoked context fails closed with zero authoritative effect.

## Exact implementation boundary

This releases only ADR-09's JIT rule gate for planning the V10.2 narrow
proposal/approval/reservation slice. V10.2 still depends on completed V10.1
work and its own exact implementation authorization, evidence and independent
review. This decision does not approve a full transaction engine, a broader
Office matrix, other commodity/instrument thresholds, browser authority,
production/shared-Supabase access or mutation, or the original EconMind
website.

Affected work packages retain their separately declared gates. Future uses
outside this exact fixture require a forward decision rather than extending
this record by analogy.

## Alternatives not selected

- Trade-only approval, which omits Treasury authority.
- All-six-Office approval, which is not justified for this fixture.
- Ad-hoc UI approval, which is not an authorization control.
