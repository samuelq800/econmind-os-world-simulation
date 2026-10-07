# G PostgreSQL server read-binding facts preparation

Status: IMPLEMENTED_UNVERIFIED; source-only candidate pending independent review.
Fixed base: `b0cc59647dfc988194f1a2e90b84b0a90281a82d`;
base tree: `c8e9871d3ab45d06c424faaeb962fc9c73bb559a`.
Branch: `codex/g-postgres-server-read-binding`.

This bounded preparation reads existing server facts and validates persisted
opening lineage. It does not implement the full `ServerReadBindingPort`, mint an
admission, or wire production startup. Its sole factory returns
`inspectExistingFacts`, with no permanently-null `resolve` facade. The current
schema has no persisted seat identity or admitted-opening decision sufficient
for the full contract. Returning facts is not authorization to expose them to
HTTP or to assemble an admitted-seat DTO.

## Existing SQL and contract field matrix

| Contract fact                         | Actual source at the fixed base                                                                                                                 | Reader result / remaining decision                                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verified subject                      | Cryptographically verified caller input; `identity.ts` canonical UUID parser; SQL `auth_subject` equality and transaction-local JWT subject GUC | Exact match required; this module does not verify a JWT                                                                                                    |
| World/country/office/current revision | `0011` current_commit_authorization, active row and authorization_version                                                                       | Persisted scope and revision; distinct conflicting offices/revisions deny                                                                                  |
| Current projection entitlement        | `0013` projection_entitlement joined on same world/subject/revision, active and not revoked                                                     | Exact COUNTRY or OFFICE_PRIVATE scope; SQL office scope encoding matches existing Worker publisher                                                         |
| FINAL original scope                  | `0002` command_submission joined by verified subject/world/exact command/idempotency, then same original country/office current authorization   | No substitute Office; original command fingerprint returned; no offer expiry or economic writes                                                            |
| Seed ref/content hash                 | `0016` opening_seed.seed_id/seed_fingerprint/canonical_payload                                                                                  | Canonical intent, Core parser, hash and replay binding verified; TEST_FIXTURE provenance rejected                                                          |
| modelVersion                          | Existing immutable opening seed replay_binding.modelVersion                                                                                     | Available after canonical and fingerprint validation; no new column needed                                                                                 |
| projectionVersion                     | Existing read_projection.schema_version = world-projection-read-v1                                                                              | Returned as projectionSchemaVersion; adopting this wire schema as the full DTO projectionVersion needs explicit contract semantics, not a same-name column |
| Head WorldVersion/EventSequence       | `0002` world_head                                                                                                                               | Actual persisted tuple; projection watermark may not exceed either head component                                                                          |
| readbackRef                           | Existing head plus immutable authoritative transition/event identity may support a semantic mapping                                             | No invented hash, timestamp or config ref; owner must approve exact stable identity mapping and its bootstrap case before full provider                    |
| seatRef/seatState                     | Active office facts exist; no durable unique seat identifier in current_commit_authorization                                                    | Actual seatRef authority MISSING; an office/team tuple is not silently promoted to a seat ID                                                               |
| seed.admissionRef                     | Candidate-only immutable opening lineage and source-candidate status exist                                                                      | Actual admission authority MISSING; bootstrap/source selection is not admission                                                                            |

The earlier four-field schema-gap hypothesis was narrowed: modelVersion is
available, projectionVersion is a semantic mapping question, and readbackRef
needs an existing identity mapping assessment. Only seatRef and
seed.admissionRef are declared missing persisted authority by this module.

## SQL and resource behavior

Fixed parameterized read queries execute inside one managed pool transaction:
`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, actual role inspection,
transaction-local `request.jwt.claim.sub`, transaction-local 10-second statement
timeout, current scope query, immutable opening/head query, commit. A coherent
snapshot avoids combining independently observed revisions and watermarks.
Missing, revoked, ambiguous, mismatched or malformed facts return null.
Permission/query failures become UPSTREAM_UNAVAILABLE without exposing DB error
contents. Errors roll back; rollback failure destroys the client. Cancellation
before connect avoids acquisition; late acquisition and in-flight cancellation
destroy the client rather than returning it to the pool with pending work.
Cleanup releases exactly once. No pool, DSN, credentials or roles are created.

The caller must inject a separately provisioned runtime read pool and explicit
role name. Actual `current_user` must match that role and have neither SUPERUSER
nor BYPASSRLS. Service-role and standard privileged/browser role names are
rejected. No SET ROLE, service-role fallback or security-definer function exists
in the reader. Existing `local-trusted-postgres-binding.ts` fixed-query executor
cannot accept these new queries; this module reuses its verified-subject/GUC
transaction mechanism without widening its allowlist or changing that file.

## Minimal source-only schema/role proposal

These are proposals, not migrations or approval records. Production publication
and credential provisioning remain NOT_RUN and unauthorized by this preparation.

1. Persist a server-owned durable seat identity tied to verified subject,
   world/country/office and current authorization revision, with uniqueness,
   revocation and reassignment semantics. Preserve capability rows separately;
   capabilities do not create multiple seats. Approve who publishes this fact.
2. Persist an immutable admission decision/reference tying the exact world,
   seed ID/fingerprint and model/replay binding to its reviewed admission.
   Absence denies the full provider. Source-candidate activation and bootstrap
   must never auto-create this decision.
3. Adopt explicit projectionVersion and immutable readbackRef mappings from
   existing contracts/history if adequate. Assess the zero-history bootstrap
   case. Add storage only if those existing semantics cannot satisfy the DTO.
4. Provision a dedicated runtime read role and login separately from
   `world_v2_api_reader` / `world_v2_api_login`. Do not expand the official-source
   reader's privileges. Reader/login require NOSUPERUSER, NOBYPASSRLS, no writer
   membership, no economic DML/DDL or authoritative mutation-function rights.
   Grant schema USAGE and only SELECT on columns used by these fixed queries:
   current_commit_authorization(world_id, auth_subject, country_id, office_id,
   authorization_version, active); projection_entitlement(world_id, auth_subject,
   classification, scope_key, authorization_version, active, revoked_at);
   read_projection(world_id, classification, scope_key, schema_version,
   world_version, event_sequence); command_submission(world_id, auth_subject,
   country_id, office_id, command_id, idempotency_key, command_fingerprint);
   opening_seed(world_id, seed_id, opening_world_version, replay_binding,
   canonical_payload, seed_fingerprint); world_head(world_id, world_version,
   event_sequence). Do not grant projection payload or unrelated economic tables.
5. Review explicit subject-scoped runtime SELECT policies for opening_seed and
   other runtime facts. Existing seed FORCE RLS has no SELECT policy. Retain
   existing entitlement/projection FORCE RLS and transaction GUC subject
   predicates. A future full provider must additionally enforce actual admitted
   seat authority, and real PostgreSQL role/grant/RLS evidence must precede use.

## Focused verification and limitations

The new test uses five unchanged actual migration artifacts in fresh in-memory
PGlite fixtures. A synthetic non-bypass role and seed SELECT policy exist only
inside the offline fixture. They are not delivered migrations, real credentials,
World admission, or evidence that production read permissions exist. Tests
exercise current/revoked/revision-mismatched entitlement, scope ambiguity,
original FINAL office retention, seed provenance and fingerprint validation,
permission/policy absence, read-only behavior, role rejection, cancellation and
rollback/release. Related existing read-composition regressions are retained.

Actual command outputs, exit codes, candidate SHA/tree, four-path diff and hashes
are frozen outside the checkout in
`artifacts/G_POSTGRES_SERVER_READ_BINDING_2026_10_07` after checks.
Real PostgreSQL integration/concurrency: NOT_RUN.
Production role/RLS publication, JWT network, HTTP, WorkerClock, economics,
production mutation, deployment, runtime activation, independent approval and
Gate B: NOT_RUN. Full provider completeness: MISSING persisted seat/admission
and pending approved projection/readback semantic mappings.

Scope is exactly the new API module, focused test, focused TypeScript config
and this plan. No old file, migration, barrel/export, status, default startup,
C JWKS verifier, F SQL or A economics is changed. After freezing ordinary narrow
verification evidence and handoff to Root, STOP.
