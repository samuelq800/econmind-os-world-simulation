# C-DIAG-01/P2 — immutable revision handoff

2026-10-11, Asia/Shanghai. Producer C. **IMPLEMENTED_UNVERIFIED / ORIGINAL_B_NARROW_RE_REVIEW_PENDING / CI_CAUSE=OPEN**.

## Fixed identities

- Exclusive WT: `/Users/samuel/Documents/econclub/.econmind-worktrees/c-bootstrap-lifecycle-ci-fix-20261011`; branch `codex/c-bootstrap-lifecycle-ci-fix-20261011`.
- Original base remains `5dca519927fbc3915a5459be77e0779dc14a5072`; tree `3dd03c5ef746767e6c5755d44f0a3223e2869480`.
- Rejected revision parent remains `88c74977abef22039bb7adde11215beca92054a6`; tree `bdcd8180091c487e84062bfa7964c88bc047caf1`.
- New implementation/evidence commit `a239488606c6e6cee0c539bf947ddcfd596e71a6`; tree `bf28a7bb9b8b16b3be9683bcab25e3da9cd6c6c6`.
- Revision-parent→implementation canonical diff SHA-256 `4e943c0b1cde494226e2e2dc50e7ba59e4f4dd5fdf88299a57cd309e7d01cc1c`.
- Original-base→implementation canonical diff SHA-256 `93d3e6abd1e0dd766717dbb3d275cb6ba7754410a4833b1a9ff5a437c0e04d74`.
- Canonical diff: raw stdout of `git diff --no-ext-diff --binary --full-index --no-renames --no-color <base-or-parent> <tip>` hashed with SHA-256.
- Delta report SHA-256 `af896a8b2fcc6f4464a4b2cb5eee4879e7b3895f4a223aaa3adc021df622070e`.
- Final tested lifecycle file SHA-256 `5d889b9a00121d1af79b3fd78eaea8b5116ff0bf703609235beae43ec093889e`; wrapper `7e852e43ba05739bcee4fff66ce3feae9e66343c7eb62d74357a804cde3e3f1d`; C pipe control `5501c93d30bc06b92ee3f6bc3db6418621a888fd9d1e75616c79acfb854b3851`.

This separate commit adds only this new freeze note. Final tip/tree and both complete final diff hashes are supplied externally in the final handoff, avoiding self-referential hashes. Review the fixed final tip, not a moving branch.

## Narrow correction and real evidence

Parent exit and stream close are independent. Helper output draining uses the existing remaining wait deadline. Wrapper run/drain deadline expiration reaches owned TERM→KILL and evidence finalization without requiring close. Original exit, available output, drain/cleanup timeout and cleanup errors remain visible together. Caller cleanup preserves both original and cleanup failures; Web resource cleanup no longer silently drops exit/drain failures. No original READY/TOCTOU/startup/exit/cleanup timeout is increased; wrapper TERM grace remains 2000 ms and post-KILL allowance 250 ms. No product launcher, original fixture or manual rowCount change.

Actual final `c-diag01-final-lifecycle-v3`: **20 PASS / 0 FAIL / 0 SKIP**, exit 0, 21.35 seconds; final strict TypeScript, bounded ESLint, Prettier and staged diff checks passed. All original 14 cases remain plus six bounded ordinary pipe/wrapper/error-composition cases. Four finite local invocations, their intermediate revisions, and the initial lint FAIL are retained in the new delta report, not converted into final-code or full-CI evidence.

Final C raw directory: `/Users/samuel/Documents/econclub/.econmind-artifacts/c-bootstrap-lifecycle-c-diag01-20261011`. Final log SHA-256 `804dcf964b64575101efacf368bc0501f4cac1556267c4f04c36f814cab482d3`; final outer process record `5b8b662284060c2d4821f7b97ad07bc9e59bdb275afe6e7dcaaa9ac1f42c2d43`. Fourteen explicitly listed raw evidence hashes were compared to actual bytes successfully.

Final helper held-pipe control returns at its bounded 100 ms wait (asserted below 1500 ms, before close) with original parent exit 1, available output and drain timeout. Fast-exit controls retain final stdout/stderr. Inner wrapper held-pipe control retains exit 1 and drain timeout, escalates only its observed child TERM→KILL, records 1→0 leftovers. Inner run-deadline control escalates its observed parent/child and records original SIGKILL result plus run timeout and 2→0 leftovers. Both return nonzero with finalized evidence, not false success. The final **outer** wrapper has no fallback signals/errors/timeouts and zero observed leftovers; this does not erase deliberately executed inner-control signals or imply exhaustive process sampling.

## Preserved negative authority and stop

B's prior **CHANGES_REQUIRED_LOCAL**, C-DIAG-01/P2 report remains unchanged at `/Users/samuel/.codex/state/plugins/codex-security/scans/c-bootstrap-lifecycle-ci-fix-20261011/artifacts-4a8acd8825b2319da72d38eba60dea9f2d1dc0d6b42533977e7a336ebb491ae8/artifacts/B_C_BOOTSTRAP_DIAGNOSTIC_REVIEW_20261011/review.md`, SHA-256 `57fb2c1d6f31cb58e21b5de1549082ee9ecc3ecfca7b7150c6ac349a7efe46fb`. C does not award closure. Old C DIAGNOSIS/FREEZE and evidence stay unchanged.

Both original full failures remain: run `38124279363` **3351/1/258**, log SHA-256 `98a01122e98e24a4b06be13e1a7fa8e2ca5542d5733617c5eb52fa376cfcfe29`; run `38126263727` **3351/2/258**, log SHA-256 `b57f844c512fd6c520e4aaff93f7a5dee17e0af93e51ce8d64635df34bd5ba92`. Historical bootstrap CI cause is still OPEN; this concrete local repair is not its explanation.

Changed paths relative to rejected parent are only the lifecycle test, C wrapper, C pipe control, new C delta report and this new freeze. Root WT, B-owned files, O/manual work, launchers, original fixture, Core/runtime/SQL/grants/status/configuration remain unchanged. No shared/user process kill, production, credentials, database, Industry T1, World Clock, economic timer, full official/CI rerun, push/merge/deploy or activation.

Deliver this immutable delta to Root for **original B's narrow re-review only**, then STOP. No peer-message tool call, self-approval or automatic continuation.
