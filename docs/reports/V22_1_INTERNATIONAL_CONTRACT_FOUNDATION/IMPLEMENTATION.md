# V22.1 international-contract pure Core foundation — implementation record

## Status and dependency boundary

`FOUNDATION_IMPLEMENTED_UNVERIFIED`. The frozen code candidate is
`744f942c9c1eb97cd5eef51f25fd6c5654cc9afa`, based on the reviewed V20 tip
`c91744a6d02865829b82df2088025949de99d88d` on the isolated branch
`codex/c-v22-international-contract-foundation`.

This is not a claim that V22.1 or V22 is complete. V21.3 remains a formal,
unavailable dependency, so this candidate supplies a composable pure-Core
kernel only. ADR-10 is still proposed, not approved; the exact INT-01 through
INT-23 catalog is therefore validated as a type-only matrix and no subtype
family, schema, adapter, or economic executor is invented.

No status/Gate file, main-site file, World State, database, Supabase project,
deployment, or production surface was changed.

## Implemented foundation contracts

- The exact ordered 23-type Master catalog is fixed and checked at runtime.
  Every entry is explicitly marked `TYPE_ONLY_PENDING_ADR_10_AND_V21_3`.
- Offers and counteroffers create immutable, consecutive contract versions.
  A new version clears predecessor approvals and returns their references as
  invalidated; no old approval can authorize a changed version.
- Internal approval rounds are bound to one exact contract version and a
  caller-supplied set of office references. Core invents no offices or approval
  policy. Rejection returns the version to negotiation; every subsequent offer
  creates a new version and approval round.
- Explicit lifecycle edges cover signing, activation, delay/cure,
  suspension/resumption, renegotiation, dispute/settlement, partial/default,
  completion, termination, and expiry. Signing requires all current-version
  approvals; activation requires that exact version to be signed.
- Structured terms contain only stable references to future subtype facts and
  schema versions. `noteText` is stored as inert context and is never read by a
  transition or interpreted as an economic value.
- Every transition binds source, predecessor facts, source version, snapshot
  reference/hash, exact simulation tick, canonical payload, exact integer
  contract-version before/delta/after values, and a canonical replay preimage.

## Ownership and exclusions

The module returns non-authoritative candidates and replay evidence. It creates
no authoritative Contract, Command, Event, receipt, right, obligation,
inventory/financial posting, settlement, tariff, sanction effect, exchange-rate
operation, or durable idempotency record.

V22.2/V22.3 economic execution, V21.3 organization/office integration,
authorization, persistence, database/RLS/migration, API/worker/UI, scheduler,
transaction/recovery, and production rollout remain outside this candidate.

## Mainline comparison

After implementation, `origin/main` was refreshed to
`19e6082928c730782213e7d602f492bb3e961ca2`. It descends from the branch base.
The changed-path intersection between this candidate and mainline since their
merge base is empty, and `git merge-tree` reports no conflict marker. No merge,
rebase, cherry-pick, or status promotion was performed.
