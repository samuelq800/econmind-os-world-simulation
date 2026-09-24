# V30.2 database permission negative-test preparation

`PREPARATION_ONLY_NOT_GATE_B`

This test-only slice covers the server-held World V2 authorization queries
already present in the current model. It changes no migration, database role,
runtime configuration, browser behavior, or production/shared Supabase state.

## PGlite evidence

`tests/integration/v30-2-db-permission-negative.test.ts` applies the existing
World V2 migrations in a disposable PGlite database and proves that the
server-side read paths do not return a Country or Office projection, or a
durable final receipt, for a wrong subject or another World/Country/Office
scope. It also proves that inactive entitlement/current-authorization rows
deny the corresponding read and that the Worker's SQL transaction-cutoff guard
rejects mismatched or inactive World/Country/Office authorization before an
authoritative transition.

The current-authorization schema has an `active` boolean, but no independent
expiry timestamp. This preparation therefore treats absent or inactive current
evidence as the only supported expired/revoked state. It does not claim that a
capability-specific read grant exists where the API contract currently requires
only an active current authorization at the receipt's durable scope.

## Deliberate limits

PGlite verifies the application/server query guards, not PostgreSQL role or
row-level-security enforcement. Native PostgreSQL role/RLS negative validation
is `NOT_RUN` until a disposable, explicitly non-production database and least-
privilege test roles are supplied. Do not promote this result to an RLS, remote
Supabase, production, or Gate B acceptance claim.
