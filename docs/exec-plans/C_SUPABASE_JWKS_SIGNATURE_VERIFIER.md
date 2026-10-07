# C Supabase JWKS signature verifier

## Authority / ownership

Fixed base b0cc59647dfc988194f1a2e90b84b0a90281a82d. Isolated branch codex/c-supabase-jwks-verifier. Root explicitly authorized this non-activated missing authentication component, not another local runtime demo or production call. P0 identity boundary: IMPLEMENTED_UNVERIFIED pending independent immutable review. Formal V09.1/V30.3 remain PLANNED; no gate/status changes.

C owns only new apps/world-api/src/integration/supabase-jwks-signature-verifier.ts, focused test/config and this plan. G owns DB read binding; A/B own other work. Do not modify identity.ts, shared exports/defaults, DB/UI/lockfile or other owners' paths. No new dependency: Node 24.20.0 built-in crypto performs signature verification, not a handwritten cryptographic algorithm.

## Fixed interface / security

createSupabaseJwksSignatureVerifier requires server projectRef, expectedIssuer and jwksUrl. Exact 20-letter Supabase project host and /auth/v1 + /.well-known/jwks.json equality are required; HTTP, redirects, custom domains, alternate paths/projects, credentials/query/fragment and token URL selection are unsupported. No default project, environment/secret lookup, HS secret or Auth-server fallback.

Direct injection into existing verifier fields is structural. Header permits only typ JWT, ES256/RS256 and bounded kid. JWK requires matching kid/alg/key family, P-256 or RSA 2048–4096, affirmative verify/signature purpose and no contradictory/private/remote-key fields. Duplicate kid fails. Canonical base64url/UTF-8 JSON objects and exact signature widths. RSA PKCS1 + SHA256 / EC P1363 + SHA256 use Node crypto. Token claims decode only after cryptographic success; issuer must match the fixed server project. Existing verifySupabaseJwtClaims separately validates issuer/audience/sub/iat/exp/current server time. Raw role/metadata is never interpreted as a seat, authorization revision or economic grant.

Limits: 8 KiB JWT, 1 KiB header, 64 KiB streamed JWKS, 8 keys and 64 concurrent load waiters. Fixed 5-second fetch-plus-body deadline; redirect error and exact final URL, status/media type/declared and observed byte bounds. Native fetch may decompress while retaining encoded Content-Length: declared and observed sizes are capped independently, never compared as equal or used to skip the stream cap. No token or key in request/log/error; public JWKS GET has no bearer/apikey/cookie and no credentials.

Per-instance monotonic cache expires 5 minutes after fetch, not last use. Expired/failed refresh never serves stale keys. Cache misses and unknown kid use one single-flight load, minimum 30-second interval including failed attempts; unknown kid can cause at most one bounded refresh, no signature-failure refresh/no retry loop/no per-kid unbounded negative cache. Server-only invalidateCache discards and aborts old loads, preventing late refill. Caller abort rejects that call; another waiter is unaffected, last departed waiter cancels transport. Ignored transport abort still cannot prolong auth beyond the deadline or refill cache. Upstream edge caching can delay key revocation; local purge does not prove instant provider revocation.

## Usage (explicit construction only)

Pass the returned object as verifier to createHttpsAuthenticatedReadComposition, createStagedTransferHandler or the existing local/CI createLocalStagedNarrowTransferBridge; never mount automatically. Keep currentJwtPolicy on the server, using the same expectedIssuer, approved audience and current time. The local/CI bridge remains nonproduction; injecting this verifier does not authorize it as production. For example:

```ts
const verifier = createSupabaseJwksSignatureVerifier({
  projectRef: serverConfig.projectRef,
  expectedIssuer: serverConfig.expectedIssuer,
  jwksUrl: serverConfig.jwksUrl,
});
const readComposition = createHttpsAuthenticatedReadComposition({
  ...approvedHttpsReadConfig,
  verifier,
  currentJwtPolicy: () => serverCurrentPolicy(),
});
const stagedHandler = createStagedTransferHandler({
  service: approvedStagedService,
  verifier,
  expectedIssuer: verifier.expectedIssuer,
  expectedAudience: approvedAudience,
  nowEpochSeconds: serverNowEpochSeconds,
});
// The names above denote already-approved server ports/configuration, not
// values obtained from a JWT or caller. Creating these objects is opt-in.
// For the low-level port:
await verifySupabaseJwtClaims({
  token,
  verifier,
  policy: currentServerPolicy,
  signal,
});
```

Factory construction performs no network; verification loads only fixed public JWKS. Optional fetch is a trusted server transport/testing port, never request input. No new handler, default binding, DB adapter, service listener, authentication grant or rollout is added. Legacy HS256 or custom-domain projects must remain blocked pending separately approved support, not silently accepted.

## Focused evidence plan / exit

Locally generate real EC/RSA keys and signed JWTs, check valid/wrong/tampered signature, alg/kid/key-use/issuer and existing expired/audience/future-iat policy composition. Small deterministic mocked transport tests cover cache/rotation/cooldown/single-flight/abort/timeout/bounded stream/failure/purge, no production account/network, full demo, high-intensity attack campaign or whole-suite rerun. Existing focused identity/HTTPS/staged handler regressions remain unchanged.

Pinned offline frozen install, Core/Worker/API builds as required, focused types/tests/lint/format and ordinary boundaries/authority/environment/secrets/foundation-policy checks. Freeze head/tree/base/patch/SHA256 and exact outputs, explicitly distinguish actual local crypto from mock network/SQL and NOT_RUN production/real-session/RLS/runtime evidence. Deliver technical handoff to Root then STOP; no push/merge/deployment/status promotion.

## Official references

Observed local checks: new crypto/transport suite 48/48 PASS; unchanged authenticated read boundary 8/8 and HTTPS composition 34/34 PASS, 90/90 total. Focused types/lint/format, Core/Worker/API build and ordinary scanner checks PASS. Two preliminary failures were in the new test's envelope/classification construction, repaired using the canonical request factory and supported COUNTRY classification; no existing production contract, policy or test was weakened. Full logs/exit codes and frozen source hashes are external handoff evidence. Production JWKS/session/account/RLS/deployment/runtime/activation and staged HTTP demo: NOT_RUN.

- [Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts): asymmetric project JWKS and no keys for legacy shared-secret projects.
- [Supabase signing keys](https://supabase.com/docs/guides/auth/signing-keys): ES256/RS256 and provider edge-cache/rotation caveats.
- [Pinned Node crypto](https://nodejs.org/download/release/v24.20.0/docs/api/crypto.html#cryptoverifyalgorithm-data-key-signature-callback): JWK createPublicKey and crypto.verify, RSA padding / IEEE-P1363.
