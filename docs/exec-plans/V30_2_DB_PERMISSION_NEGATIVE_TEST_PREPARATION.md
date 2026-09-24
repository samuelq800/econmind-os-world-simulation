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
has an isolated GitHub Actions candidate at
`.github/workflows/v30-2-postgres-permission-negatives.yml`. It creates only
disposable least-privilege test roles on the PG16 service, verifies real grants
and RLS behavior for supplied claims, and cleans the schema and roles on exit.

The native candidate passed at frozen SHA
`8b082e1b3347aa77408f3521bf9976b04283e00d` in
[Actions run 35969032516](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/35969032516): migration validation, Core build, and all three
native role/grant/RLS negatives passed. The prior run at `d4ed05a` is not
evidence because its shared disposable-PostgreSQL URL guard allowed `pg` query
parameter target overrides; the fixed SHA is the first valid native result.

This isolated result does not prove production role provisioning or a verified
JWT-to-`request.jwt.claim.sub` propagation mechanism: migrations do not create
deployment roles, and PostgreSQL custom settings must be populated by a trusted
API gateway. Current receipt recovery requires any active current authorization
at the durable scope; it has no separate capability-specific receipt-read
grant. Those deployment/claim and capability semantics remain `MISSING` for
Gate B until independently specified and verified. Do not promote this result
to a remote Supabase, production, or Gate B acceptance claim.
