# Registered Node host candidate

This is an implementation candidate, not a production deployment certificate.
The dedicated entry is `apps/world-api/dist/registered-main.js`. It assembles
fixed source readers, the registered execution clock, one shared consumer,
bounded HTTP read/intake/recovery and derived publication. It does not install
SQL, create identity or control records, initialize a World, start consumption
or advance the Clock. Missing or revoked originals fail closed.

## Build and configuration

Use the repository-pinned Node and pnpm versions, the frozen lockfile and the
same immutable World and companion migration-catalog commits used in acceptance.

```sh
pnpm install --frozen-lockfile
pnpm --filter @econmind/core build
pnpm --filter @econmind/world-worker build
pnpm --filter @econmind/world-api build
ECONMIND_ENV=staging node apps/world-api/dist/registered-main.js /run/econmind/node.json
```

Start with `config/registered-node.example.json`. Replace every placeholder
with the existing admitted World, seed, deployment, country source hashes and
reviewed role bindings. The seed file is mounted separately, limited to 256 MiB,
checked against its exact byte SHA256, then parsed by Core. Neither its hash nor
its opening fingerprint can substitute for database admission. `contentHash`
is the opening fingerprint; it is not the seed-file hash or canonical document
hash. All country selectors must come from the actual adopted source.

Configure these secrets directly in the hosting platform, not in JSON or chat:

- `WORLD_NODE_READ_DATABASE_URL`
- `WORLD_NODE_INTAKE_DATABASE_URL`
- `WORLD_NODE_SOURCE_DATABASE_URL`
- `WORLD_NODE_WORKER_DATABASE_URL`
- `WORLD_NODE_PUBLICATION_DATABASE_URL`

The five bindings require distinct least-privilege login principals. TLS
certificate verification is mandatory; URL `ssl*` overrides are rejected.
Each pool is bounded to two connections. Initial provisioning, role membership
and production publication remain separate reviewed operations. No credentials
or memberships are created by this service.

The reader's explicit actor-registry scope must match this World. Existing
Supabase subjects are mapped to explicitly registered World actor identities;
there is no UUID-derived actor fallback. Seat/capability authorization remains
independently required for each command.

## Startup and operation

HTTP preparation validates the fixed sources before listening. The formal
shared issuer requires an actual current `MANUAL_FINITE` execution registration,
matching World/seed/admission/worker, bounded validity and revocation checks.
Its current simulation time comes from that registration, not wall time or an
operator-provided callback. Transactions hold and recheck the control record.

Default process startup leaves the consumer unstarted. A separately controlled
server integration may call the returned service's explicit `consumer` methods;
there is no public HTTP administrative execution endpoint. These methods retain
the same FIFO consumer and writer lease. Process-level uniqueness supplements,
and does not replace, database writer fencing.

SIGINT/SIGTERM stop HTTP acceptance, drain requests and the shared consumer, and
close owned pools. An unknown COMMIT outcome must be resolved through the
original command's permanent receipt. Never replay a fresh economic command
just because its derived-page publication failed; use derived publication retry.

## Release and recovery requirements

Before production: approve the exact candidate SQL/role package in the companion
repository, rehearse it on a disposable clone with the existing Supabase
Auth/mail/Realtime/Storage/cron configuration, record actual actor/control/source
bindings, and run current-version native and browser acceptance. A successful
build, startup, protocol fixture or historical green CI is insufficient.

Retain the prior deploy artifact, immutable source pins, migration catalog and
database checkpoint. Stop intake and drain before replacing the process. Roll
back application artifacts only after checking compatibility with committed
events; use append-only control/identity revocation when required. Never reset a
World, delete authoritative history or run an automatic down migration.

The current entry assembles Finance, Social, Treasury FX and Captain. Additional
Trade, Industry and Central Bank operation installation and their browser chains
must be separately evidenced; their isolated Core/SQL tests do not imply that
this entry serves every office operation.
