# V12.3 foundation implementation — reconciliation and stress

**State:** `FOUNDATION_IMPLEMENTED_UNVERIFIED`
**Candidate:** `b0c04ab3e2bbb87edface2c652949d3c3cfcca21`
**Baseline:** `5356fe93932eb285b3c21977a655e4c6e7bb6746`

## Delivered pure-core boundary

`replayResourcePoolTransitions` deterministically applies an explicit lineage
chain and produces the same state and immutable transition records for the
same initial state and sequence. Reused transition references and forged/stale
predecessor references fail closed. The focused stress case extracts exactly
`0.1` ten times from one developed barrel, ends at zero developed / one
extracted, then rejects one further extraction.

`reconcileCommodityInventory` accepts only exact same-unit opening, extraction,
delivered import, domestic-use, delivered-export, project-use, and loss values.
It calculates the typed physical closing balance without choosing timing,
authorization, ordering, or durable application.

## Retained limits

Stale-lineage rejection is a pure compare-against-input safeguard, not a lease,
fencing token, transaction retry, cross-writer reservation protocol, or crash
recovery proof. Those require V09.3 implementation and real recovery evidence.
This candidate cannot be marked `VERIFIED`, cannot close V12, and remains
`NO_GO` for product integration.

Control Tower has quarantined the unresolved V09.3 release/persistence evidence
so it does not block this pure-Core foundation candidate. The recorded V12 hard
dependency remains unchanged, and the quarantine does not authorize product
integration or Gate readiness.
