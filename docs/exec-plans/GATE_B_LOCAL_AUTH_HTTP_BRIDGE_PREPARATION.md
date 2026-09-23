# Gate B local authenticated HTTP bridge preparation

**State:** `PREPARATION_ONLY_NOT_GATE_B_E2E`

**Immutable base:** `2dc1de3fc4b4ea4c5f4792538d961420317912db`

## Bound surface

This slice adds only `apps/world-api` HTTP wiring and focused tests. The
default `world-api` runtime remains health/readiness only. It does not create a
database pool, verify a live JWT, read Supabase, start the Worker, create a
receipt, or change any migration, ledger, Core, Web page or production target.

The explicit local bridge binds only `127.0.0.1`, `localhost` or `::1`, and
only under `ECONMIND_ENV=local|ci`. It rejects `SUPABASE_*` and
`VITE_SUPABASE_*` configuration before binding. Its unconfigured read and
command routes return `503` with `NOT_AVAILABLE`; they do not fall back to a
fixture, cached state, mock receipt or browser identity.

## Server-bound path required for a real two-country/two-Office run

The read route delegates only to the existing authenticated V10 projection
handler, which verifies the JWT before it performs the parameterized
entitlement query.

The narrow Treasury-GCU command route opens only when all of the following
server-owned ports are injected:

1. a cryptographic JWT verifier;
2. a current server scope reader binding the verified `authSubject` to the
   exact World, country and Office named by the command;
3. a current Buyer Finance approval reader binding the exact buyer country,
   proposal and approval reference to Office `FINANCE` with status `APPROVED`;
   and
4. an atomic durable command/idempotency/receipt port returning the stored
   final receipt for an exact retry.

The API retains no command cache. It validates that a returned receipt is a
durable final receipt bound to the requested World, command and idempotency
key, with internally consistent outcome/event/version fields. A missing or
malformed scope, approval or receipt is denial or unavailable evidence, never
an acceptance.

## Current connection matrix

| Path                                                    | Current state                          | Gate B interpretation  |
| ------------------------------------------------------- | -------------------------------------- | ---------------------- |
| Loopback HTTP body/auth/scope/approval/receipt boundary | focused local tests                    | `EVIDENCED_LOCAL_ONLY` |
| Managed PostgreSQL entitlement reader                   | no runtime executor injected           | `NOT_AVAILABLE`        |
| Server JWT verification                                 | no live verifier injected              | `NOT_AVAILABLE`        |
| Two-country/two-Office current membership               | no nonproduction database target bound | `NOT_AVAILABLE`        |
| Buyer Finance current approval                          | no nonproduction approval reader bound | `NOT_AVAILABLE`        |
| Durable command/idempotency/final receipt               | no API receipt port bound              | `NOT_AVAILABLE`        |
| Worker execution, reconnect and browser E2E             | not run                                | `NOT_RUN`              |
| Supabase or production access                           | forbidden                              | `NOT_EXECUTED`         |

The unit tests use injected test doubles solely to prove rejection ordering and
HTTP wiring. They are not receipts, membership evidence, an authenticated
runtime or a Gate B result.
