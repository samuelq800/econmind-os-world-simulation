# FAST_MAINLINE governance patch

- Policy implementation commit: `f41af6fa8951ef1ad143e300312d9f648ef1cb21`
- Active policy: `docs/governance/FAST_MAINLINE_REVIEW_POLICY.json`
- Scope: governance, prompt generation, templates, and read-only validation only
- Effective risk: `P2`
- P0 boundary changed: no

The policy centralizes risk classification and review timing without changing
the Constitution, runtime behavior, database, RLS, identity, command/event/
receipt authority, ledger, settlement, conservation, writer semantics,
production environment, determinism, idempotency, or cross-country settlement.

P0 remains blocking: automated evidence is necessary but never sufficient, and
independent approval of an immutable candidate is required before verification,
merge, or dependent implementation. Owner fast-track is validator-limited to
P2/P3. P1 may defer independent review only to a named Work Package gate.

The 101 prompts are now rendered from `planning/r2_steps.json` by
`tools/render_step_prompts.py` and defer lifecycle semantics to the centralized
policy. The original R2-101.1 hash manifest remains historical evidence and was
not rewritten.

## Validation history

1. The first aggregate check exited `1` because ambient Node/pnpm were rejected
   (`24.19.0` / `11.19.0` versus required `24.20.0` / `12.3.4`).
2. The first pinned-toolchain run exited `1` at `format:check` for
   `docs/governance/r2/README.md`.
3. After formatting that file, the pinned aggregate check exited `0`: 8 test
   files and 92 tests passed; the boundary suite passed 29 tests; environment,
   secret, build, lint, formatting, and type checks passed.
4. `python3 tools/validate_r2_governance.py --json` exited `0` with all 11
   governance checks passing and `review_mode=FAST_MAINLINE`.
5. The renderer was rerun before commit and produced no semantic drift.

Historical failures above are retained as failures, not rewritten as first-pass
successes.
