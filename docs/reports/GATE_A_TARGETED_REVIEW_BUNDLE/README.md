# Gate A targeted remediation review bundle

This bundle is a candidate for independent targeted re-review. It does not
approve Gate A and does not mark any V02-V05 work package VERIFIED.

## Candidate identity

- Base reviewed HEAD: `1a950a41567900761d4f4313092ab4a3404e6f67`
- Remediation branch: `codex/gate-a-targeted-fixes`
- Immutable code candidate HEAD: `47fe5c5d465748370d9a8ea046bc443978437203`
- Review range: `1a950a41567900761d4f4313092ab4a3404e6f67..47fe5c5d465748370d9a8ea046bc443978437203`
- Changed files in code range: 35
- Finding scope: the two BLOCKER and five MAJOR findings only
- Status: `IMPLEMENTATION FIXED / READY_FOR_REVIEW`

The later documentation commit packages evidence only. Review executable code
at the immutable code candidate above and inspect the branch tip for this
bundle and the pending-review status record.

## GATEA-BLK-01 — public runtime fails closed

- Original exploit: the exact public `pnpm dev:api` command reached
  `LISTENING` with a local label combined with a remote production-like URL,
  production fingerprint, public namespace, and mutation enabled. A blind
  follow-up also found syntactic loopback aliases accepted in production.
- Root cause: the policy was a standalone checker, not a prerequisite of the
  public launchers, and loopback recognition compared only literal hostnames.
- Fix: all root and package public launchers call the same fail-closed policy
  before spawning compiler/runtime children. The policy rejects forbidden
  production credential variables in every environment and normalizes legacy
  IPv4, localhost, IPv6, and IPv4-mapped loopback spellings without DNS.
- Changed files: `scripts/environment-policy.mjs`,
  `scripts/assert-safe-environment.mjs`,
  `scripts/run-development-service.mjs`,
  `scripts/run-development-stack.mjs`, `scripts/architecture-ownership.mjs`,
  `tests/foundation/gate-a-runtime-environment.test.ts`, and the positive
  lifecycle fixture.
- New attack tests: seven public commands crossed with 15 unsafe environment
  configurations, including five loopback aliases; every case also proves no
  `LISTENING` output and successful port rebinding.
- Focused result: PASS, 105/105.
- Full-matrix result: PASS.
- Residual risk: no live database connection or external staging environment
  exists in this sprint, so network-level destination pinning was not tested.

## GATEA-BLK-02 — exact-or-reject arithmetic

- Original exploit: accepted 120-digit Money addition silently lost a trailing
  one; accepted 41-by-41 digit Price multiplication ended in `2200` rather than
  exact `2209`.
- Root cause: the accepted operand domain exceeded the Decimal precision used
  for arithmetic and results had no explicit public-domain validation.
- Fix: the private Decimal working precision is 240 significant digits, enough
  for exact operations over two accepted 120-digit operands. Public result
  domains remain explicit at 120 digits; add/subtract/multiply compute exactly
  and then either return a valid value or raise
  `DECIMAL_RESULT_OUT_OF_RANGE`. No business rounding policy was introduced.
- Changed files: numeric value objects, `world-decimal.ts`, `errors.ts`,
  testkit arbitraries, and the independent exact decimal oracle.
- New attack tests: boundary examples at 80/120 digits, carry/scale cases,
  overflow rejection, and fast-check comparisons to a BigInt coefficient/scale
  oracle.
- Focused result: PASS, numeric 13/13 and property 8/8.
- Full-matrix result: PASS.
- Residual risk: FX, tax, CPI, interest, settlement, and minor-unit rounding
  remain future policy and were not implemented.

## GATEA-MAJ-01 — current, unforgeable Office authority

- Original exploit: spread-copying the structural brand enabled cross-country
  approval, and an issued context continued approving after membership
  revocation. A blind follow-up substituted a different payload and required
  Office set under the same proposal id/version.
- Root cause: authority was structurally copyable, was not re-resolved at the
  decision point, and was bound only to proposal id/version.
- Fix: issued contexts are registered in a private WeakMap; sign/reject
  re-resolve current identity, membership, assignment, suspension, country,
  team, capability, and authorization revision. A frozen snapshot binds world,
  country, id, version, payload fingerprint, policy version, and the complete
  required-Office set.
- Changed files: authorization approvals, identity, offices, projections, IDs,
  and authorization foundation tests.
- New attack tests: spread/Object.assign/symbol copies, country/Office/capability
  substitution, membership/identity revocation, reassignment, suspension,
  revision and country changes, and proposal-representation substitution.
- Focused result: PASS, 27/27.
- Full-matrix result: PASS.
- Residual risk: accepted signatures intentionally remain historical facts
  after later identity revocation; queued execution still requires its future
  explicit command policy.

## GATEA-MAJ-02 — inert canonical serialization

- Original exploit: a duck-typed method and an enumerable getter returned
  different canonical bytes on repeated calls. A blind follow-up showed live
  Proxy reflection could execute traps.
- Root cause: the serializer trusted behavioral duck typing and read object
  state before proving it inert.
- Fix: only explicitly registered domain value adapters are accepted;
  descriptors are inspected without property reads; accessors, functions,
  hidden/symbol state, sparse/noncanonical arrays, cycles, and unsupported
  prototypes fail closed. Native Proxy identity detection occurs before any
  reflection and does not invoke traps.
- Changed files: `packages/core/src/serialization/canonical.ts`, the exact
  architecture exception for native `node:util` Proxy identity, and canonical
  tests.
- New attack tests: mutable method provider, getter/setter, live and revoked
  Proxy with zero observed traps, hidden/symbol state, reconstruction, and
  insertion-order equality.
- Focused result: PASS, canonical 14/14 and property 8/8.
- Full-matrix result: PASS, including the web build.
- Residual risk: trap-free Proxy detection depends on the Node runtime; the
  boundary exception is restricted to this serializer and exact module.

## GATEA-MAJ-03 — AST/module boundary enforcement

- Original exploit: dynamic imports of `decimal.js` and `fast-check`, plus
  unary numeric coercion, passed the regex-only scanner. A blind follow-up used
  `const Numeric = Number`.
- Root cause: import forms and numeric conversions were matched by text rather
  than parsed syntax, and aliases were not followed.
- Fix: a TypeScript AST scanner covers imports, exports, require, dynamic
  import, import-equals, nonliteral references, dependency ownership, unary
  plus, `toNumber`, direct conversions, assignments, computed-property and
  bound aliases, destructuring, and Reflect apply/construct.
- Changed files: `scripts/check-authoritative-patterns.mjs` and real CLI
  negative fixtures.
- New attack tests: literal/nonliteral dynamic imports, decimal and fast-check
  owner violations, unary plus, and computed/bound/reflective `Number` aliases.
- Focused result: PASS, 3/3; repository scanner PASS over 30 governed files.
- Full-matrix result: PASS; protected boundary suite 34/34.
- Residual risk: the gate is intentionally a static, repository-local policy;
  runtime-generated code is outside the allowed architecture.

## GATEA-MAJ-04 — Supabase UUID auth subject

- Original exploit: a valid signed-envelope/profile UUID subject was rejected
  because external auth identity used the uppercase domain `UserId` contract.
- Root cause: external authentication and internal domain identifiers shared an
  incompatible branded type.
- Fix: `AuthSubject` accepts canonical PostgreSQL UUID text, normalizes case,
  and remains separate from domain IDs. Token and whitelisted profile subjects
  must match canonically.
- Changed files: IDs, identity, authorization membership/signature contracts,
  and realistic UUID tests.
- New attack tests: valid lowercase/uppercase UUID normalization, malformed and
  revoked subjects, token/profile mismatch, and extra portable authority facts.
- Focused result: PASS within authorization 27/27.
- Full-matrix result: PASS.
- Residual risk: signature verification remains an injected server adapter; no
  production Supabase credentials or live tenant were used.

## GATEA-MAJ-05 — truthful migration provenance

- Original exploit: the manifest named `980e89a...`, which did not contain the
  SQL, while validation passed and rehearsal recorded that false source. A
  blind follow-up identified Git replace refs as an object-identity bypass.
- Root cause: provenance was caller-supplied metadata rather than verified
  artifact bytes from an immutable Git object.
- Fix: `artifact_source_commit` now identifies
  `43739ceb38c167c44e806361930b7603360647c3`, the commit containing the exact
  artifact bytes. Validation verifies full commit, object existence, path, and
  SHA-256. Git queries disable replace refs by option and environment.
  Rehearsal records only verified provenance.
- Changed files: migration manifest/README, policy, validator, rehearsal, and
  environment-release tests.
- New attack tests: nonexistent commit, absent historical path, hash mismatch,
  missing provenance, legacy field, and a disposable repository with an active
  replace ref.
- Focused result: PASS, 14/14; migration validation and both PGlite rehearsal
  modes PASS.
- Full-matrix result: PASS.
- Residual risk: external PostgreSQL and live staging were NOT_RUN; production
  publication remains disabled and owned by `main-site-release-chain`.

## Reviewer task

For each of the seven findings, determine whether the original exploit is
prevented and whether the remediation introduced a new BLOCKER or MAJOR. Do not
infer approval from candidate tests. Gate A remains pending until a fresh,
independent decision is attached to the immutable candidate.

## Companion evidence

- `FINDING_CLOSURE.json` — machine-readable finding-to-fix mapping
- `TEST_EVIDENCE.json` — reproductions, commands, results, and honest failures
