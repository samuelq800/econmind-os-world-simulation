# V08-AUTH-MAJ-01 forward-fix evidence

## Immutable implementation candidate

- Review B binding base: `5c8fbece451e4d7f26b5e3e4ad50e7e553a46f71`
- Preserved prior code candidate: `0e9d6f6dfe5fbb7cbf6e74463cc6e60fe0298095`
- Preserved prior evidence target: `9d1c6d76e752b669597101ca2e4fd431c4b2b7b5`
- Forward-fix code candidate: `c5ea104213b65763c4ce2959eafae96ddbb41f86`
- Finding: `V08-AUTH-MAJ-01`
- Status: `FORWARD_FIX_READY_FOR_FRESH_REVIEW_B`

The preserved Review B decision is `CHANGES_REQUIRED` with zero blockers and one
major. This forward fix does not amend or supersede that failed decision.

## Exact change

`validateAuthoritativeTransition()` now rejects any `commandFingerprint` that
does not match the existing canonical `sha256:<64 lowercase hex>` contract. The
failure uses `TRANSITION_EVIDENCE_INVALID`. The downstream
`bindAuthoritativeTransition()` recomputation and exact Command/world/expected
WorldVersion checks remain unchanged.

A direct package-root regression rejects malformed, uppercase and truncated
fingerprints and accepts a valid canonical fingerprint.

## Focused verification

- Transition/rebuild/root-export matrix: `3 files / 29 tests PASS`.
- `@econmind/core` typecheck: `PASS`.
- Changed-file ESLint: `PASS`.
- Changed-file Prettier check: `PASS`.
- Authoritative-pattern scan: `PASS`, 30 core files / 42 total, zero violations.
- Repository-boundary scan: `PASS`, 47 files.
- `git diff --check`: `PASS`.

## Boundaries

- No migration, RLS, grant, Supabase, production or main-site change.
- No V09.2, V09.3, V10 or V11 work.
- No full-suite, network, stress or high-concurrency run.
- This evidence is an implementation claim, not approval.
