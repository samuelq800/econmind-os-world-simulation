# V09 disposable PostgreSQL fault-evidence path

**Status:** `PREPARATION_ONLY`; no Gate B or dedicated-staging acceptance claim.

**Base:** `ebc5fcbe010559d5d6a94e86792a77ecc02502d2`

## Purpose and authority boundary

`scripts/v09-disposable-postgres-evidence.mjs` executes the existing V09
provisioning body only after a stricter local/CI policy accepts its target. It
uses the same migration provenance validation, RLS/grant checks, real client
close/reconnect fault protocol, acknowledgement-unknown branch, marker-bound
cleanup and no-residue verification as the dedicated staging runner.

It accepts only an explicitly confirmed `localhost`, `127.0.0.1` or `::1`
`econmind_v09*` database under `V09_TEST_DATABASE_URL`. It rejects runtime
database variables and any `SUPABASE_*` or `VITE_SUPABASE_*` environment
variable before creating a client. It does not connect to Supabase, production,
or the original EconMind site.

The URL must include an explicit numeric PostgreSQL port, and it must not carry
a query string or fragment. This rejects PostgreSQL driver connection-parameter
overrides (including `host` or `port`) before a `pg.Client` is constructed and
prevents an omitted port from inheriting `PGPORT`. Thus the reviewed loopback
target and its fingerprint are also the only possible driver target for both
the primary and cleanup clients.

The runner creates the disposable namespace with the approved admin and then
executes the exact first migration as the migration owner. PostgreSQL requires
database-level `CREATE` permission even when that migration's schema creation
is an `IF NOT EXISTS` no-op. The runner grants that permission inside its still
uncommitted transaction, records migration `0001`, resets role, revokes the
permission, and reasserts the migration owner before migration `0002`. A
failure before commit rolls the grant back; a later migration never sees it.

## Immutable input and output contract

An actual local/CI run requires:

```text
ECONMIND_ENV=local|ci
V09_TEST_DATABASE_FINGERPRINT=world-v2-v09-test-local|ci
V09_TEST_DATABASE_URL=<loopback disposable PostgreSQL URL>
V09_DISPOSABLE_EVIDENCE_CONFIRMATION=EXECUTE_DISPOSABLE_V09_POSTGRES_EVIDENCE
V09_DISPOSABLE_EVIDENCE_OUTPUT=<new absolute .json path>
```

The durable JSON output is created once with exclusive creation and directory
sync; it contains no connection string or credentials. It binds the repository
commit, migration-manifest SHA-256, every migration artifact SHA-256 and source
commit, and the non-secret loopback target fingerprint. It records:

- lease fencing and stale-writer rejection;
- role ownership, forced RLS, worker least privilege and reader read-only
  checks;
- pre-commit client loss followed by reconnect and rollback/lease recovery;
- committed-but-acknowledgement-unknown client loss followed by reconnect and
  durable marker/fence recovery; and
- marker-bound restrictive cleanup with role and namespace residue checks.

Receipt/recovery remains a separate real-PostgreSQL focused assertion in
`tests/world-core/v09-atomic-recovery-postgres.test.ts`; the disposable runner
does not relabel that suite as executed. Run it against the same explicitly
confirmed disposable target after Core and Worker builds.

## Classification rule

Even when all local assertions pass, the output is permanently labelled:

```text
evidence_scope=DISPOSABLE_LOOPBACK_POSTGRESQL
judgment=EVIDENCED_DISPOSABLE_LOCAL_ONLY_NOT_DEDICATED_STAGING
gate_b_dedicated_staging=NOT_RUN
transport_tls_staging_equivalence=NOT_RUN
```

It cannot replace a dedicated staging target, its TLS path, owner approval, or
the final independent Gate B decision. The historical dedicated-staging
`CRASH_CONNECTION_LOSS` TLS failure
`ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC` remains `FAIL`; this preparation
does not waive or downgrade it.

## Original preparation execution record

On this preparation branch, no loopback PostgreSQL service was available at
`127.0.0.1:5432`. Therefore the new runner and the real receipt/recovery suite
were **not executed**. This document records the required path and the actual
`NOT_RUN` condition, not a database result.

## Later isolated execution (2026-09-24)

After a narrow, independently reviewed fix to the cleanup predicate's
PostgreSQL-array decoding, the disposable runner and follow-on PostgreSQL
lease, receipt-recovery and V10.4 suites passed at frozen SHA
`d738362b275956f2a338a2c6cba4bde50b6e9f23` in
[Actions run 35946009374](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/35946009374).
The durable runner JSON says `status=PASS`, `cleanup.status=PASS`, and
`receipt_recovery.status=NOT_RUN`; the receipt-recovery suite was a later,
separate passing CI step on the same SHA. Its output classification remains
`EVIDENCED_DISPOSABLE_LOCAL_ONLY_NOT_DEDICATED_STAGING`. Neither that run nor
the later [run 35950584759](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/35950584759),
which passed both disposable PostgreSQL V09/V10 evidence and the official
`pnpm check` at main code SHA `ca5b056ea818dc73e113a2bf4635318ae7c8bebf`,
changes the historical managed-TLS `FAIL` or approves Gate B. See
[`CURRENT_GATE_B_STATUS.md`](CURRENT_GATE_B_STATUS.md) for the remaining route.
