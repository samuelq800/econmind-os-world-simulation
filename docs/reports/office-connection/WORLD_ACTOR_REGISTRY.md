# World actor registry candidate

The existing shared identity whitelist contains `user_id`, `display_name` and
`school_id`. It does not define a World actor. The inspected main-site V1 SQL
local variable `actor_id := auth.uid()` is V1 audit context and cannot provide
this V2 mapping. A previous command's stored actor is also not a new user's
current identity authority.

The new candidate proposal is
`database/proposals/world-actor-identity-registry.sql`. It installs no records,
memberships, credentials or production configuration. It depends only on
`world_v2.world_head`. Its independent NOLOGIN roles are
`world_v2_actor_registry_owner`, `world_v2_actor_registry_reader` and
`world_v2_actor_registry_publisher`. Reader and publisher have fixed EXECUTE
only and no table SELECT/DML. The owner is not a runtime role. Role profile
checks reject privileged callers and reader/publisher overlap.

Publishing an explicit binding requires World, verified Auth subject, actual
existing actor ID, immutable binding reference and original issuer/reference
hash. The publisher must separately register the exact runtime reader database
role's World scope. This is an explicit server release configuration, not a
browser action, group-wide World grant or UUID-derived default actor.
Issuer/hash fields retain provenance; they do not themselves prove approval.
The operator must have the actual identity original before publishing.

Binding, scope and revocation facts are append-only. Active subject and actor
must each be unique within the World. The publication functions require a
SERIALIZABLE read-write transaction plus a World-local configuration advisory
lock, so a pre-existing repeatable-read snapshot cannot bypass uniqueness.
Unknown commit outcomes must be resolved by the original immutable reference;
conflicting reuse rejects. Retrying a revoked original does not reactivate it;
an explicit new binding/scope reference is required. PostgreSQL concurrency
across separate backends is not established by the embedded tests.

Server integration:

```ts
const actor = createPostgresWorldActorResolver({
  pool: configuredActorReaderPool,
  worldId: configuredWorldId,
  readerRole: configuredActorReaderRole,
});
// Existing API JWT verification remains the only subject input boundary.
const resolveActorId = actor.resolveActorId;
```

The factory opens a fresh repeatable-read READ ONLY transaction per call,
validates the real role/profile and stable transaction identity, and invokes
only `read_world_actor_binding(text,uuid)`. SQL independently checks the exact
configured role's active World scope and subject consistency. Missing bindings
return null; missing schema, permissions, role/scope mismatch and DB failures
throw. Nothing maps an unknown user to a fabricated actor or converts a database
failure into a valid null identity. The pool is borrowed and every acquired
client is released, with original and cleanup failures preserved.

The optional release helpers publish/revoke through four fixed functions using
an actual controlled publisher executor; they accept no arbitrary SQL or READY
callback. Runtime has no such publisher authority. No actor cache is used.
Existing current Office/team/capability, source, lease/head and commit cutoff
checks remain mandatory. This registry is identity data, not a replacement
for those checks; integrating a fixed resolver does not itself prove every
command's existing identity-revalidation lifecycle.

Focused local verification:

```sh
pnpm exec vitest run tests/world-api/world-actor-identity-registry.test.ts
```

The test uses a tiny isolated PGlite schema and explicit TEST_ONLY identities.
It verifies actual SQL installation, role profiles/ACLs, fixed resolver reads,
uniqueness, cross-World denial, revocation/idempotency, append-only history and
resource cleanup. It does not admit a seed, execute economics, install into
production, create any actual user mapping or claim native PostgreSQL acceptance.

Recovery for a committed installation preserves identity history and uses a
reviewed forward fix after stopping dependent consumers. Do not destroy history
or automatically retry an unknown publication outcome.
