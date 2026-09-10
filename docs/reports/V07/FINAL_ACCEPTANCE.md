# V07 package final acceptance

## Decision

```text
Package: V07
Independent Review B: V07_PACKAGE_APPROVED
Owner decision: ACCEPTED
Authority: PROJECT_OWNER_ACCEPTANCE
Approved package target: 079fa9d230d5109488a1e5ea82e97f81845c49eb
Open blockers: 0
Open majors: 0
```

The project owner accepts the exact immutable V07 package target approved by
Independent Review B. This record authorizes canonical V07 promotion, normal
history-preserving merge to `main`, publication of migrations 0002, 0003 and
0004 through the sole ADR-16-authorized main-site release chain, and deployment
only through an existing documented production workflow. It does not extend
acceptance to any later runtime, schema or migration semantics and does not
start V08.

## Release-input identity

- Approved V07 package target:
  `079fa9d230d5109488a1e5ea82e97f81845c49eb`.
- Accepted execution-branch head at authorization:
  `16d3f2f4c4f51bc9bedc5d1a6bdeddef858cae34`.
- Authoritative main at authorization:
  `8e4d9e125a89fc1457ed016c708537fd67e1c8b7`.
- The only commit after the approved package target is `16d3f2f...`; it changes
  only the package review-target manifest, status pointer and matching
  governance assertion. It contains no runtime, schema or migration change.
- The execution branch matched `origin/codex/world-core-v07` and the working
  tree was clean before this record was created.

## Findings and preserved history

- `V07-PKG-BLK-01`: `CLOSED`.
- `V07-PKG-BLK-02`: `CLOSED`.
- `V07-PKG-MAJ-01`: `CLOSED`.
- `V07-PKG-MAJ-02`: `CLOSED`.
- `V07-PKG-MAJ-03`: `CLOSED`.
- `V07-PKG-MAJ-04`: `CLOSED`.
- `V07-PKG-MIN-01`: `OPEN_DEFERRED`.

Historical rejected and superseded targets remain authoritative evidence and
are not deleted or rewritten. The deferred minor is non-blocking and remains
visible for later maintenance.

## Migration publication authority

Migrations `0002_world_v2_command_event_ledger`,
`0003_world_v2_command_receipts_outbox`, and
`0004_world_v2_receipt_event_set_integrity` are approved for promotion and
production publication in this order. Their IDs, source commits, historical
paths, exact bytes and SHA-256 values remain bound by the V02 manifest chain.
Migration 0003 remains byte-for-byte frozen; migration 0004 remains a forward
migration.

ADR-16 remains binding. Only the existing main-site repository release chain
may publish these artifacts to the shared production Supabase project. This
authorization prohibits dashboard/manual SQL, ad-hoc database mutation, a
second publisher, or migration-history rewrite. If the canonical publisher
cannot execute, the release stops at `PRODUCTION_MIGRATION_RELEASE_READY`.

## Promotion boundary

V07.1, V07.2 and V07.3 may be promoted using `INDEPENDENT_REVIEW`; owner
acceptance supplies package closure, merge and production-release authority and
does not replace the independent review. The canonical final baseline must
pass before merge. V08 remains `NOT_STARTED` and may begin only after a fresh
branch from synchronized `origin/main`, dependency recomputation, and owner
decisions for its unresolved ADR gate.

```text
V07 PACKAGE REVIEW = APPROVED
V07 OWNER ACCEPTANCE = ACCEPTED
V07 OWNER AUTHORITY = PROJECT_OWNER_ACCEPTANCE
```
