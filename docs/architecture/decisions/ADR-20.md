# ADR-20 — Identity lifecycle and immutable economic history

## Status and authority

```text
Decision: APPROVED
Authority: RESPONSIBLE_HUMAN_OWNER
Approved at: 2026-09-10T01:23:40Z
```

This record transcribes the project owner's explicit decision. It is not a
Codex self-approval.

## Approved resolution

- Resolve current authorization at Command intake, at approval where approval
  exists, and immediately before authoritative user-command commit.
- Intake or cached Office context is audit evidence only and is never authority.
- Revoked discretionary work that remains uncommitted fails closed with zero
  authoritative effect. Its receipt records `AUTHORIZATION_REVOKED`, or the
  repository's exact versioned equivalent.
- Already committed authoritative facts remain durable after later authority
  loss.
- Already committed or versioned automatic obligations remain effective unless
  an authorized cancellation or explicit versioned cancellation rule applies.
- Recovery of pending or uncommitted discretionary work re-resolves current
  authorization. Recovery or replay of committed facts does not retrospectively
  re-authorize them.
- Identity and profile lifecycle operations must not cascade-delete immutable
  economic history.

## Exact implementation boundary

V07.2 owns the Command acceptance, queued-execution, idempotency and receipt
contracts that consume this decision. V09.2 owns its assigned authoritative
transaction-time writer, lease, fencing and recovery mechanics. V10.2-V10.3
consume it through their own proposal and approval contracts. This decision
does not pull those later runtime mechanics forward or mark them implemented.

## Alternatives not selected

- Acceptance-only authorization for every queued Command.
- Execution-only authorization that retrospectively invalidates already
  committed facts or durable versioned obligations.
- Cascade deletion of immutable economic history with identity/profile records.

## Compatibility

Future Command families may define an explicit versioned reauthorization or
cancellation rule. Previously accepted and committed facts retain the policy
and evidence required for deterministic replay; policy evolution uses new
versions and forward correction rather than historical mutation.

Affected work packages: V01, V05, V28, V30, V32. Current World Core dependent
steps: V07.2, V09.2, V10.2-V10.3.
