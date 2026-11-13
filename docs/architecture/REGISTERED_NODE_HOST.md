# Registered Node host candidate

This is an implementation candidate, not a production deployment certificate.
The dedicated entry is `apps/world-api/dist/registered-main.js`. It assembles
fixed source readers, the registered execution clock, one shared consumer,
bounded HTTP read/intake/recovery and derived publication. It does not install
SQL, create identity or control records, initialize a World or advance the
Clock. Default startup does not consume. Missing or revoked originals fail closed.

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
server integration may call the returned service's `consumer.consumeOnce()` for
one finite step. Formal consumers remain `PREPARED` between such steps and
recheck the real execution registration on every call. `startPreparation()` is
a local/CI activation API and is deliberately rejected by formal consumers;
do not invoke it to start a registered host. There is no public HTTP
administrative execution endpoint. These methods retain
the same FIFO consumer and writer lease. Process-level uniqueness supplements,
and does not replace, database writer fencing.

An operator may explicitly append `--consume N` to the registered entry for one
finite batch of 1–1000 steps on that same consumer. It stops at an idle queue or
the requested limit; it never starts a background polling loop. Each step still
requires the current `MANUAL_FINITE` registration and lease. BLOCKED, FAILED,
unknown outcomes and unavailable derived publication stop the host through its
existing graceful shutdown. Resolve the original FINAL/derived publication
before restarting; this option never submits a replacement command. Ordinary
HTTP startup, source publication and Clock remain separate operations.

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

The entry assembles Finance, Social, Treasury FX and Captain. Optional fixed
`install: { "centralBankOmo": true, "trade": true }` configuration also installs
Central Bank OMO and narrow Treasury-GCU Trade borrowers on that same consumer.
Omitting this object leaves these two families uninstalled. Installation grants
no source or command authority: the existing admitted securities, quotations,
trade originals, three-party approvals and exact role bindings are still
required. No security, quote, route, mandate or opening balance is synthesized.
The Central Bank country set is the explicit `countries` list, with no default
country fallback. Automatic Trade shipment/delivery uses the same global FIFO;
it is not a user-submit command family or a second consumer.

Industry installation and actual browser/real-database operation chains remain
separate acceptance requirements. Protocol routing tests or isolated Core/SQL
tests do not establish that every office operation is connected.

### Industry task publication

When `install.industry` is enabled, the host also requires
`WORLD_NODE_INDUSTRY_PUBLICATION_DATABASE_URL`, configured directly in the
platform secret store. It must use a distinct, reviewed Industry publisher
principal; the host does not create credentials, grant membership, or reuse the
read/worker/current-projection publisher principal. Its pool has the same TLS
verification, two-connection maximum, timeouts and joined shutdown as the other
pools. Without Industry installation the binding is neither read nor opened.

`publishDueIndustryWork({countryId, facilityId, runId})` is an explicit finite
server operation on the issued shared connection. It derives work from the
actual committed schedule, current employees, existing bookings and registered
server clock, then queues one canonical automatic command. It recovers an
existing publication first. It does not start Clock, start a consumer loop or
turn a schedule into completed work. The same FIFO consumer and atomic cutoff
execute the queued command. Deployment still requires the selected SQL, role
enrollment review and actual source publication; a configured URL is not proof
of readiness.

`publishIndustryDueWage({countryId, facilityId, runId})` uses the same separate
Industry publisher binding for an explicit finite task based on actual committed
WORK. It accepts no amount, actor override or caller clock. Wage settlement uses
the shared FIFO and fixed current-source cutoff; scheduling a wage task does not
prove payment or production. Existing publication/FINAL recovery precedes new
issuance. These task issuers are server methods, not browser command families.

### First-day Industry utility installation

`install.industryUtilities: true` explicitly selects the adopted first-day
POWER, WATER and internal LOGISTICS connections and requires `install.industry:
true`. Existing configurations that omit the flag keep their previous behavior.
The example selects all office families; its placeholder pins must still be
replaced with the actual reviewed bindings. Enabling a flag does not install
SQL, register originals, grant roles, publish service orders or start consumption.
Only existing admitted, country-scoped sources and actually recorded labour,
payment and resource movements may produce a delivery. The source adapter takes
its opening calendar from the immutable opening evidence, never the server's
wall clock or a new user-supplied date.
