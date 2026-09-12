# World API Supabase Read Preparation Candidate

## Boundary

```text
base = 8da085184bf063b61ba53c10537c6a797018072b
code target = da022fd1289893e68586b9bb9aa77502abc1fe8a
remote Supabase probe = NOT_RUN
remote DDL = NOT_RUN
shared production project access = false
main-site change = false
deployment state = PREPARATION_ONLY_NOT_CONNECTED
```

This is implementation and test evidence for an isolated read-integration
candidate. It is not an independent review, deployment approval, migration
promotion, V09.2/V09.3 completion claim, or production status change.

## Existing path located

- The World repository has no runtime Supabase client dependency or existing
  table/RPC adapter. The API currently exports only its inert foundation status;
  the Web app renders a static foundation screen and does not consume World
  data.
- Environment policy recognizes public Supabase configuration names while
  rejecting secret/service-role material from public runtime paths. No key or
  project value is committed in `.env.example`.
- The authoritative database chain is the `world_v2` manifest and immutable SQL
  artifacts. Existing `0001`-`0006` migrations cover the namespace,
  Command/Event ledgers, receipts/outbox integrity, and writer lease lineage.
- Generated read-model types did not previously exist. The candidate adds a
  schema-first generator rather than introducing a second database authority.

## Candidate slice

- Versioned request/response envelopes and strict DTO validation for projection,
  watermark, command-receipt, and event evidence.
- A distinct external Supabase auth-subject UUID type and a pure post-signature
  JWT claims validator. Signature verification remains injected; this code does
  not trust or decode an unverified token as identity.
- Offline, fixture, and loopback-only mock transports with bounded payloads,
  cancellation, timeout, retry limits, and stable error classification. No
  production HTTP transport or credential-loading path is added.
- A schema-first `world_v2` read projection and entitlement preparation artifact
  with forced RLS. PUBLIC, `anon`, and `authenticated` retain no schema/table
  grants, so local rehearsal cannot accidentally turn the publishable role into
  runtime authority.

## Public capability probe

The supplied project URL identifies the shared production project and is not an
authorized staging runner surface. A publishable key was not available through
the approved runtime environment in this worktree. Therefore no network request
was made and no claim is made about live tables, RPCs, schemas, grants, or RLS.

The only permission result established here is local and candidate-specific:
after applying the prepared SQL to disposable PGlite databases, the proposed
read tables exist with RLS enabled and forced, while PUBLIC, `anon`, and
`authenticated` are granted no access.

## Verification

| Check                                        | Result                                               |
| -------------------------------------------- | ---------------------------------------------------- |
| Focused API/migration tests                  | PASS - 2 files, 12 tests                             |
| Representative single-worker regression      | PASS - 3 files, 137 tests                            |
| Complete single-worker Vitest regression     | PASS - 45 files, 511 tests; 1 file / 3 tests skipped |
| API and repository TypeScript checks         | PASS                                                 |
| Focused lint and formatting                  | PASS                                                 |
| Generated read-model type check              | PASS                                                 |
| Migration provenance validation              | PASS - 7 artifacts                                   |
| Clean-baseline and existing-schema rehearsal | PASS - 7 release rows each; ephemeral PGlite only    |
| Environment and foundation policy            | PASS                                                 |
| Repository secret scan                       | PASS - 567 files                                     |
| Workspace build                              | PASS                                                 |

The first default-parallel full-suite attempt is preserved as a failed execution
environment run: 46 workers caused broad timeouts, and child tests hit a
shebang-less Corepack cache entry with `spawn ENOEXEC`. Re-running the affected
representative tests and then Vitest with one worker and an executable pnpm shim
passed. This record does not erase or misclassify the initial failure.

## Required forward integration step

`0007_world_v2_read_projection_boundary.sql` is a preparation-only artifact.
Canonical migration number `0007` is reserved for the V09.2 sequence owned by
the mainline. Before this candidate can become deployable, it must be renumbered
after the V09.2/V09.3 order is fixed, committed as new bytes, rebound in the
manifest to a new source commit and SHA-256, revalidated, and independently
reviewed. The current artifact must not be applied or promoted under `0007`.

No Supabase project was linked, queried, or mutated while producing this
candidate. No key, JWT, database URL, or service-role value is present in the
candidate or this report.
