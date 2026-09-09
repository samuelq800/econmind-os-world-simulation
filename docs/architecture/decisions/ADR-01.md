# ADR-01 — Engine and settlement-stage mapping

## Status and authority

```text
Decision: APPROVED
Authority: RESPONSIBLE_HUMAN_OWNER
Approved at: 2026-09-09T13:10:09Z
```

This record transcribes the project owner's explicit decision. It is not a
Codex self-approval.

## Approved resolution

Preserve E01–E18 Engine IDs and use the Constitution-mandated 15
settlement-stage IDs as the single versioned orchestration order, with an
explicit versioned Engine-to-Stage mapping.

The approved resolution supersedes the earlier coordination wording that used
the Master 18-stage list as the orchestration baseline. Engine IDs remain stable
domain identifiers; they are not stage IDs and are not renumbered.

## Exact implementation boundary

- Scheduling uses one approved, versioned stage/order registry.
- Future Engines register one or more operations against an approved stage.
- E01 may schedule the ordered run.
- Network arrival order, database row order and object iteration order are
  never authoritative.
- V06 implements registry and ordering mechanics only. This decision does not
  approve E02–E18 economic operation logic or future stage contents.

## Alternatives not selected

- Treating E01–E18 Engine IDs as settlement stages.
- Creating a third numbered stage list.
- Deferring all daily-settlement scheduling.

## Compatibility

The versioned mapping permits future changes through a new architecture
decision and mapping version. Once persisted events or schedules refer to a
mapping version, historical replay must retain that version.

Affected work packages: V01, V06.
