# Bounded office read deployment

The existing Cloudflare API target is recorded in
`config/cloudflare/world-runtime-targets.json`. That inventory describes the
previous HOLD deployment; verify its current version before any publication.
The cloud development executor is not the production host.

Prepare and validate the complete scenario offline with `pnpm genesis:prepare`.
Full-source validation and controlled projection publication may read the entire
canonical seed. Online requests use the versioned country/office pages and
admission headers in `database/proposals/postwar-office-derived-read.sql`;
they must not load or parse the entire canonical payload.

Candidate database changes remain unregistered proposals. Publish them only
through the main repository's reviewed migration chain and approved role grants.
The online reader receives bounded page/header access, not `canonical_payload`
access or membership in the offline source reader. Keep RLS and the immutable
source/admission triggers enabled. Full source data and derived pages must share
an exact seed fingerprint, signed admission, source identity and H0 version.

The server configuration template is
`config/cloudflare/postwar-read.server.example.json`. Replace all placeholders
with the reviewed deployment's actual roles, world, seed and admission. The
placeholder content hash is deliberately invalid. The public Supabase issuer
comes from the existing target inventory; verify it for the release.

The explicit runtime configuration consists of:

- `RUNTIME_MODE=ADMITTED_READ_ONLY`.
- `POSTWAR_READ_CONFIGURATION_JSON`: the reviewed template's JSON, without secrets.
- `POSTWAR_READER`: the existing approved server-side database/Hyperdrive binding.

No code obtains these credentials or provisions a binding. New credentials,
production role grants or additional persistent access require specific approval.
Keep database query caching disabled for these authorization-sensitive reads.
Without valid configuration the authenticated endpoints return `NOT_CONNECTED`.

The fixed authenticated endpoints are `POST /v1/current-seat` and
`POST /v1/postwar-office-runtime`. The latter accepts an office selector and
bounded dataset/page request. Country, organization, actor revision, admission
and source version come from the verified server context. Invalid authority,
unpublished data and stale versions are errors, not empty success results.

Before publication, retain the exact previous Worker version and test the final
commit's real header, page, revocation, cross-country/office, restart and browser
readback paths. Record maximum page bytes, query time and Worker memory. A
successful offline seed check does not prove an online memory or latency budget.
A ready page reader does not enable simulation, Clock or authoritative commands.

The isolated PostgreSQL 16.15 acceptance used the complete `c4275759...` seed,
an actually verified ephemeral TEST_ONLY admission, and a sealed derived
template. COUNTRY_01 has 16 datasets across six offices; COUNTRY_02 provides
an additional Social isolation case. This is not a 70-country production
acceptance. The final reader role has only bounded function execution: direct
canonical seed, derived table and aggregate reads are denied. Maximum observed
page response was 17,920 bytes. Native request timings and heap deltas are
development observations, not a measured Cloudflare peak-memory guarantee.

Actual JWT/HTTP/browser checks cover current seat, true empty offers, source
and authorization pagination versions, revocation, cancellation cleanup and
H0-only semantics. A head above H0 returns replay unavailable. No test key is
an Owner signature. Complete field/action acceptance remains separate from
these 16 read datasets: the catalog contains 120 modules and legacy local
policy saves are not authoritative writes.

Publish only the reviewed exact candidate through the existing deployment owner.
Roll back using the retained Worker version and keep canonical events/admissions
intact. Revoke a derived read publication through its controlled revocation path;
do not reset an initialized world or replace its opening seed.
