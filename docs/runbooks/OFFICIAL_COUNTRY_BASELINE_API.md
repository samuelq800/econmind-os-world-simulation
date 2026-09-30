# Official 70-country baseline — server-side read

This API slice reads the owner-selected `BALANCED_2026_09_28_V1` package from
the immutable `world_v2.country_candidate_bundle` and
`world_v2.country_candidate_artifact` tables. The package's historical
`IMPLEMENTED_UNVERIFIED_CANDIDATE` and `activation_allowed=false` values are
preserved. Owner selection makes these source records the official **input
dataset**, not a live World, executed facility, appointment or OpeningSeed.
The selected record still has `worldId:null`, `openingSeedCommitted:false`, and
`workerStarted:false`. No migration, World state or economic mutation is made
by this API.

## Activation prerequisites

Off by default. Set all of the following only on the server after E's
independently reviewed, published minimal role/RLS grant and a separate login
principal have been verified:

- `WORLD_API_OFFICIAL_COUNTRY_DB_ENABLED=true`
- `WORLD_DATABASE_URL` — PostgreSQL URL for a dedicated non-admin login; remote
  staging/production requires `sslmode=require` or `verify-full`.
- `WORLD_API_DB_LOGIN_ROLE` — exactly the login name in the URL, never an admin,
  browser, anon, authenticated or service role.
- `WORLD_API_DB_READER_ROLE=world_v2_api_reader` — fixed NOLOGIN group role the
  login can explicitly `SET ROLE` to; E owns membership, column grants and RLS.
- `WORLD_DATABASE_FINGERPRINT=world-v2-<ECONMIND_ENV>`; the optional namespace
  must be `world_v2` and optional mutation mode must be `disabled`.

The API opens a bounded PostgreSQL pool (four connections, three-second connect
timeout, five-second statement timeout) and runs only one fixed parameterized
SELECT under `BEGIN READ ONLY` and `SET LOCAL ROLE world_v2_api_reader`.
Query failures roll back and release the client; shutdown closes the pool.
Credentials, raw database errors and raw source bytes are never logged.
The config parser fails before listen for partial, mismatched, privileged or
non-TLS remote configuration. Disabled mode keeps existing `/healthz`,
`/readyz` and 404 behavior. Enabling before E's role grant/import exists will
yield `503` readiness/source responses, not a fabricated connected state.

## HTTP contract

- `GET /v1/world-data/countries`: 70 `{id,name,number,population}` records.
- `GET /v1/world-data/countries/visual-territory-NN`: one exact
  `data/countries.json` source record, not the derived UI scene/detail JSON.
- Both include `schemaVersion=official-country-baseline-v1`,
  `dataNature=OFFICIAL_SELECTED_SOURCE_DATASET`, package ID, CHECKSUMS SHA-256,
  countries-file SHA-256, source path, selected unit labels,
  `proposalFieldsAreExecuted=false`, and `liveWorldState=false`.
- Only `GET`/`HEAD` and exact paths; no query/body/World ID/SQL input. Static
  error codes only; `no-store`; no direct browser access to `world_v2`.
- `/readyz` verifies actual selected database bytes, hash, exact 70 IDs and
  population. `/healthz` remains process liveness and reports readiness false
  until the database probe succeeds. A ready API still does **not** imply
  OpeningSeed, player assignments or simulation activation.

Running-state `read_projection` is a separate, already defined entitlement
model. It is not exposed by these public baseline routes. There is no World ID,
WorldVersion, EventSequence or verified production JWT binding in this slice;
clients must not infer one. The existing local-only bridge is unchanged. The
current UI may retain its visibly static selected-data fallback until this
backend is published and independently verified. No arbitrary CORS grant is
added by this API.

## Evidence boundary

Local tests inject a SQL pool and use the frozen source bytes to check the
fixed query, role transaction, hash, 70-country roster, HTTP behavior,
readiness, failures and shutdown. They are not evidence of production API
credentials, deployed role/RLS, authenticated World projection or browser
integration. Record these separately as `NOT_RUN` until E's release and a
real controlled readback have completed.
