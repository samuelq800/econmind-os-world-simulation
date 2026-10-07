# E HTTPS authenticated read transport preparation

Status: IMPLEMENTED_UNVERIFIED. Base: `b0cc59647dfc988194f1a2e90b84b0a90281a82d`.

Root requested an isolated, opt-in Node req/res adapter for the existing
`createHttpsAuthenticatedReadComposition` and real server-owned
`HttpsReadCompositionConfig`. This is preparation, not a default mount or a
provider/TLS deployment. Independent review remains required.

## Ownership and bounds

Own only the new route module, new focused loopback test, focused test tsconfig,
and this plan. Do not change composition, runtime startup, exports, browser UI,
other owners' modules, old fixtures, governance status, migrations, or grants.
No production network/SQL, secrets, new authentication protocol, arbitrary
handler callback, economic rules, or authority decisions.

The route returns false without touching nonmatching paths or when unconfigured.
It recognizes the two exact origin-form pinned paths only. HTTPS browser Origins
must match a server-owned exact allowlist; CORS is not seat or TLS evidence.
Authentication remains the existing cryptographic verifier, current seat,
entitlement, admitted seed/head, and before/after binding checks. Host and
forwarded headers never establish those facts. Cookie authentication is absent.

POST accepts bounded UTF-8 JSON only, with body and whole-request deadlines,
bounded response serialization, cancellation forwarded to composition, safe
errors, and no-store headers. OPTIONS allows only POST with Authorization and
Content-Type, never wildcards or credential grants. Existing bound envelopes
remain intact; transport failures have deterministic status/error codes.

## Verification plan

Use pinned Node 24.20.0 and pnpm 12.3.4 with frozen offline dependencies.
Run actual ephemeral loopback HTTP req/res tests (explicit TEST_ONLY fake JWT,
in-memory query rows and invented binding records), plus the existing composition
regression. Check focused types/lint/format, API build and necessary dependencies,
boundary/environment/secrets checks. Loopback is not a real HTTPS/provider,
cryptographic, database/RLS, browser deployment, or Gate B proof.

Freeze commit/tree/base/diff and actual command outputs. Preserve failures and
NOT_RUN evidence. Hand off to Root and stop; do not merge/push this candidate.

## Progress

- Independent clean worktree/branch created at the exact base; frozen offline
  install passed (161 reused, 0 downloaded).
- Owner subsequently permitted safe local main synchronization. Confirmed
  ancestor relation and fast-forwarded only the local main reference to the
  already-merged remote base; no candidate merged or other worktree changed.
- Added only the four owned files. No startup/export/shared/browser change.
  Existing server-owned public/lobby path constants also prevent erroneous pins
  from shadowing those routes. Both paths remain exact; query/absolute/encoded
  variants are NOT_HANDLED. Missing Origin is denied (browser-only transport).
- Final focused suite: 64 real loopback route tests + 34 existing composition
  tests = 98 PASS, 0 FAIL, 0 SKIP. TEST_ONLY fake ports cannot prove production
  signature verification, DB/RLS, seat admission or TLS.
- Final focused types use Bundler/JSX/vite-client declarations because the
  unchanged composition regression imports browser code. Separately the API
  builds under its existing NodeNext config. Types, lint, API build, boundaries,
  authoritative-patterns, environment and repository secrets checks passed.
  Core/Worker dependency builds passed; no full pnpm check or SQL ran.
- Preserve initial failures: first focused run was 81/82, with a test attempting
  to overflow transport after the reader had already rejected its overlarge
  projection. Repaired the fixture to stay inside the reader limit while the
  bound envelope exceeds one MiB (unchanged 502 assertion). Initial types used
  an unsuitable NodeNext/JSX-less test config, then lacked CSS declarations;
  both failures remain recorded. First boundary scan raced the Worker build
  and failed on two unresolved existing Worker exports; after the dependency
  build it passed without editing those sources or changing boundary policy.
- NOT_RUN: real HTTPS/provider deployment, real JWT/JWKS, PostgreSQL/RLS,
  default route mount, UI deployment and end-to-end Gate B. Independent review
  remains pending. Transport responses do not approve economic/seed decisions.

## Response and lifetime contract

Transport failures use sanitized JSON with 400 invalid JSON/request, 401 missing
or malformed Authorization, 403 denied Origin/cookie/preflight/auth, 405 method,
408 incomplete body, 413 oversized body, 415 unsupported MIME/encoding,
502 oversized response and 504 whole-request deadline. Nonmatching paths are
left untouched for the caller's public/lobby/health/404 routing. OPTIONS is 204.
The composition's bound envelope remains intact, including 200 NOT_CONNECTED
and inner result failures, so the existing browser can retire its read lifetime
correctly. No redirect, cookie or credential grant is added.

Body bound is 16 KiB; whole response bound is one MiB, including authority.
Default body deadline is 5 seconds, request deadline 10 seconds; server options
may lower the byte bound and set deadlines no higher than 10 seconds.
Disconnect/timeouts abort the real downstream signal;
compliant provider/DB ports must honor cancellation. Late promises cannot restore
the response. Node host header limits/connection limits, actual TLS and deployment
ownership still belong to the future explicitly authorized mounting host.
