> Presentation copy of an independent review, not a new root review.
> Original source: `/Users/samuel/.codex/state/plugins/codex-security/scans/g-constructor-3a-20261010/artifacts-a69e5e2691a02746f8e7236c0df7ee576d3b8c26bd1f6f9ea752668f1f5234b6/artifacts/F_G_F_G3A_01_DELTA_REVIEW_20261011/F_DELTA_REVIEW.md`
> Original raw SHA256: `fde1f9462adb47357fa0ec031701834c6602818cc9dc836ee3bb64dd75906813`

# F — F-G3A-01 independent delta closure

2026-10-11 · SOURCE_ONLY / UNMOUNTED / HOLD

## Decision and exact authority boundary

**F-G3A-01: CLOSED on code ea0632c7e8e5e0249ec0a886e05b7867e41e5a58.**
**Overall repaired3A: APPROVED_WITH_EXACT_BOUNDARIES / SOURCE_ONLY_INTEGRATION.**

Patch-risk recommendation **merge**, workflow label **human_review_required**: this means the immutable correction is supported for Root's governed source-only integration disposition, not that F has merged it or granted release authority. Overall3A retains its P0 identity/Command boundary. Finding priorityP2 and the bounded delta impact do not grant fast-track.

This decision combines the prior3A review's supported mechanisms with this sole-finding delta. It does not re-review1/2/design or turn the original candidate into an approved one. Original code a2d59abfc768cc93744a7a2b82af514a7f12c84b, its CHANGES_REQUIRED report, failures and evidence remain literal immutable history. Only this new candidate closes the defect.

**No3B/4A/4B/5 authorization. No formal source/clock/actor issuer, positive production token issuance/binding/retirement, admission/preflight, consumer startup, mounting, deployment, native/platform acceptance or Gate B approval.** Root must retain SOURCE_ONLY_UNMOUNTED_HOLD/defaultnull; source-only integration must not install production authority. This review does not execute a merge, push or promotion.

## Immutable pins

- Repository: https://github.com/samuelq800/econmind-os-world-simulation.git
- WT: /Users/samuel/Documents/econclub/.econmind-worktrees/g-constructor-3a-20261010
- Baseline evidence: af005fb71545373542a5bd0565877b37e2580439, tree e3b46c9812febfa7179238bb2e3ba79170d8c484.
- New code: ea0632c7e8e5e0249ec0a886e05b7867e41e5a58, tree 96dffcc4b41c077d5a775f5d27a5e40c50ccbeab; parent exactly baseline.
- Evidence tip: 45ff2dd37504c111312b2dc708c599af31c07482, tree c0b7ca750ffde119a4c596b2b6dc8d2d48c37044; parent exactly newcode.
- Full-index binary diff base..code SHA256: e457d44d8679f9b2a9de0057ac24a7ea885a7b2b12b95f08a039a7aa2cb49aa5.
- Code delta exactly3files: one product helper condition, one new10-case regression, one strictinclude.
- Evidence tip exactly3new G documentation/manifest files. Original4 G evidence files, original F report and other ten original3A source/test/package files unchanged.
- Final identity checked atHEAD; clean WT and diff --check exit0.

| Changed source/test/config                                          | Bytes | SHA256                                                           |
| ------------------------------------------------------------------- | ----: | ---------------------------------------------------------------- |
| apps/world-api/src/runtime-preparation/cloudflare-postgres-pools.ts |  6399 | f9dd47772184cded29d1638b7a9416297a100a32933e846f0049f7a1462ea86b |
| tests/world-api/G-source-pool-delta.test.ts                         |  3933 | 6483d9cfc07d82e071c1861731da27212b7431aded3e6ed30e27031eeb6f900e |
| tests/world-api/tsconfig.G-constructor-3a.json                      |   261 | e5bbe5f49227a38ac468825762e4f517edfac80e71cba82c628d915f885de034 |

| Delta evidence                                                                                 | Bytes | SHA256                                                           |
| ---------------------------------------------------------------------------------------------- | ----: | ---------------------------------------------------------------- |
| docs/reports/start-ready-20261010/G/F_G3A_01_DELTA.md                                          |  5232 | 6efc94990628aea2a0ff811b66e26712451bafb813b0a9e34b2dd99b3fe07048 |
| docs/reports/start-ready-20261010/G/F_G3A_01_DELTA_EVIDENCE.json                               |  7319 | ab44735c976d78e935501ef4eb20d911478ba0599ae8fb59816add76b9b94c33 |
| docs/reports/start-ready-20261010/G/constructor-3a-checks/F_G3A_01-pre-test-dist-manifest.json | 73515 | b2d6e93eaecbba371ed3fffe29d0c64ba02c3f24762da75e90c59f6e73acd3f9 |

## Source finding closure and actual control

At [cloudflare-postgres-pools.ts:64](/Users/samuel/Documents/econclub/.econmind-worktrees/g-constructor-3a-20261010/apps/world-api/src/runtime-preparation/cloudflare-postgres-pools.ts:64), source selection now tests **!==null** before connection(). Empty selected source therefore reaches the existing URL validator and rejects before scope/pool allocation. Nonempty invalid source still rejects there; command null still rejects earlier route pairing. Valid source remains mandatory and allocates exactly reader2,intake2,source1. Reader-only null selection does not call source validation.

No changes to existing host/private registry,issuer,clock,actor,runtime identity,source authority,command consumers,API/Worker drain/retire/end ordering,budget,UNKNOWN semantics,no replay,route allowlist,entry/config,SQL,ledger or persistence. Exact diff and unchanged source/generated hashes establish preservation; this is not a fresh runtime attestation of those unchanged paths.

F independently executed unchanged manifest-bound copies of six compiled modules with actual pg8.16.3 Pools and a constructor observer, Node24.20.0. A separate original pool-helper copy has the previous retained hash79d610ffb098d5a75e68fef93bc01459bb2864eeee6e8af3081d682b300a1e1e; its other modules are unchanged.

| Revision/control                        | Allocation/constructor    | Callback   | Outcome                    |
| --------------------------------------- | ------------------------- | ---------- | -------------------------- |
| Original office empty source            | 2, maxima2,2; source:null | 1          | old defect reproduced      |
| Original financial empty source         | 2, maxima2,2; source:null | 1          | old defect reproduced      |
| New office empty / invalid / null       | 0 for each                | 0 for each | rejected before allocation |
| New financial empty / invalid / null    | 0 for each                | 0 for each | rejected before allocation |
| New office / financial valid            | 3 each, maxima2,2,1       | 1 each     | correct non-null source    |
| New recovery / current-seat reader-only | 1 each, maximum2          | 1 each     | intake/source null         |

**10/10 current candidate controls pass; two old counterexamples reproduce.** These are12 bounded observations, not12 newly accepted product tests. All actual pools that were created ended and remained totalCount0. No connect or query was invoked. Empty/invalid diagnostics remain credential-free.

Execution used a disposable managed directory, byte-identical copied subject modules, stripped environment and TEST_ONLY URLs; OS sandbox denied all network and confined writes to that temporary directory. VM linking is for unchanged import resolution, not the security boundary. Raw F output and exact command are retained. No F subject-execution failure occurred in this delta.

## Dist / provider test evidence and honest limits

Current432dist entries independently match the frozen delta manifest; aggregate
**1a6788288e06ebb5031141aa399c035df8c71b5671fd4f6be09d247b82ba10d4** = SHA256(compact ordered file-array JSON,no trailing newline).
Compared with original3A manifest, exactlyone entry differs:

apps/world-api/dist/runtime-preparation/cloudflare-postgres-pools.js,
5135bytes, SHA256 ebd4fc0fe65fd62e5a8b4f74f216d996414de1c1f007bc3045e7696fc8fe362d.

Other431entries, including declarations and Core/Worker bytes, are unchanged. Copied execution modules are checked against both current files and that manifest before executing. This binds present bytes to the retained pre-test manifest, not an independently repeated build or retroactive repair of an older packet.

G's frozen evidence was fully read and checked:

- Actual final affected suite: **18PASS /21 deliberately filterexcluded**, twofiles. Ten new matrix cases plus eight existing route controls. Excluded identity/completion cases are not delta passes.
- Final strict TypeScript config includes new regression and retains skipLibCheck=false.
- Final scoped lint,Prettier,diff checks exit0. These are provider receipts,not F reruns.
- API-only build twice around formatting repair; final build exit0. Core/Worker not rebuilt.
- G's pre-fix red result **2FAIL/8PASS** is a retained substantive tool-output summary, **not a full raw transcript**. F's fresh baseline pair provides independent actual red behavior without pretending the old raw log exists.
- G's first formatting failure is retained; corrected API rebuild and final focused/strict/style reruns are separately recorded.
- Original61/110 evidence remains historical original-candidate evidence, **not rerun on this delta** and not added to18. Prior40 boundary suite likewise not relabeled as new execution.

Native PostgreSQL/driver/SQL,real5s/10s budgets,CI,workerd,Linux topology,full/full420,new boundary/environment suites,formal source admission/preflight/issuer-token/startup and3B/4/5: **NOT_RUN/outside this delta**. Pool totalCount0 proves no connection here, not native SQL correctness,Cloudflare support or real deadline enforcement. Arbitrary never-settling driver closure remains unproved. Prior native stall rootcause stays NOT_ESTABLISHED; earlier missing pre-run dist evidence remains unresolved.

## All-role and ownership boundary preserved

CAPTAIN,CENTRAL_BANK,FINANCE,INDUSTRY,SOCIAL,TRADE all remain required. Neither financial transport nor this common resource fix completes their workflows. The prior six-role matrix is preserved; **Industry still lacks an executable command family in reviewed paths**. No all-six-role production construction/activation claim is approved. E actual authorization SQL,D authoritative lease/source/once-FINAL/projection and all other owner prerequisites are untouched.

F used the read-only assess-patch-risk workflow, preserved the subject, performed only the small offline mechanism control, and stored evidence outside the checkout. No implementation,test rewrite,status/progress,production,DB,grant,schema,migration,map,legacy-site,config,push,merge or deployment action was taken. No other windows are awaited.

## Risk assessment and retained records

Delta impact moderate (bounded server-resource contract), likelihood low after actual closure controls, protection partial (no native/platform/formal proof), recovery easy, confidence high. Enclosing3A remains P0; automatic merge is excluded. No decision-critical unknown remains **for this source-only delta approval**, not for production activation.

- [Original immutable CHANGES_REQUIRED report](/Users/samuel/.codex/state/plugins/codex-security/scans/g-constructor-3a-20261010/artifacts-a69e5e2691a02746f8e7236c0df7ee576d3b8c26bd1f6f9ea752668f1f5234b6/artifacts/F_G_CONSTRUCTOR_3A_REVIEW_20261010/F_REVIEW.md), SHA256 07aec25a71b653a4f2460f39f950b590c10329acc5087fa8e866bfb529761f38.
- [Validated assessment JSON](./F_ASSESSMENT.json), SHA256 6bdd0c1e3b5339f1d8903e8ae2d6fc2b7d498ae834e9863e1861217d644de5c6.
- [Exact pin/hash control](./F_PIN_CONTROL.json), SHA256 aa64f97782227625b9b7564adf7673126ec025a074c0af79dce49ff08360137d.
- [Actual independent controls](./F_INDEPENDENT_CONTROL.json), SHA256 efef2302725a59d560b9858c88e23e25cd07aadc94933c59512750800347cb2f.
- [Raw execution receipts and commands](./F_EXECUTION_RECEIPT.json), SHA256 67d3fb07df070e1910f3e82384924871660d144c2dd7ccc3ea7bf5ce4cbb9bd2.
- gd-pin-control.mjs SHA256 ec559573225fcdd17c99f24672c9202bec96e2640e8ab1956f7161f0a2a14abc.
- gd-boundary-control.mjs SHA256 40178996d03e57702efac1f622663e88e36465f259f537f273d6d78d84377fac.
- Actual baseline/candidate module copies retained alongside these helpers.
- Assessment schema validation: actual exit0.

**STOP: frozen delta closure and source-only integration recommendation returned to Root.**
