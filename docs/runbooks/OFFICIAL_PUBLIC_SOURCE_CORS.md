# Official public source CORS boundary

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
