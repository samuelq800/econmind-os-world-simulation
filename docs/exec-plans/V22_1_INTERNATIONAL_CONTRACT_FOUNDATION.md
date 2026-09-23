# V22.1 international-contract pure Core foundation plan

> Intended report-only state: `FOUNDATION_IMPLEMENTED_UNVERIFIED`. This plan
> does not start or complete V22.1, alter `status/progress.json`, or satisfy the
> NORMAL-mode V21.3 dependency.

## Identity and authority

- Base: V20 reviewed tip `c91744a6d02865829b82df2088025949de99d88d`.
- Branch: `codex/c-v22-international-contract-foundation`.
- Binding scope: MASTER-U1511–U1648, especially MASTER-U1520–U1545,
  MASTER-U1571–U1581, MASTER-U1597 and MASTER-U1646–U1648; Trade-U0275–U0314
  and Trade-U1050–U1078.
- Fixed subtype source: the 23 Master E16 activity types mirrored in
  `requirements/fixed_catalogs.json` and INT-01–INT-23 in
  `requirements/coverage_families.json`.

## Dependency and decision boundary

- V22.1 is NORMAL-mode work whose hard dependencies include V21.3. V21.3 is
  not available for integration, so this task is an explicitly requested,
  composable pure-Core foundation only.
- ADR-10 remains `PROPOSED_NOT_APPROVED`. The foundation may preserve the exact
  Master 23-type catalogue, but it must not invent or freeze subtype-family,
  economic-adapter, approval-owner, settlement, or failure-path mappings.
- Effective risk is P0 because contract versioning and approvals constrain
  future authoritative cross-border rights and obligations. Independent review
  remains mandatory; no self-verification or continuation claim is permitted.

## Planned implementation

- Add one independent Core file and one focused test file. Do not modify any
  V21 file owned by A/E.
- Define and runtime-validate the exact INT-01–INT-23 subtype matrix as
  `TYPE_ONLY_PENDING_ADR_10_AND_V21_3`; common-kernel coverage must not imply a
  subtype executor exists.
- Model negotiation versions as immutable predecessor-linked facts. Offer and
  counteroffer create a new exact integer `contract_version`; sent versions are
  never edited, and all prior approvals are invalidated on a new version.
- Model version-bound approval requests and decisions. Approval may advance
  only the exact current version; rejection returns the object to negotiation.
- Model explicit, caller-evidenced lifecycle edges including sign, activate,
  delay, suspend/resume, renegotiate, dispute/settlement, partial/full default,
  complete, terminate and expire. Core validates an edge; it does not infer
  breach, default, policy, timing, or economic effects.
- Keep free-text notes inert and separate from structured term references. The
  common kernel produces no Goods, Money, Ownership, Technology, Debt, tariff,
  quota, logistics, relationship, or macro change.
- Reuse the existing immutable Foundation fact boundary for source,
  predecessor, snapshot version/hash, time and canonical payload validation.
  Return exact quantity transitions plus canonical SHA-256 replay preimages.

## Excluded surfaces

- V21 order book, fill, shipment, delivery, customs, tariff, quota or logistics
  files and interfaces.
- V22.2/V22.3 subtype executors, schema-specific fields and economic adapters.
- World State, commands, events, durable receipts, ledgers, DB/RLS/migrations,
  API/worker/UI, authorization implementation, Supabase, deployment and
  production.
- Main-site files, lifecycle/Gate status, merge, acceptance and release.

## Validation and evidence

- Positive vectors: exact 23-type coverage, offer/counteroffer version
  increments, approval completion, sign/activation and representative
  suspend/default/dispute paths, deterministic replay.
- Negative vectors: missing/duplicate/unknown subtype, edited or skipped
  version, stale approval, approval reuse after counteroffer, unknown status or
  action, illegal edge, duplicate transition, mixed/stale/tampered fact lineage,
  and free text presented as a structured term.
- Run Core build/typecheck, focused V22.1 tests plus existing foundation
  provenance tests, targeted lint/format, boundary, authoritative-pattern,
  secret and diff checks.
- Record all non-Core integration and dependency evidence as `NOT_RUN` or
  pending, then freeze/push the candidate SHA for independent review.
