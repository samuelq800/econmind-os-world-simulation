# V07 owner continuation activation

## Authority

```text
Decision: ACCEPTED_FOR_MAINLINE_CONTINUATION
Authority: RESPONSIBLE_HUMAN_OWNER
Recorded at: 2026-09-10T00:11:57Z
```

This record transcribes the project owner's explicit instruction that Session
A may implement dependency-ready V07 steps continuously on
`codex/world-core-v07` after normal engineering acceptance without claiming
individual-step verification. It is not a Codex self-approval.

## Exact scope

The exception is limited to adjacent continuation
`V07.1 -> V07.2 -> V07.3`. Each step remains
`IMPLEMENTED_UNVERIFIED` unless a valid independent review promotes it. ADR-20
must be approved before V07.2 queues a Command. The V07 package Review B and
owner-controlled promotion are the hard terminal gate; V08 must not start.

ADR-17 is approved with staged ownership: V07 implements its
Command/Event/Replay layer, V08 its Ledger/Posting layer, and V09 its
writer/lease/fencing/atomic-commit/recovery layer. This record neither pulls
V08/V09 runtime forward nor claims that those mechanisms exist.

Branch-local candidate DDL may use the existing V02 migration chain, but
ADR-16 remains required before that candidate is merged or promoted. Production
mutation remains prohibited.
