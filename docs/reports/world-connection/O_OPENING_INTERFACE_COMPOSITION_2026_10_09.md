# Opening-interface source composition — 2026-10-09

Status: SOURCE_ONLY / INDEPENDENT_REVIEW_PENDING. Not a production connection receipt.

## Exact inputs and unchanged replay

Integration starts from actual merged main `3eb6e049d02a76e010cb5cb449d6d7151ae63573`.
The three implementation candidates share their original base `96217db583db4c1bd6ef74714b2e0a5ef6b7ed6d`.

| Component                                                     | Fixed source                             | Root replay      | Independent reviewer |
| ------------------------------------------------------------- | ---------------------------------------- | ---------------- | -------------------- |
| A: private opening bytes/preflight                            | 49e8359a4bfa76a1622ab0dc6645bfb5160c90f6 | 4405a71          | B, pending           |
| C: trusted browser session and Financial closed-state privacy | d9313b5180895d20e9563f3f9dc34830b702785e | 66c995d +49ab189 | F, pending           |
| G: explicit nonactivated API host                             | 89ae38a8412de1beb8c4566c1a6b19bc89c8a71d | a09921f          | E, pending           |

Root verified all replayed source/tests/config files against the fixed originals:
all diffs empty. No original parser, ledger, authority, service or schema rule was relaxed.
Root adds only CI coverage, one CI prerequisite assertion and integration records.
Existing CI steps and six prerequisite cases remain intact. New strict configs run
without skipLibCheck or continue-on-error. No production workflow is dispatched.

## Concrete connection points

1. Server-owned immutable opening directory → `OfficialOpeningBundleLoader({repositoryRoot, incoming?}).load()`.
   Server pins incoming decision/assembly/Owner-record identities and whole-bundle digest;
   package-supplied approval flags do not replace actual byte/source validation.
   `preflightOfficialOpeningBundle(loaded)` uses existing validators/Core reconstruction;
   current real inputs yield PREFLIGHT_BLOCKED and no seed. This is not a writer.
2. Approved server composition → `createNonactivatedRuntimeApiHost(input)` → explicit
   `handle(request,response)`. Two read paths are existing approved endpoint pins;
   Financial and Office intake use their existing exact Core paths. Public/lobby/health
   paths remain caller-owned. Genuine ports, auth/current SQL and all World pins remain
   required. Null inputs do not enable commands. No listen/TLS/default mounting is added.
3. Existing browser host → `window.EconMindTrustedHost.configureTargets(...)` once →
   `connect(existingBindings)`. Real JWT/current identity/session/seat/World pins and
   existing classified read bindings are required. Financial is optional and requires
   the original existing request/binding; no auto-draft, submit or replay.
   Invalidations, DENIED, pagehide and identity/view loss retire the shared session;
   late work cannot revive it, including closed-drawer private DOM.

## Actual composed checks

Root local check after unchanged replay:

- Core → Worker → API builds: exit0; no process startup.
- Five targeted files: 71 PASS /0 FAIL /0 SKIP, 25.48s.
  Opening14 +API11 +browser35 +direct Financial privacy4 +CI prerequisites7.
- Three dedicated strict configs, actual World Web types and Root CI-test lint: exit0.
- Formal static Web build: exit0; existing CSS-at-build-time and large-chunk warnings retained.
- Authoritative UI source verification: PASS; 70 countries, 286 published files verified.
- Source boundaries: PASS, 307 scanned files. Owned format and git diff checks: PASS.

These are local construction checks, not provider CI or independent approval.
Root tool outputs were inspected; no separately downloaded provider artifact exists
for this new composition yet. Earlier PR118 full provider evidence is a separate receipt.
A/C/G reports retain their original test/lint/type/timeout failures and corrected results.

## Still required, not hidden

Real formal LC/FX/version/date and complete CB register source contracts and producer
remain missing; old GCU assembly and TEST_ONLY FX/CB mechanisms do not satisfy them.
Then actual seed/admission, sole production publisher, lawful seats, approved external
host/Worker lifecycle, deployment/readback and numeric decision→FINAL loops remain.
Browser generic Office submission/FINAL is not implemented by this session wrapper.
No DB connection/write, bootstrap, schema publication, engine/Clock activation or 420
online-view acceptance occurred. Gate B and world/seed/Worker status remain unchanged.
