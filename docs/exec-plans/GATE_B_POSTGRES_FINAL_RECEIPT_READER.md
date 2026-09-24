# Gate B PostgreSQL final receipt reader

Immutable starting base: `45990429bb5405675d72cfde0299ca176084485c`
(`origin/main` when this isolated branch was created).
Branch: `codex/postgres-final-receipt-reader`.

## Contract

- Add one server-owned, read-only adapter for future HTTP route injection. The
  adapter accepts only an already-managed `ParameterizedPgReadExecutor`; it
  must not create a connection, pool, transaction, role, migration or route.
- Read only an immutable `world_v2.command_receipt` joined to its immutable
  `world_v2.command_submission`. Match the exact server-current
  `authSubject`, `countryId` and `officeId` together with the requested
  `worldId`, `commandId` and `idempotencyKey`.
- Keep all six values in PostgreSQL bind parameters. A missing, unauthorized,
  stale-scope or wrong-idempotency lookup returns the same empty result.
- Require the receipt and submission identities, idempotency keys and command
  fingerprints to agree in the returned row. Reject unexpected shapes,
  malformed durable values, or more than one row as a non-retryable protocol
  failure. Database detail must not cross the adapter boundary.
- Treat only the database query result as candidate durable evidence. No
  caller-supplied `source`, fixture label or mock literal can select or prove a
  final receipt.

## Ownership and exclusions

Own only `apps/world-api/src/integration/postgres-final-receipt-reader.ts`, its
focused integration test, this plan and the matching evidence report. Do not
edit an HTTP bridge, route, F client, database migration/schema, connection
management, main site, production Supabase, status/Gate file or unrelated
work owned by another branch.

## Verification

Run the focused PGlite integration test against migrations 0001-0003, World
API typecheck/build, targeted ESLint and Prettier, repository boundary and
authoritative-pattern checks, local-environment/policy/secret checks and a
final diff review. Record live managed-PostgreSQL injection, E/F wiring,
production rollout, independent review and Gate B approval as `NOT_RUN`.
