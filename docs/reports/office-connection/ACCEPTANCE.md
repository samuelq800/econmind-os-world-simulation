# Office connection: permission, transaction and recovery acceptance

Status: `IMPLEMENTED_UNVERIFIED`. This tooling produces focused **TEST_ONLY mechanism evidence**, not formal Office connection acceptance. It changes no economic behavior, authorization policy, admission rule, production database or World/Clock state. Current governance remains `status/progress.json`; this report does not advance V09 or any dependent gate.

The case catalog is `config/office-connection/acceptance-cases.json`; executable selector/plan/runner/consistency validator is `tools/office-connection/acceptance.mjs`. The 14 cases contain five local pure/PGlite test cases, three native test cases delegated to their existing native owner, one forward migration rehearsal plan, three explicit gaps and two absent action surfaces. Case presence and generated plans always mean `NOT_RUN`.

## Commands

Use the installed pinned wrapper (Node 24.20.0 / pnpm 12.3.4). Commands emit one JSON document to stdout; runner test output is retained in an artifact log.

```sh
bash /workspace/.cloud-setup/run.sh econmind-os-world-simulation node tools/office-connection/acceptance.mjs list
bash /workspace/.cloud-setup/run.sh econmind-os-world-simulation node tools/office-connection/acceptance.mjs --plan
bash /workspace/.cloud-setup/run.sh econmind-os-world-simulation node tools/office-connection/acceptance.mjs plan --area permission,revocation
bash /workspace/.cloud-setup/run.sh econmind-os-world-simulation node tools/office-connection/acceptance.mjs run --case scoped-cache,authenticated-intake,durable-manual-dispatch,revoked-receipt,recovery-lineage --out /tmp/office-acceptance-focused-evidence.json
bash /workspace/.cloud-setup/run.sh econmind-os-world-simulation node tools/office-connection/acceptance.mjs validate --case scoped-cache,authenticated-intake,durable-manual-dispatch,revoked-receipt,recovery-lineage --evidence /tmp/office-acceptance-focused-evidence.json
```

Selectors support repeated/comma-separated `--case` and `--area`, plus exact `--backend NONE|PGLITE|NATIVE_POSTGRES`. Different selector dimensions intersect; multiple areas match any named area. Unknown IDs or empty selections fail. `run` requires an explicit selector and output path. It refuses native tests, gaps, absent actions and plan-only commands. Each selected case invokes exactly its named test file with a fresh Vitest JSON output; no full-suite command is constructed. `plan` and `--plan` are aliases and never execute tests. JavaScript exports include `loadCases`, `selectCases`, `sourceBinding`, `buildRunPlan`, `inspectVitestReport` and `validateEvidence` for the Command Tower orchestrator.

## Evidence contract

The local runner captures the exact argv, process exit, start/end times, fresh machine report and command log digests. A run binds `git rev-parse HEAD`, the catalog digest and a source-tree digest covering tracked and untracked nonignored apps, packages, migrations, scripts, tools, config, support fixtures, selected tests and selected scope references. Root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `vitest*` and `tsconfig*` are also included. Dirty source/config/tool changes invalidate evidence even when HEAD is unchanged. Later edits or commits require a rerun; old green artifacts are historical evidence only. Other workers editing these inputs during a run correctly cause a binding failure.

Scope binding is explicitly `TEST_FIXTURE_REFERENCES_ONLY`: selected World/country/Office/subject dimensions and hashed fixture definitions are recorded. These are the fixture scopes actually named by the selected tests; the tool does not take arbitrary live scope IDs and stamp fixture results onto them. It does not assert that a requested deployed World, country, organization or seat was exercised. Source classifications remain `TEST_ONLY` or `SIMULATED_SOURCE`; neither becomes official data or a FORMAL connection count.

Validation requires exactly one result per selected case, exact source/backend classification, exact selected test file/argv, exit zero, nonempty matching passed assertion counts, no failed/skipped/pending/todo assertions, matching report/log hashes and report start time within its run interval. Native evidence additionally requires disposable/non-production backend provenance metadata and the digest of its provenance artifact. A native suite that skips because its environment flag or owned marker is missing fails this contract; installation success alone is not test success.

`validate` is an artifact consistency checker, **not an authenticity signature**. External JSON, logs and metadata can be hand-authored, so passing their structural validation does not establish who executed them or prove their backend. Consumers must retain trusted runner command execution/exit records and inspect independently collected native provenance. The returned `authenticity` explicitly records this limitation. Neither external assertions nor locally generated TEST_ONLY evidence grants operational authority. `PASS_TEST_ONLY` is a test result, never `VERIFIED` or independent approval; `operationalAcceptance` remains `NOT_ASSESSED`.

Temporary evidence references `/tmp/office-acceptance-*/` machine reports/logs. Retain those files together with the evidence envelope for later validation; removing a referenced artifact makes validation fail. No credentials, environment dumps or connection strings are printed by the runner.

## Actual coverage and boundaries

| Surface                                           | Existing executable path                                                                  | Limit                                                                                                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| World/country/Office/subject, capability/revision | `authenticated-office-command.test.ts`; native `postgres-full-read-provider.test.ts`      | Actual JWT/SQL on disposable fixtures; positive admission fixture does not grant real admission.                                                     |
| Role revocation and transaction cutoff            | `d-revoked-receipt-head-lock-embedded.test.ts`; `manual-office-durable-dispatch.test.ts`  | Embedded serial checks do not prove native concurrency.                                                                                              |
| Duplicate / out-of-order / version                | `scoped-reconnect-cache.test.ts`; native `d-social-office-atomic-postgres.test.ts`        | Cache notices invalidate only; no live channel; Social atomic source is simulated.                                                                   |
| Partial failure and retry                         | Embedded durable/receipt tests; native Social AFTER_EVENT rollback and same-ID race tests | UNKNOWN acknowledgements remain unavailable; no blind replay or fabricated FINAL.                                                                    |
| Event/receipt audit and recovery                  | `v09-world-recovery-preparation.test.ts`; native `v09-atomic-recovery-postgres.test.ts`   | Orphan events, durable gaps, lease/fence claims and lineage reconstruction are checked; embedded is not restart proof.                               |
| Native restart/retry                              | Existing native `v09-atomic-recovery-postgres.test.ts`                                    | Owned native environment required; inner gated slices must execute with zero skip. This agent does not start a cluster.                              |
| Migration forward rehearsal                       | `scripts/rehearse-migrations.mjs`                                                         | Clean/existing schema, exact release provenance, preserved shared-schema assertion and reviewed Storage delta. It is a plan-only command here.       |
| Migration rollback                                | Explicit `GAP`                                                                            | Transaction rollback exists; no down-migration restoration chain is claimed.                                                                         |
| Organization tenant isolation                     | Explicit `GAP`                                                                            | Existing authorization/cache model has subject, World, country and Office dimensions; no organization tenant field/route was found in audited paths. |
| API pagination/version consistency                | Explicit `GAP`                                                                            | World expected-version and cache monotonicity exist; no general Office page/cursor contract was found.                                               |
| Export / independent Office background job        | Explicit `NOT_PRESENT`                                                                    | No such user-facing API action was identified; no fake action or PASS is added. Existing durable command/outbox processing is covered separately.    |

The local five cases cover cache behavior, three manual-intake family refusal mechanisms, Captain/Central Bank TEST_ONLY durable paths, revoked receipts and recovery lineage. They do not establish six Offices operating on admitted official sources. Native results are owned and reported separately by `native_acceptance`; they must be evaluated on their actual command outcome.

Shared `MembershipSnapshot` and issued Office contexts do carry `teamId`; this is existing team membership, not an audited general organization tenant API. The organization gap does not assert that teams are absent or that team isolation is broken. No selected case proves cross-organization isolation for a separate organization identifier. Existing `tests/foundation/authorization-foundation.test.ts` additionally checks cross-country/Office denials, classified projections and revoked identities; it was inspected here but was not added to the executed five-case count.

## Verification record

At implementation HEAD `14595f81caec2ed5ce7cec564d7db9609b693718`:

- Pinned `pnpm exec vitest run tests/world-api/office-connection-acceptance.test.ts --reporter=default`: exit 0, 30 passed, 0 skipped. Tests reject stale commit/source/scopes, substituted command/source/backend, missing or tampered artifacts, old reports, skipped assertions, empty or malformed assertion sets, malformed envelopes, wrong files and fabricated PASS labels for absent actions. Seven real temporary-file mutation cases prove same-HEAD package/lockfile/workspace/Vitest/TypeScript/tool/config changes invalidate existing evidence.
- Pinned `pnpm exec eslint tools/office-connection/acceptance.mjs tests/world-api/office-connection-acceptance.test.ts`: exit 0.
- Pinned focused `pnpm exec tsc --noEmit --strict --module NodeNext --moduleResolution NodeNext --target ES2024 --types node tests/world-api/office-connection-acceptance.test.ts`: exit 0.
- Pinned `pnpm exec prettier --check` for all four new workstream files: exit 0.
- Five-case local runner command above: **exit 1**, validator **exit 1 / FAIL**, correctly retaining the failed revoked-receipt suite. Fresh envelope: `/tmp/office-acceptance-focused-evidence.json`; raw reports/logs: `/tmp/office-acceptance-OrAs0l/`.

| Selected case             | Actual result                    | Passed assertions | Skipped assertions |
| ------------------------- | -------------------------------- | ----------------: | -----------------: |
| `scoped-cache`            | Exit 0 / `PASS_TEST_ONLY`        |                 7 |                  0 |
| `authenticated-intake`    | Exit 0 / `PASS_TEST_ONLY`        |                30 |                  0 |
| `durable-manual-dispatch` | Exit 0 / `PASS_TEST_ONLY`        |                20 |                  0 |
| `revoked-receipt`         | Exit 1 / beforeAll suite failure |                 0 |                  6 |
| `recovery-lineage`        | Exit 0 / `PASS_TEST_ONLY`        |                 9 |                  0 |

The aggregate is 66 passed assertions and six skipped assertions with one failed suite, **not a passing acceptance group**. The revoked-receipt setup rejected `RENEWAL_COMPLETE_CURRENT_PROVENANCE_INVALID:SOURCE_COMMIT_NOT_FOUND` for 12 migration entries (11 unique source commits). These are immutable `artifact_source_commit` references in `database/migrations/manifest.json` absent from this checkout's Git object store. Exact missing SHA/id/artifact records were written to `/tmp/office-connection-missing-commits.json` for the Command Tower's read-only source-object repair. The test and fixture remain unchanged; only that affected case should rerun after provenance is restored. A later rerun must preserve the original failure evidence.

After the Command Tower restored all 11 exact immutable source commits, the affected `revoked-receipt` case ran with six passed assertions, zero skipped and child exit 0. Its `/tmp/office-acceptance-revoked-rerun-evidence.json` envelope nevertheless returned runner **exit 1 / FAIL** because other workers changed shared tools/config during the run. This is the expected fail-closed source binding, not a failed economic assertion; the raw report is `/tmp/office-acceptance-xl7SpD/revoked-receipt.json`. Original failed and later successful assertion reports are both preserved. A stable-input rerun is still required for a current valid envelope. The four other passing cases remain historical test results under their original binding and were not rerun or relabeled.

No full suite, native cluster startup, production access, commit, push, merge or deployment was performed by this workstream.
