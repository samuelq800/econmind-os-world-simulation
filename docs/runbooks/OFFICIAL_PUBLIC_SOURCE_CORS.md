# Official public source CORS boundary

## Selected-source snapshot Edge publication

The deployable `supabase/functions/world-v2-official-read/index.ts` candidate
uses a fixed allowlist: `https://samuelq800.github.io` and
`https://world.econmind.group`. These are exact HTTPS origins, with no wildcard,
HTTP alias, opaque `null` origin, suffix match, credentials or arbitrary Origin
reflection. Existing GET/HEAD and Accept-only OPTIONS semantics are retained.
This code change requires independent review and an authorized Edge release;
it does not itself alter the deployed function or Pages settings.

Pages must be opened over HTTPS. The provider's HTTP page URL or a redirect to
HTTP cannot use this CORS allowance. Enforcing HTTPS is a separate Pages
configuration action for the release owner, not an automatic code operation.
For a custom domain mounted at `/`, the existing
`WORLD_WEB_PUBLIC_BASE_PATH` variable must be `/`; an absent value in GitHub
Actions defaults to `/econmind-os-world-simulation/`, which is the project-site
path rather than the custom-domain root. Verify the actual root asset URLs
and six-role entry links after an authorized Pages build.

The existing public `WORLD_OFFICIAL_READ_BASE_URL` variable must contain
`https://vimksjrhaxdpnkvgsavz.supabase.co/functions/v1/world-v2-official-read/`.
Do not append `/v1/world-data`: the build injector validates the function root,
and the browser reader appends the selected-source route. Setting a variable
does not trigger a build. The existing `deploy-world-web.yml` workflow builds
and deploys on manual dispatch or a qualifying main push. Both variable changes
and dispatch require separate release authorization.

The transport remains `HASH_PINNED_IMMUTABLE_SOURCE_SNAPSHOT`, with
`liveWorldState: false`, unexecuted proposal fields and browser reads using
`credentials: 'omit'`. A verified source catalogue/country/field does not
establish a runtime, executed decision, worker or economic settlement.

## Separate database-backed API configuration

`WORLD_API_OFFICIAL_PUBLIC_ORIGINS` is an optional, comma-separated list of
exact canonical browser origins. It is absent by default; absent means no
cross-origin headers or preflight capability. At most eight origins are allowed.
Production/staging require HTTPS. Local/CI may also use HTTP only for loopback.
Wildcards, `null`, paths, credentials, queries, fragments, duplicates and
non-canonical spellings fail startup configuration validation.

The currently verified GitHub Pages browser origin is
`https://samuelq800.github.io` (the Pages URL is under its
`/econmind-os-world-simulation/` path; a CORS origin never includes that path).
This value may be set explicitly at a future API deployment; it is not
hard-coded or activated by this patch. No production API host/base URL has yet
been verified. Browser `VITE_WORLD_API_URL` or `VITE_WORLD_API_BASE_URL` must
remain unset until an actual deployed API endpoint is known and checked.

When configured, CORS applies only to enabled, public, selected-source routes:
`/v1/world-data/countries`, `/v1/world-data/datasets` and
`/v1/world-data/map-assets`, including their existing country/dataset detail
routes. It allows exact-origin `GET`/`HEAD` responses and matching `OPTIONS`
preflight for `GET`/`HEAD`, with no requested header or only `Accept`.
Responses vary by `Origin`; preflight also varies by requested method/headers.
There is no wildcard, `Access-Control-Allow-Credentials`, authorization header,
POST/Command, private Season 1, health/readiness or arbitrary-path expansion.
Disallowed origins have no allow-origin response header; invalid preflights
return 403. Without an `Origin`, ordinary GET/HEAD and existing OPTIONS 405
behavior remain intact.

CORS is browser access control, not database authorization. Enabling it does
not enable the official DB flags, publish migration 0021, create an OpeningSeed,
serve map binaries, or prove that a real API host or page-to-API connection
exists. E must supply a reviewed dedicated reader/grant and real DB readback;
D must bind an independently verified API URL and public asset URLs. A real
cross-origin browser check is required after those deployment facts exist.
