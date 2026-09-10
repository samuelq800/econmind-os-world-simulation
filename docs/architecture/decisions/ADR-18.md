# ADR-18 — Environment and resource isolation

## Status and authority

```text
Decision: APPROVED
Authority: CONTROL_TOWER_OWNER_DELEGATION
Delegation source: ECONMIND DEVELOPMENT CONTROL TOWER — EXECUTIVE AUTONOMY POLICY
Approved at: 2026-09-10T16:20:14Z
```

The project owner directly delegated development-governance authority to the
Control Tower and explicitly approved the current canonical ADR-18 proposal.
This is a delegated-owner decision record, not a Codex self-approval. It does
not authorize production access, publication, cutover, or mutation.

## Exact approved resolution

The canonical proposal is approved unchanged:

> Local 和 CI 使用一次性环境，staging 使用隔离项目或分支，production 最后连接共享项目；Web、API、Worker 保持职责隔离。

For the World Core V09 JIT implementation boundary, the canonical recommended
realization is:

- disposable local/CI PostgreSQL for deterministic transaction and concurrency
  tests;
- a dedicated non-production Supabase staging project for final PostgreSQL
  concurrency, crash, RLS and grant evidence;
- canonical fail-closed environment fingerprint/mutation checks before any
  persistence activity; and
- no production target accessible to this sprint.

PGlite remains valid for pure DDL rehearsal, but is insufficient as the sole
V09/Gate B concurrency, crash, RLS or grant evidence surface.

## Exact implementation boundary

The generic register preserves ADR-18's affected packages and latest gate:
`V01`, `V02`, `V30`, `V31`; `V02/V30`. The more specific World Core owner/JIT
pack additionally binds V09.1–V09.3 and V10.4 to isolated real persistence and
concurrency evidence. That specific execution gate is now approved rather than
pending; it still requires the actual named non-production surfaces and cannot
be satisfied by a claim, a PGlite-only run, or a production connection.

Web, API and Worker retain separate responsibilities. The Worker is a
background process and is not implemented through GitHub Pages or browser
compute. Production topology, capacity, cost, cutover, backup retention and
the actual production release are deliberately outside this decision.

## Alternatives not selected

- PGlite-only Gate B evidence, which cannot establish all required operational
  PostgreSQL/Supabase behavior.
- Testing against a shared production target, which is prohibited.

## Compatibility

Any later environment, topology, capacity or production-publication change
must use a new forward decision and the existing production release process.
This decision does not weaken fail-closed environment checks or permit a
second persistence authority.

Affected work packages: V01, V02, V30, V31. Current World Core dependent
steps: V09.1–V09.3 and V10.4.
