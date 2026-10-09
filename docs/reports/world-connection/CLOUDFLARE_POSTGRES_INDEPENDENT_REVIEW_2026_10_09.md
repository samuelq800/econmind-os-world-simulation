# Independent review: Cloudflare PostgreSQL transport preparation

## Review identity and scope

- Date: 2026-10-09 (Asia/Shanghai).
- Reviewer: `/root/postgres_runtime_review`, a separately authorized independent
  Codex reviewer. The reviewer did not implement or change the source, tests,
  configuration or implementation evidence; this review report is the only
  authored repository file.
- Branch: `codex/world-seed-delivery`.
- Baseline: `95ca90880b9c211023a9d90eeddecd2d0a25ae1c`.
- Immutable candidate: `35dee047d8e4db822bdc60c93f80d925e11429e4`.
- Candidate tree: `adff3040693836d7bd1f4c7f1c8aaddc81b88fd3`.
- Risk: **P0**; method: `INDEPENDENT_REVIEW`.
- Scope: the 12 changed files between the baseline and candidate: request-scoped
  pg Pools, shared JWKS fetch port, TEST_ONLY workerd/PostgreSQL mechanism fixture
  and assertions, existing native fixture public test hooks, strict test config,
  nondeploying workflow, artifact ignores and scoped execution plan.

Governing sources read: `AGENTS.md`, `PLANS.md`, the centralized
`FAST_MAINLINE_REVIEW_POLICY.json`, `status/progress.json`, `status/decisions.json`,
ADR-18, `REPO_BOUNDARIES.md`, the independent-review template, and the searchable
Constitution extraction (fail closed, one World State, server authority,
permissions, exact arithmetic, transaction outcomes and isolated testing).
No ambiguity requiring a different reading of the original Word was found.

Full changed files, the upstream JWT verifier, authenticated intake, read binding
provider/role guards, transaction adapter, durable consumer, isolated composition,
native fixture and canonical receipt/SimTime implementation were inspected.
The current gate remains V09.1 PLANNED; ADR-18 does not authorize production.
Uncommitted parent-owned handoff/report edits are outside this immutable scope.

## Findings

**No open blocker or major remains within this source and isolated-test scope.**

1. Pools are created within a request operation, retain real `pg.Pool` identity,
   remain separate reader/intake ports, cap each pool at two connections, observe
   idle errors and await both closures. Invalid connection diagnostics omit the
   credential URL. No global socket, retry, SQL proxy, grant or new economic
   implementation is introduced. Operation failures retain their identity when
   cleanup is confirmed; unconfirmed cleanup cannot return a successful result.
   The existing repositories continue to own transaction recovery and UNKNOWN.
2. Shared JWKS fetch changes only the trusted transport redirect mode. The
   original fixed project/issuer/URL, actual response provenance, key purpose,
   algorithm, signature, resource caps and claims checks remain. It neither
   grants a seat nor replaces persisted current authorization/admission checks.
3. The mechanism uses actual request-scoped pools and reviewed API compositions
   in workerd, then the original authoritative Worker consumer and Core/SQL
   settlement. The consumer still verifies the TEST_ONLY namespace, actual
   loopback database name/server role, opening lineage, fencing and durable
   receipt/event facts. No production guard, browser boundary or migration was
   changed, and no public deploy entry imports the test fixture.
4. Actual assertions exercise wrong-seat denial, seller and buyer approvals,
   repeated enqueue of one immutable discretionary command, Reserve/Ship/Deliver
   versions 1/2/3, exact buyer/seller balances and inventory, idle reconsumption,
   durable FINAL and revoked-seat denial on both lookup paths. Test automatic
   commands and projection publication still originate from the existing Node
   fixture; this does not prove a production scheduler or projection producer.
5. The final serialization correction converts only a known processed receipt's
   `simTime.toCanonicalValue()`. It preserves the domain BigInt object and adds
   actual workerd string assertions for 10000/10200. No generic JSON replacer,
   floating-point conversion, synthetic success or test removal was introduced.
6. CI preserves the complete official `pnpm check` and original native roundtrip,
   adds a separate actual workerd/native-PG job, uses pinned tools/frozen lockfile
   and contents-read permissions, and contains no deployment or production DSN.

Earlier mandatory failures were retained and were never approved: f514's JSONC
trailing-comma parse failure, 821d's missing local Hyperdrive password field, and
2caa's raw SimTime serialization failure. Corrections respectively use pinned
TypeScript JSONC parsing, an explicitly synthetic loopback-trust password marker,
and the explicit canonical receipt field. The marker is not password-auth proof.

## Validation evidence

Reviewer environment: Windows, Node24.20.0, pnpm12.3.4, isolated Wrangler4.148.0.
Independent commands completed with exit0:

| Command                                                                                                                                                                                                                                                                       | Result                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm exec vitest run tests/world-api/cloudflare-postgres-pools.test.ts tests/world-api/cloudflare-jwks-verifier.test.ts`                                                                                                                                                     | PASS: 15 passed, 0 failed, 0 skipped                          |
| `pnpm exec vitest run tests/world-api/authenticated-financial-intake-rollback-uncertainty.test.ts tests/world-api/supabase-jwks-signature-verifier.test.ts tests/world-api/postgres-server-read-binding.test.ts tests/world-api/https-authenticated-read-composition.test.ts` | PASS: 117 passed, 8 conditional skipped; skips are not passes |
| `pnpm exec tsc --noEmit -p tests/support/tsconfig.cloudflare-postgres.json`                                                                                                                                                                                                   | PASS, repeated after final fixture correction                 |
| Scoped `pnpm exec eslint` on changed API source/test files and both final corrected fixture/test files                                                                                                                                                                        | PASS                                                          |
| `pnpm exec prettier --check` on the two API source files, mechanism test/fixture and pool test                                                                                                                                                                                | PASS                                                          |
| `node scripts/check-boundaries.mjs`                                                                                                                                                                                                                                           | PASS: 313 files                                               |
| `git diff --check 95ca908..35dee04`                                                                                                                                                                                                                                           | PASS                                                          |
| `git fetch origin 2cc7cb3d89835427fde244d0a4cbc2e72170d05c` and `git rev-parse '<commit>^{tree}'` for checkout and candidate                                                                                                                                                  | PASS: independently resolved identical trees                  |

Reviewed [CI run 37919982783](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37919982783)
checked out `2cc7cb3d89835427fde244d0a4cbc2e72170d05c`, independently verified
identical to the candidate tree. All three jobs completed successfully. The
reviewer independently read raw job logs and artifact ZIP contents; these CI
checks were inspected, not rerun on Windows:

- `official-and-native-postgres` job113785320656: unmodified full `pnpm check`
  PASS/exit0, 3072 passed/0 failed/154 conditional skipped, then Edge29 and
  boundary40 PASS, all remaining environment/migration/policy/secret/publication
  checks and build completed. The separate real native-PG authenticated
  roundtrip JSON is 1 passed/0 failed/0 skipped.
- `workerd-native-postgres` job113785320613: actual workerd to owned native
  PostgreSQL mechanism 1 passed/0 failed/0 skipped; pool controls8 PASS; actual
  generated binding types and strict fixture compilation passed.
- `workerd` job113785320293: focused208 passed/0 failed/0 skipped and11 actual
  workerd service-binding/signature checks PASS, with bundles/types/boundaries.

Recomputed ZIP SHA-256 values match the artifacts and provider logs:

- Native mechanism artifact11611895390, 850989 bytes:
  `43c9da8b788d5fb3b4c72085c88ea0f75daa6ad718c481d4d26360f4644f9c98`.
- Complete-check/native artifact11611863885, 30928 bytes:
  `9e3420de209f0df621a20bb3be37ab94baca03ac0778e0b1cdbb20dae1c04f8f`.
- Public workerd ZIP:
  `ab3b4cf2720087925c906459bec8de91a86799e3f6c235fd51fb11f5e3126500`.
- Complete official job raw log:
  `f956e49b4ed76664fde634bffd11a884f6ee6efe6057c8c4e1dec7bbc65652b9`.

Latest [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
and [node-postgres/Hyperdrive documentation](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/)
were retrieved for this review. Latest workers-types5.20261009.1 package,
installed types and actual Wrangler-generated Hyperdrive binding declarations
were inspected. pg8.16.3 meets the documented minimum. No package upgrade was
made by the reviewer.

## Gate decision

**VERIFIED / APPROVED for the specified source/transport and isolated mechanism
preparation candidate only.** Mandatory applicable automated evidence is now
passing and independently inspected. This is neither whole-PR124 approval nor
V09/Gate B closure, ADR approval, production deployment/connection approval,
official opening admission or economic activation.

Production connection is **NOT_RUN / blocked**. The shared Supabase project has
no established least-privilege runtime connections/Hyperdrive registration;
0023 caller registration, runtime-read schema publication and genuine admission
publisher are missing. LC/FX/full central-bank source/producer contracts,
approved production consumer and formal World/seed/current seats remain absent.
Local Hyperdrive plus loopback trust does not establish cloud TLS, disabled
query caching, production role permissions, real Supabase JWT seats, crash/
concurrency acceptance, or Workers Free CPU/query capacity. The existing HOLD
deployments, sole production publication chain and controlled gate stay intact.

## Next action

Record this scoped source review with its immutable candidate/evidence. The
responsible approval process must separately resolve production source/schema,
least-privilege credentials, host and admission prerequisites and required gate
evidence. Never deploy the TEST_ONLY fixture, execute proposal SQL directly on
production, drop existing guards or turn this review into whole-PR acceptance.
