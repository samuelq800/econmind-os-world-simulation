# V30.3 disposable restore diagnostic — scoped P2 mainline acceptance

`OWNER_FAST_TRACK_ACCEPTED` applies only to the disposable CI diagnostic,
manual workflow, tests, plan and historical evidence report in commits
`52375f2..8cd4b80`, on mainline base `f28aa51`. This is preparation, not
formal V30.3, Gate B, staging or production disaster-recovery acceptance.

The script refuses non-CI execution, runtime database URLs, credentials,
query/fragment URL overrides and any target other than the exact local
PostgreSQL 16 service. It generates two disposable databases, applies the 16
checked-in migrations, takes a real custom-format backup and verifies that
complete sorted World-head and immutable Command-submission rows match after
restore while a later source-only change does not. The manual workflow does
not access the shared production Supabase project or the original website.

The exact isolated-branch full-row run `35968646448` succeeded at
`9bc9c9cd32ca4a48515c97e5c14a86b9673d1be8`. On this integration tip,
the focused guard tests passed 2/2, targeted ESLint and Prettier passed, and
repository secret scanning passed. The first combined diagnostic run had a
separate failed official check; that failure and its later cross-timezone fix
remain recorded in `DISPOSABLE_RESTORE_DIAGNOSTIC.md`. A merged-main workflow
run and candidate-wide check are separate evidence, not implied by this
acceptance.

Event/Posting replay, Worker crash/fencing, retention policy, real recovery
capacity, dedicated staging and formal independent gate review are `NOT_RUN`.
`status/progress.json` is unchanged.
