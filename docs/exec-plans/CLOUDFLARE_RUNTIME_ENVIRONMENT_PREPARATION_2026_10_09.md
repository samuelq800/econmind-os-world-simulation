# Cloudflare runtime environment preparation

Owner request: complete the runtime-environment line in the supplied assignment:
host, API, separate Worker, authentication, database connection and lifecycle;
deliver deployable backend and isolated integration evidence without automatic
opening or Clock. Existing user confirmation selects Workers Free. This is not
an instruction to publish schema or write production economic data.

Baseline: `812e8ae95f83c8c8bd6811ccffa21217561ea8cf`, composing delivery branch
955d982 with reviewed merged main/PR118 `3eb6e04`. Other untracked log-usage
reports belong to separate work and must be preserved. Formal current gate remains
V09.1 PLANNED / next_step_ready=false / PENDING; do not award VERIFIED or advance it.

Scope: nonactivated hosting preparation, not V09 admission/execution. Add a
deployable Cloudflare API shell using the already reviewed explicit Office HTTP
adapter with composition=null, and a separate internal-only executor shell.
Health proves only transport liveness; readiness remains503/HOLD. Reuse existing
JWT cryptography, database roles/atomic integration and lifecycle regressions.
No second economic model, new authority, timer/cron, lease acquisition, seed or
production SQL. Existing public source-reader deployment remains separate.

The exact server-only Cloudflare builtin allowance touches the architecture
guard and is therefore treated as P0 for review, even though identity/production
binding stays disabled. Retain IMPLEMENTED_UNVERIFIED and require independent
review of the immutable source before merge or cloud publication. No new
architecture ADR approval is inferred. Preserve all old guard tests and add
positive exact-entry and negative web/Core/other API/Worker/other-module cases.
Owner confirms the formal database is the shared main-repository Supabase;
there is no separate cloud staging database. Local/CI disposable evidence may
proceed under existing ADR18 isolation approval. Production migration/roles and
database binding remain on the main repository's sole publication chain.

Implementation: Cloudflare Node HTTP bridge preserves the existing route's CORS,
body bounds and rejection behavior. Service binding connects API to the HOLD
executor; requests do not carry JWT/cookies to health. Generated Wrangler binding
types are used for platform validation, with pinned isolated CLI and no repository
dependency/lockfile changes. Staging has separate service names; no Hyperdrive ID
or credentials are fabricated. Existing Supabase project's public JWKS was read
without token or SQL: one ES256 key, supported by the reviewed verifier. This is
not actual user-session authentication evidence.

Actual workerd testing exposed an ordinary crypto compatibility defect: native
verify rejected a PublicKeyObject inside options.key, while Node accepted it.
Export the already validated JWK public key to SPKI PEM before verification;
retain all algorithm, curve/modulus, signature, provenance and claims checks.
Workers JWKS transport uses manual redirect handling, with the original loader
still rejecting every non200/redirected/wrong-origin response. Both changes are
P0 identity work and require the same blocking independent review. Preserve the
initial failed workerd receipt alongside the corrected positive/negative runs.

Required evidence: API/Worker builds and strict focused types; meaningful
health/readiness/Office denial/CORS/lifecycle regressions; existing JWT and role
binding regressions; real workerd local two-service smoke, bundle dry-run and
generated types; disposable native PostgreSQL joint evidence; normal lint,
format, boundary, authoritative-pattern, environment, migration and secret checks.
Record actual provider checkout/commands/exit codes, skipped and missing items.
Do not present green fixtures as cloud DB, lawful seats, production deployment,
economic activation or independent review.

Deliver: non-secret runtime-target inventory, operator instructions for isolated
validation and later reviewed publication, reproducible backend artifacts and
actual evidence. Frontend/Core and existing SQL/authorization checks are not
relaxed. No cloud publication is automatic or performed by a teammate without
Cloudflare access.

References: Cloudflare Workers best practices, Node HTTP bridge, Hyperdrive/pg
and Free limits retrieved from official documentation on2026-10-09.
