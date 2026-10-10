# D independent review — F provenance repair delta

Date: 2026-10-10. Decision: **APPROVED**, bounded P0 evidence/test delta only. No Blocker/Major established. Skill recommendation: merge / human_review_required. This advice is not merge permission.

## Immutable identity

- Repository: https://github.com/samuelq800/econmind-os-world-simulation.git
- Subject: /Users/samuel/Documents/econclub/.econmind-worktrees/f-v29-native-worker-sequence
- Base: d9853754b3eb2080a5ac4d30c71cae4db013fe0c (tree fb2b1f8fc82a9228f40f38c6b13890ea0b44eea4).
- Code commit: 86af039a8340a0220752b3f5038f52012ad37273 (tree 1002c1c1b87becb6b98db8dd78746d9665526d4b).
- Final tip: 23fe8e5d0b27aa72b9d6ee925c5eba76756467b4 (tree 92ad0db36de914c45c91ab0e56ccd6ca49a43886).
- Full-index binary delta SHA256: e2c8ae2e1f49e18b397f81ec4b9fdf543d541be742d694656f521f985a86e0ab.
- F report SHA256: 2b168a476377a96d000165bb5157eef54afd8190c659422cd3af2e1bd3745a7c.
- Actual two commits inspected. Exactly 3 files: helper, 7-line beforeAll guard addition, report. Final commit is report-only; complete executable inputs equal code commit. Subject clean before/after. Original d985 report and tests' existing assertions unchanged; no production implementation, migrations, governance, dependency/lock, preview or map edits.

## Findings and evidence

1. Helper binds actual 153 source-file bytes to immutable Git blobs (replace objects disabled), not just HEAD. Package exports/build configs/test/helper/lock are included. It captures all 280 regular Core/Worker dist files with bytes and SHA256; symlinks rejected. Actual @econmind/core export resolves to this checkout packages/core/dist/index.js, 2518 bytes, SHA256 dd7e821b5a29b5a08f61afd4e66469ecc6ece7573eb1da0e889ff2af40fe111e. Native test SHA256 bec7f77b6f8d2a2d7d364bd90ea7d0facd7362b1f41bee04fc6480838f140e5d / blob b7da7d97bece7c8920252e455adee8d6a57e02d2 matches final tip.
2. New guard runs before connect()/SQL when OWNED_FRESH_GENERATION is enabled. It validates owned manifest path, exact expected bytes hash and deep equality of fresh capture. Existing environment/actual-server guard then runs before DDL. Module imports occur before beforeAll; this is trusted-harness provenance, not execution isolation from malicious packages.
3. Directly retrieved F's producer tool history from thread 01a09447-8a5d-7550-a45f-10edbc9f0ec1. Existing ignored dist moved to owned backups, both output directories asserted absent, Core build exit0 (item52), Worker build exit0 (54), manifest capture exit0 (57), positive/wrong-hash control (62), native invocation exit0 (64), strict TS check exit0 (65). Ordering is independently observed in original task history, not inferred from report prose or file mtimes. No build/native rerun by D.
4. All 7 raw package SHA256 values match F report. BUILD_PROVENANCE c9c4c953231fd2f34f9f3d43dff5284ae55c1b647fac65b84755015f3b3dcf8f; NATIVE_RESULTS 511f802285cf2af00413be8b5aaa817f11d69fad3a407a91f837cc7447f12498; NATIVE_EXECUTION ba6bb0f987a034e1461b0e30a31c58c9508913b4327dd572702a94a69aadbdf5; PRE_MUTATION_READONLY 43cb9a0c530658ef2994e1bb564273e35cb0ee1b58fa2ff6cc45cecf35712af9; POST_FACTS_READONLY fb0af3a5cd2bdcf97e3781241311475b7dacd914a937bfcd2bcebe02772c6b4c; STOP ce364b6d61bd6e6186be0f6e85f0a796ec80e01306be33bf0351895d670ed742; CLOSURE 35c3b0c98b9d47d8dc43c6449b46cdf5aaa744f5de820632c5fdcfa15f726e29. Actual bytes retained in raw/.
5. New owned PG16.15 generation system7694999330990948403, 127.0.0.1:61227, database econmind_v09_f_claim_20261010, pgdata under .91tvbm. Original pre-read and native guard agree on actual identity, empty World/public schema, UTF8 and no sockets. Original native JSON has 2 PASS, 0 FAIL, 0 SKIP (one test file; Vitest suite count includes nested suite). Binding log precedes identity and DDL. Post-read has RECOVER=new/fence2/attempt2 and ACTIVE=old/fence1/attempt1; both heads version/eventSequence0; events/receipts/outbox/inventory/financial0. Current read-only pg_controldata independently reports same system ID and shut down; uid501/0700 root/data, no listener. No new SQL/connection by D.
6. Independent network-denied, credential-free disposable copy at exact tip reproduces complete manifest equality and nine checks: valid capture/manifest, wrong hash, missing hash, old source commit, extra dist file, dist symlink, redirected Core export (fresh child process), restored capture. All PASS, zero DB connections. Exact stdout retained in controls.json.
7. Strict original native-test tsconfig passes isolated with Node24.20.0, strict=true, skipLibCheck=false. Initial isolated attempt lacked decimal.js linkage; after linking original installed Core dependencies, exit0. This was reviewer setup, not hidden candidate failure. JS helper inherits allowJs=true/checkJs=false: do not call this an independent strict-JS typecheck. Original focused lint/format/boundary/env checks were observed, not rerun or expanded.

## Risk and applicability

P0 review retained. Impact high (false provenance could mislead privileged recovery acceptance), likelihood low, protection partial, recovery easy, confidence high for this bounded delta. No production caller of helper found. It performs only local Git/file/resolution reads and does not compile, execute SQL or grant release authority. Revert only test/evidence files; no migration or production persisted-state change.
Strongest counterexamples and legitimate controls are in assessment.json: manifest/source/dist mismatch, path/symlink/export redirection, old build/generation reuse and acceptance-scope overclaim. All supported within the normal trusted harness.

## Limits / stopping point

- This closes the pre-run build-provenance gap only for this new .91tvbm invocation. It does not retrospectively repair the old KgSwqT run; prior independent review/report and historical FAIL/INSUFFICIENT remain unchanged.
- Capture is HASH_BINDING_NOT_BUILD_REEXECUTION_OR_GATE. Compilation ordering uses actual producer records. Not a hermetic build attestation: installed compiler/dependency bytes are not fully hashed; Git tracked-input set is not a defense against concurrent malicious build-environment mutation.
- Synthetic claim/empty economic facts; not populated settlement, OS crash, production restore, formal six-role flow, staging/TLS or Gate B. Those remain separately unapproved.
- No native/full/420 rerun, production access, subject edit, push, merge, deployment, activation or preview change. Existing Captain4198 left untouched.
- assess-patch-risk required immutable binding, isolated failure controls and separate impact/protection ratings; these constrain the APPROVED scope. JSON schema validator exit0.
  STOP.
