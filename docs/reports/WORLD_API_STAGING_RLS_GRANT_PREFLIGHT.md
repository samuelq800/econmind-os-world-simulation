# World API Read Boundary: Staging RLS/Grant Preflight

## Status and boundary

```text
STATUS=STAGING_ONLY_NOT_EXECUTED
PRODUCTION_MUTATION=false
SHARED_SUPABASE_ACCESS=false
DATABASE_WRITE_ACCESS_REQUIRED=false
SERVICE_ROLE_CREDENTIAL_ALLOWED=false
```

This is a future non-production test plan for the server-side World-read
boundary. It neither defines a production route nor authorizes a migration,
table creation, grant change, deployment, seed, reset, or direct SQL against a
shared Supabase project.

## Required preconditions

- An independently reviewed, immutable server candidate exposes the verified
  JWT read boundary; this candidate currently exposes no read route.
- The target is an isolated non-production staging project, with its URL and
  issuer/audience configuration verified by the release owner.
- Test JWTs are ordinary authenticated-user tokens for disposable staging
  subjects. Never provide service-role, database, or production credentials to
  the harness.
- The read connection role has only the minimum read permissions required for
  `world_v2.read_projection` and `world_v2.projection_entitlement`; it has no
  `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, DDL, or RPC mutation privilege.
- RLS and grants are deployed through the approved migration chain, not from
  this plan. The exact schema/migration provenance is bound at release time.

## Negative test matrix

| Case | Request identity/state | Expected outcome |
| --- | --- | --- |
| Missing bearer | No `Authorization` header | Authentication failure; no projection query |
| Invalid bearer | Bad signature, issuer, audience, `exp`, or `iat` | Authentication failure; no projection query |
| No entitlement | Valid subject without an entitlement row | No projection result; no scope disclosure |
| Cross-country | Valid subject requests another country scope | No projection result |
| Cross-office | Valid subject requests another office-private scope | No projection result |
| Revoked entitlement | Matching entitlement has `revoked_at` | No projection result |
| Inactive entitlement | Matching entitlement has `active = false` | No projection result |
| Malformed/oversized input | Invalid envelope or request above 16 KiB | Protocol failure before database execution |
| Oversized projection | Entitled row exceeds one MiB serialized response | Protocol failure; response is not emitted |
| Upstream interruption | Query cancellation, deadline, or read failure | `CANCELLED`/`TIMEOUT`/redacted upstream failure; no server retry |

## Execution constraints

Run only through the future server HTTP boundary with disposable staging
identities. Do not query the database directly as a privileged role to claim
that an HTTP authorization decision passed. Record request class, HTTP/result
code, candidate SHA, resolved non-production target identity, and read-only
grant evidence. Redact all tokens, URLs containing credentials, and database
errors.

The local prerequisites for that future run are the focused API tests below;
they do not contact Supabase:

```sh
pnpm --filter @econmind/world-api typecheck
pnpm exec vitest run tests/integration/world-api-authenticated-read-boundary.test.ts tests/integration/world-api-transport-boundary.test.ts tests/integration/world-api-postgres-read-adapter.test.ts
```
