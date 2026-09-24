# Gate B PostgreSQL final receipt reader evidence

## Immutable identity

- Isolated branch: `codex/postgres-final-receipt-reader`.
- Starting base: `45990429bb5405675d72cfde0299ca176084485c`.
- Prior plan commit: `793534300b1637f5a3a43e09bf265c3d7e063cf2`.
- Frozen code/test commit: `d228cb65cd44d3ed0d3daf04ea5ba7b9ba363832`.
- Frozen code/test tree: `87c96505ca04759dcf41b40da1e548cf740310e2`.
- Candidate state: `IMPLEMENTED_UNVERIFIED`. This implementer evidence is
  not independent approval or Gate B acceptance.

## Implemented boundary

`postgres-final-receipt-reader.ts` injects only the existing managed
`ParameterizedPgReadExecutor`. It creates no connection, pool, transaction,
role, route or database object. Its single statement is a read-only,
parameterized `select` from immutable `world_v2.command_receipt`, inner joined
to immutable `world_v2.command_submission` on world, command and fingerprint,
with equal idempotency evidence.

The lookup binds all six values separately: `worldId`, `commandId`,
`idempotencyKey`, server-current `authSubject`, `countryId` and `officeId`.
Zero rows returns `null` for both absence and scope mismatch. More than one
row, mismatched submission/receipt evidence, unknown fields, malformed IDs or
fingerprints, inconsistent outcome evidence and oversized output fail closed
as non-retryable protocol failures. Database errors are redacted. A caller or
fixture cannot supply a `source` field; the durable-source discriminator is
created only after a matching database row passes all checks.

The binding columns were confirmed in
`0002_world_v2_command_event_ledger.sql`; receipt identity, evidence trigger
and immutability were confirmed in
`0003_world_v2_command_receipts_outbox.sql`. No schema change was required.

## Verification against frozen code commit

- Focused PGlite migration-backed tests plus the pre-existing PostgreSQL read
  adapter suite: **PASS**, 2 files / 20 tests. The new suite covers committed
  and rejected durable rows, foreign auth/country/office, wrong command and
  idempotency identities, parameter-only values, read-only SQL, duplicate and
  fingerprint-conflict rows, an injected source literal, malformed evidence,
  cancellation and error-detail redaction.
- Targeted ESLint and Prettier: **PASS**.
- `@econmind/world-api` typecheck and build: **PASS**.
- Repository boundary and authoritative-pattern scans: **PASS**.
- Local safe-environment, foundation policy and repository secret scans:
  **PASS**. The environment reported no configured database, no linked
  Supabase project and database mutation disabled.
- Base-to-code `git diff --check`: **PASS**. Changed paths at the frozen code
  commit were only the new adapter, test and prior plan.

A first boundary scan immediately after dependency installation failed closed
because generated `@econmind/core` build ownership was not yet available. The
canonical Core build was then run; both the subsequent scan and the frozen
code verification scan passed. No source edit was used to suppress it.

## Explicitly not run

Live managed PostgreSQL injection, native PostgreSQL integration, E HTTP route
wiring, F client wiring, connection or role configuration, schema/migration
change, production Supabase access, production rollout, independent security
review, independent package approval and Gate B approval are `NOT_RUN`.
