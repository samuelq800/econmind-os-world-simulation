# Independent review: Cloudflare HOLD runtime preparation

## Review identity and scope

- Date: 2026-10-09 (Asia/Shanghai).
- Reviewer: `/root/runtime_independent_review`, an independent Codex review
  agent explicitly authorized by the user. This reviewer did not implement or
  modify the reviewed source, configuration, tests, or implementation evidence.
- Branch: `codex/world-seed-delivery`.
- Immutable implementation candidate:
  `e7ecf45184baad69a37e2e51fff8862a635267dc`.
- Review baseline: `812e8ae95f83c8c8bd6811ccffa21217561ea8cf`.
- Candidate tree: `8ac834bca15b11ef517154133c4e6740ae87ff59`.
- Working HEAD inspected: `02c4695f36063047b2ba34c99d1397b6f271c453`;
  its changes after the candidate are the implementation report and evidence JSON
  only. The implementation source remains the reviewed candidate.
- Effective risk: **P0**, because identity verification and the architecture
  import guard are affected. Method: `INDEPENDENT_REVIEW`.
- Scope: the 23 changed files between the stated baseline and candidate,
  including the two HOLD entry points, staging configuration, narrowly scoped
  boundary allowance, validated-JWK-to-SPKI compatibility change, manual-redirect
  JWKS transport, tests, local workerd checker, workflow, and handoff records.

Governing sources inspected: `AGENTS.md`, `PLANS.md`,
`docs/governance/FAST_MAINLINE_REVIEW_POLICY.json`, `status/progress.json`,
`status/decisions.json`, `docs/architecture/decisions/ADR-18.md`,
`docs/architecture/REPO_BOUNDARIES.md`, and the searchable Constitution extraction
in `specs/extracted/CONSTITUTION.md` (fail closed, single state, server authority,
permissions, isolated testing, and merge evidence). No constitutional ambiguity
requiring a different reading of the original Word document was found.

Implementation evidence inspected:
`CLOUDFLARE_RUNTIME_ENVIRONMENT_2026_10_09.md`, its matching evidence JSON,
the actual CI artifacts, raw complete-check log, native job log, focused results,
workerd results, and preserved initial failures. Full files and the existing
HTTP/JWT implementation were read, rather than relying only on diff summaries.

The current gate remains V09.1 PLANNED, `next_step_ready=false`. ADR-18 approves
disposable local/CI and isolated staging; it does not approve production topology,
connection, migration publication, or economic activation. Historical owner
acceptance is not reused as approval of this P0 candidate.

## Findings

**No open blocker or major was found within the defined HOLD preparation scope.**

1. The boundary exception permits only `cloudflare:node` from
   `apps/world-api/cloudflare/runtime-api.mjs`, with the WORLD_API owner check.
   Other Cloudflare module imports and other API, Worker, Core, or browser paths
   fail closed. Existing boundary tests remain; the exact positive case and five
   negative cases pass. This is not a browser-to-server ownership exemption.
2. API composition is fixed `null`; there is no environment/request activation
   mechanism. The existing Office transport still validates origin, bearer
   shape, cookies, MIME, request bounds and timeout behavior. Successful
   preflight is not command acceptance. Ordinary Office requests remain
   `NOT_CONNECTED`, and opening/seed/tick/lease/dispatch writes are not mounted.
3. Executor configuration disables workers.dev and preview URLs. It has no
   storage, database binding, cron, queue consumer, economic composition, or
   writer lease acquisition. The API uses its explicit service binding for a
   bounded HEAD health request, without forwarding user credentials. Readiness
   remains 503 even when executor transport is alive; neither health response
   grants authority. The module-level HTTP server is an isolate-lifetime routing
   object, not per-request mutable identity or authoritative world state.
4. The crypto correction exports SPKI only after existing JWK validation. It
   preserves allowed algorithms, P-256/RSA bounds, signing purpose, header/kid
   checks, signature length/encoding, response provenance, resource caps,
   cancellation, cache/cooldown rules, cryptographic verification, and issuer
   checking. The separate claims validator remains mandatory for audience/time
   validation and does not grant seats. Real workerd verifies both ES256 and
   RS256 and rejects expired, wrong-issuer and altered-signature tokens.
5. Manual redirect changes transport handling only. The unchanged loader rejects
   non200, redirected, wrong-URL and invalid/oversized key responses. Added tests
   reject 301/302/307/308 and provenance mismatch with one fetch. Test-only public
   JWKS fixtures do not replace real-session or seat evidence and are not either
   deployable entry. Test private keys are generated in memory.
6. The workflow has read-only contents permission, installs the pinned CLI
   outside repository dependencies, preserves the frozen lockfile and unmodified
   complete `pnpm check`, and uses only owned disposable PostgreSQL. It contains
   no login, deployment, production SQL, or credential requirement. The native
   fixture and earlier failure records were retained.

## Validation evidence

Reviewer environment: Windows, Node24.20.0, pnpm12.3.4, isolated
Wrangler4.148.0 / Miniflare5.20261006.0-alpha. Independent reruns:

| Command                                                                                                                                                                                                                                                                                                                                                                                                                                                | Exit | Result                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---: | -------------------------------------- |
| `pnpm exec vitest run tests/world-api/runtime-environment-hold.test.ts tests/world-api/cloudflare-jwks-verifier.test.ts tests/world-api/supabase-jwks-signature-verifier.test.ts tests/world-api/https-authenticated-office-command-route.test.ts tests/world-api/production-runtime-binding.test.ts tests/architecture/boundaries.test.ts --reporter=json --outputFile=artifacts/world-runtime-environment-2026-10-09/independent-focused-tests.json` |    0 | PASS: 208 passed, 0 failed, 0 skipped  |
| `pnpm exec tsc --noEmit -p tests/support/tsconfig.runtime-environment-hold.json`                                                                                                                                                                                                                                                                                                                                                                       |    0 | PASS                                   |
| `pnpm exec tsc --allowJs --checkJs --noEmit --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2024 --lib ES2024,DOM --types node artifacts/world-runtime-environment-2026-10-09/runtime-api-env.d.ts apps/world-api/cloudflare/runtime-api.mjs`                                                                                                                                                                         |    0 | PASS: actual generated binding types   |
| `node scripts/check-boundaries.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                    |    0 | PASS: 307 files                        |
| `node scripts/check-authoritative-patterns.mjs`                                                                                                                                                                                                                                                                                                                                                                                                        |    0 | PASS: 302 files, 0 violations          |
| `WORLD_CLOUDFLARE_TOOL_ROOT=D:/dev/node/isolated/world-cloudflare-tools node scripts/check-cloudflare-runtime-local.mjs`                                                                                                                                                                                                                                                                                                                               |    0 | PASS: 11 real workerd checks, disposed |
| `wrangler deploy --dry-run --env staging --config config/cloudflare/world-runtime-api.wrangler.jsonc --outdir D:/projects/econmind-os-world-simulation/artifacts/world-runtime-environment-2026-10-09/independent-api`                                                                                                                                                                                                                                 |    0 | PASS: 720.98KiB / gzip152.63KiB        |
| `wrangler deploy --dry-run --env staging --config config/cloudflare/world-runtime-executor.wrangler.jsonc --outdir D:/projects/econmind-os-world-simulation/artifacts/world-runtime-environment-2026-10-09/independent-executor`                                                                                                                                                                                                                       |    0 | PASS: 1.22KiB / gzip0.62KiB            |
| `git diff --check 812e8ae95f83c8c8bd6811ccffa21217561ea8cf e7ecf45184baad69a37e2e51fff8862a635267dc`                                                                                                                                                                                                                                                                                                                                                   |    0 | PASS                                   |

Independent API bundle SHA-256:
`b7a07ec01d2f67818ee0753246eddf611543e7480e28c828f108018a2bb209d4`.
Independent executor bundle SHA-256:
`37e92b7229786e61f5b57acfc4c8cbb96b739ac3198a522b98dd688fab0468b9`.
Both exactly match the reported local and CI artifacts.

Independent focused result SHA-256:
`b16ca9b2e43981f6b1620352b2e2e92ce795fab0ecd11d54f7a79d7a752c09a6`.
Independent workerd evidence copy (`independent-workerd-evidence.json`) SHA-256:
`4d15e3527fec6b9d73642f43a61f022e290b52fc7101928c386f705d6eb4b2ab`.
The local checker refreshes its ignored output; preserved CI and initial-failure
records were not modified.

Reviewed CI [37893668787](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37893668787)
actually checked out `fcda97aed51eead36f1c85f4bac9aa713a2e27e4`.
Reviewer independently resolved both Git trees: exact equality at
`8ac834bca15b11ef517154133c4e6740ae87ff59`. Raw `pnpm check` evidence is
PASS/exit0: 2999 passed, 0 failed, 153 conditional skipped; subsequent Edge29
and boundary40 pass. The 153 skips are not counted as passes. The native
PostgreSQL18.6 test is PASS/exit0, 1 passed, 0 failed, 0 skipped, with actual
JWT→persisted seat→intake→fenced settlement→FINAL→authorized read in TEST_ONLY
loopback. These full/native checks were inspected, not rerun by this reviewer.

Reviewer recomputed artifact ZIP hashes:
`a137fffb5e820e2b58664d3601385e0cf414f22699726bbded4d0da52a765249`
(workerd) and
`4e26cc4a23b806bf75000dd5d10e3a2d04a2d747d8c64fbbab2bf90994a6e98e`
(native); complete-check raw-log hash
`8336780e09de0df79826c082bca284f5146c8ff8357795f38c6eb94b6face5f0`.
They match the recorded evidence. Local whole-tree lint failure caused by
generated artifacts is preserved; the clean CI full check provides the mandatory
lint/format/typecheck/test/security/governance/migration/build evidence.

Current platform references were retrieved on this review date:
[Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/),
[Node HTTP bridge](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/),
and [Node crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/).
The latest retrieved workers-types5.20261009.1 package's bridge signature and
the installed Wrangler config schema were inspected. Actual generated types and
dry-runs validate this candidate's binding/configuration usage.

## Gate decision

**Decision: APPROVED. Scoped implementation review result: VERIFIED.**

This approval binds only the immutable candidate and stated baseline delta. It
permits the account owner to publish the two reviewed **HOLD staging services**
under the user's existing Cloudflare authorization, preserving the reviewed
bundle/configuration and collecting real deployment version/probe evidence.
It does **not** approve all historical changes in PR124 for merge. Keep PR124
draft unless its entire merge delta obtains applicable approval.

This review does not change `status/progress.json`, approve an ADR, complete
V09.1, approve production schema/roles/migration/connection, establish a lawful
real seat/session, authorize a writer, admit an opening, or start Clock. Shared
production Supabase connection and real identity are NOT_RUN/NOT_VERIFIED;
Cloudflare publication/version/probes are NOT_RUN at review time. These are
explicit limitations of the HOLD preparation and cannot be represented as
completed runtime economic activation. No new production permissions or
migrations were granted, and no legacy production database/site was changed.

## Next action

Publish reviewed executor first, then API, verify immutable bundle hashes and
service binding, record version IDs and real 200 health/503 readiness/denial
probes, and preserve HOLD. Any implementation, authority, database-binding,
identity-composition, or economic-lifecycle change requires its own applicable
evidence and review. The main repository retains the sole production migration
publication chain. Keep collaborator Cloudflare credentials unnecessary.
