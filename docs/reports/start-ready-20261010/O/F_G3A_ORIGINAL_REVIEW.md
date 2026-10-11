> Presentation copy of an independent review, not a new root review.
> Original source: `/Users/samuel/.codex/state/plugins/codex-security/scans/g-constructor-3a-20261010/artifacts-a69e5e2691a02746f8e7236c0df7ee576d3b8c26bd1f6f9ea752668f1f5234b6/artifacts/F_G_CONSTRUCTOR_3A_REVIEW_20261010/F_REVIEW.md`
> Original raw SHA256: `07aec25a71b653a4f2460f39f950b590c10329acc5087fa8e866bfb529761f38`

# F — G constructor 3A final candidate independent review

2026-10-10 · SOURCE_ONLY / UNMOUNTED / HOLD

## Decision

**CHANGES_REQUIRED**. Patch-risk recommendation/workflow label: **revise**.
One reproduced, bounded configuration/resource-contract defect: **F-G3A-01 [P2]**.
This finding's priority does not downgrade the patch's highest affected P0 identity/Command boundary or permit fast-track.

This is only the final 3A mechanical implementation review. It does not reopen G1/2 or the design approval. It neither approves 3B/4A/4B/5 nor grants integration, merge, startup, deployment, admission or Gate B authority.

## Exact identity

- Repository: https://github.com/samuelq800/econmind-os-world-simulation.git
- WT: /Users/samuel/Documents/econclub/.econmind-worktrees/g-constructor-3a-20261010
- Base: eb033a4d9e717a9cb9149e450900b606c3457403; tree 13a60f04c1a9c54eb8ffbaca8b469bf25b293dce.
- Code: a2d59abfc768cc93744a7a2b82af514a7f12c84b; tree 23efaedff642e6b364f02151c347216c76c2e247; parent exactly base.
- Evidence: af005fb71545373542a5bd0565877b37e2580439; tree e3b46c9812febfa7179238bb2e3ba79170d8c484; parent exactly code.
- Exact git diff --binary --full-index --no-ext-diff base..code SHA256: 8f4b0a579862e89e95ca42f44159efb2ac8dd9bcb8df3d59890e2898d058fac0.
- Evidence commit adds exactly the four G evidence files below; twelve code files unchanged at evidence tip.
- Final WT clean, diff --check exit0. No branch following or subject mutation.

| Evidence file                                                                         | Bytes | SHA256                                                           |
| ------------------------------------------------------------------------------------- | ----: | ---------------------------------------------------------------- |
| docs/reports/start-ready-20261010/G/CONSTRUCTOR_3A_IMPLEMENTATION.md                  |  8745 | c13867a5cfc233a87f686579b569281ce514e4a6d98f9df098d172a26a9a64c6 |
| docs/reports/start-ready-20261010/G/CONSTRUCTOR_3A_EVIDENCE.json                      | 28640 | c905c71198fe35a1c6923c112fcb27937d19372cf1b047f895be5fb1e4d50d2c |
| docs/reports/start-ready-20261010/G/constructor-3a-checks/check-transcript.txt        | 17693 | fc4484e611adb0d6af7162897c94c078e1d13a38b83adfd2dd8c5ce9fd09b378 |
| docs/reports/start-ready-20261010/G/constructor-3a-checks/pre-test-dist-manifest.json | 73405 | be01e52bcdd1f4870cc6419c901a7778ef008e355702032be1f21de4168fdb75 |

All432 current dist entries match the supplied pre-test manifest. Aggregate SHA256: 152f35a662161bf299e2d2a99d27349f5b6ef8c144d50a48793c98523f0154b1, compact ordered JSON file array, no trailing newline. This independently binds present bytes to retained manifest; it is not a new build, CI attestation, or retrospective certification of the older missing-dist packet. Six modules executed below are byte-identical copies of manifest-bound bytes; copy hashes retained.

## F-G3A-01 [P2] — reject empty source configuration before allocation

Location: [cloudflare-postgres-pools.ts:64](/Users/samuel/Documents/econclub/.econmind-worktrees/g-constructor-3a-20261010/apps/world-api/src/runtime-preparation/cloudflare-postgres-pools.ts:64), pairing check at53–58, allocation/callback at95–101.

The command-route pairing rejects only sourceConnectionString===null. A valid TypeScript string value '' therefore passes pairing. The truthiness branch at64–66 skips connection() and turns it into null. Both office-command and financial-intake then allocate reader+intake only and invoke operation with source:null. This violates the explicit required-source inventory and the comment/report promise to validate every selected string before any allocation.

Ordinary trigger: incomplete server-owned configuration using ''. No attacker control, authority bypass, SQL write, mounted production path, or economic mutation was established.

Actual offline reproduction on unchanged compiled modules and pg8.16.3:

| Route/partition                                | Callback | Pools/maxima | Result                    |
| ---------------------------------------------- | -------: | ------------ | ------------------------- |
| office-command / valid source                  |        1 | 3 / 2,2,1    | supported                 |
| office-command / empty source                  |        1 | 2 / 2,2      | CONTRADICTED; source:null |
| financial-intake / valid source                |        1 | 3 / 2,2,1    | supported                 |
| financial-intake / empty source                |        1 | 2 / 2,2      | CONTRADICTED; source:null |
| both commands / nonempty invalid source        |        0 | 0            | CONNECTION_INVALID        |
| both commands / null source                    |        0 | 0            | ROUTE_POOL_MISMATCH       |
| recovery and current-seat / null intake+source |   1 each | 1 / 2        | supported                 |

Every actual pg pool stayed totalCount=0 and ended. No connect/query attempted.
The reproduction helper exits0 because it asserts the observed counterexample; the required candidate property FAILS. Do not count this as acceptance PASS.

Minimal remediation requested to G: validate source whenever selected/non-null, rather than based on truthiness, before any allocation; preserve the reader-only routes. Add narrow regression cases on both command routes for empty, invalid nonempty, null and valid source, asserting zero allocations/callback on rejected configuration and exact2+2+1 on valid input. Rerun affected focused tests, strict types, scoped lint/format and diff-check. Supply a new immutable code/evidence pair for delta review; do not change source/clock/actor authority or move into3B to fix this.

## Supported boundaries, without broadening claims

1. **Host identity / default HOLD.** ServerCommandHostBinding=never, factory defaultnull, no positive issuer. Actual forged Proxy binding control has zero getter reads, diagnostics HOLD, openIntakeRequest null and idempotent stop. Module-private actual registry is distinct from isolated mechanism test registries; package subpath exports no registry or issuer. Copy/proxy/binding/generation rejection assertions were inspected. Positive production token issuance, binding and retirement remain unavailable, not tested or approved.
2. **Actual request completion integration.** Internal handler uses ExecutorRequestResourceScope; manual-runtime preflight source promise registers with actual Worker observer. API→Worker drain iterates to a fixed point before Worker resource-frame retirement, then all pool.end calls, then pending0 checks. Independent actual-frame control observes Worker settlement→late API settlement→pool end→closed, with no early end.
3. **Late connect / cleanup uncertainty.** Actual scope with a finite deferred port waits for a late connect, discards client before end, skips operation after abort. Pool-end failure still ends both owned pools once, sets cleanupFailed and leaves pending0. Provider release-failure/partial-scope assertions and actual internal-handler late-Worker integration were inspected. These finite ports are not native driver cancellation or guaranteed finite shutdown for arbitrary never-settling drivers.
4. **Existing semantics.** Original local/CI construction WeakMap, environment guards, PREPARED/READY restriction and existing UNKNOWN mapping remain source-visible. No query replay, alternative ledger or candidate-authority callback introduced. Null composition uses existing handler's exact-route NOT_CONNECTED behavior and remains unmounted.
5. **Pool inventory.** Valid command2+2+1 and reader-only2 controls pass; empty-source exception above prevents overall approval. Pool constructor laziness and totalCount0 prove zero connections in these controls, not SQL behavior or Cloudflare acceptance.

## Every role remains in scope, but not falsely marked complete

Canonical roles are independently derived from packages/core/src/authorization/offices.ts, not from the changed test list.

| Role         | Existing narrow evidence/path preserved                                                          | 3A completion claim                                          |
| ------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| CAPTAIN      | manual political-capital family/source-reader branch                                             | formal source/clock/actor + end-to-end production NOT_PROVEN |
| CENTRAL_BANK | manual OMO family/source-reader branch                                                           | formal source/clock/actor + end-to-end production NOT_PROVEN |
| FINANCE      | staged financial actions with original Office/action constraints                                 | full role workflow and production construction NOT_PROVEN    |
| INDUSTRY     | canonical capabilities/display contracts; no executable command family in current reviewed paths | MISSING_FAMILY; not completed                                |
| SOCIAL       | manual employment-service-plan family; no new automatic match publisher                          | formal source/clock/actor + full role workflow NOT_PROVEN    |
| TRADE        | staged financial actions with original Office/action constraints                                 | full role workflow and production construction NOT_PROVEN    |

The financial transport contract supports only FINANCE/TRADE and explicitly leaves four Office action arrays empty; manual capability/factory selection covers CAPTAIN/CENTRAL_BANK/SOCIAL, not Industry. Shared identity/resource plumbing covers neither all business families nor all role workflows. Nothing in61+110 or the mechanism registry proves all six constructed/activated.

## What actually ran and what was only inspected

**F independent checks**

- Exact immutable pins/parents/trees,12 source hashes,4 evidence hashes,432 manifest entries, six copied-module hashes, clean WT and diff-check: passed.
- Node24.20.0, actual pg8.16.3, fourteen bounded controls in a disposable managed temp directory, environment stripped, OS sandbox denying all network and non-temp writes; subject modules copied without edits and linked through vm modules. Twelve observations support stated mechanisms; two empty-source observations contradict the required contract. No DB credentials, SQL, native deadlines or production issuer.
- Assessment schema validator exit0.
- Helper/copy bytes and raw outputs/attempt history retained alongside this report.

**G supplied evidence, not rerun as F native/integration acceptance**

- Final focused61/4files and existing local-CI110/4files: PASS; constructor29 and added completion2 assertion scopes inspected.
- Earlier boundary/foundation40/3files retained separately; later final static scans passed. Do not relabel earlier tests as exact-final-head execution.
- Selected final strict TypeScript, prior G strict config, scoped ESLint/Prettier, boundary/authoritative/secret scans and safe-environment NOT_LINKED/databaseConfigured=false receipts inspected.
- Core→Worker→API recorded builds and pre-test432 manifest inspected; no independent rebuild performed.
- Distinct provider suite total211; intermediate51/59 or matrix assertions are not added again.

**Failure history retained**

- G initial strict cast, unused-parameter lint, unresolved Worker root import/config, test callback arity and formatting failures remain in original evidence; only recorded actual passing reruns count.
- Original offline install transcript is not included; report's161 reused/0downloads is not independently attested.
- F initial oversized pin output was truncated: UNKNOWN/PIN_OUTPUT_TRUNCATED, not PASS. Final helper suppresses detailed dist output only and hashes all432.
- F final-pin first invocation omitted WT argv: tooling error, subject not evaluated; corrected invocation completed.
- F first isolated execution denied metadata lstat /Users/samuel: unavailable execution, not subject failure. Narrow file metadata permission added; content denial, network denial and write confinement preserved; then completed unchanged helper.
- Prior native stall root cause remains NOT_ESTABLISHED; old missing pre-run dist receipt remains unresolved. New manifest does not repair that historical evidence.

## Risk / ownership / stop point

Patch impact high; regression likelihood high due reproduced bounded defect; protection partial; recovery easy (unmounted source-only, no persistence change); confidence high for this narrow decision. Auto-merge excluded by privileged boundary, shared runtime, public export and architecture-specific rollout. Assessment JSON contains counterexample/control for each boundary.

Formal source constructors, Clock/actor issuer, admission/preflight, actual production token retirement, startup/consumer host, E actual authorization SQL, D lease/source/once-FINAL/projection, native PostgreSQL/driver, real5s/10s timers, workerd/Linux topology, CI, full/full420 and Gate B: **NOT_RUN / unavailable / outside3A**. Full six-role construction is not approved.

F changed no source, tests, status/progress, maps, original site, migrations, grants, schema, production data, configuration, deployment, push or merge. This skill preserved the subject and placed review artifacts outside its checkout. No work advanced into3B/4/5. Review frozen and STOP.

## Retained machine evidence

- [Validated assessment JSON](./F_ASSESSMENT.json), SHA256 390688b6b0955444ae9422a4def407bb5dee776d49a9624646f790e2cdbf34f4.
- [Immutable pin control](./F_PIN_CONTROL.json), SHA256 17f119b99952dd4fe01115811ad1a863e73ae40da2218aff2da3b68a47c63da8.
- [Actual independent controls](./F_INDEPENDENT_CONTROL.json), SHA256 6f6fa17f9b38f0ced5b0e8f9ac7ffe6823622d2614530db7dae36548c1b9611c.
- [Byte-identical copied-module control](./F_COPY_PIN_CONTROL.json), SHA256 227ef884480d20ab28fbc5be8de76f40ba7d49db5d768d935bfb39f851c0aea1.
- [Execution history, including initial failures](./F_EXECUTION_HISTORY.json), SHA256 f118bcf1cf47ebd4b4b967d761fb63d29a8bfade911c9930e5718d8f78740a6d.
- independent-control.mjs SHA2561245a6ff9987475dd37895c197fcf3120d664abb85321939ec4027e60a6ed097.
- pin-control.mjs SHA256952f015667e9afa52f8343f27edf7d6005e227732b630d2f5527e905019b1c91.
- copy-pin-control.mjs SHA256845c9adfe5b1a322ed7623c72f41d6ef284f1492aa4164124c2403dffa32d98c.
