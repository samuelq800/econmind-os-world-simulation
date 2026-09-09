# Gate A mainline reconciliation

## Result

```text
Gate: A
Decision: PASSED
Authority: PROJECT_OWNER_ACCEPTANCE
Accepted code candidate: 47fe5c5d465748370d9a8ea046bc443978437203
Acceptance record: 71160c2735f3e21367822717663074b7df307df5
Mainline merge: 676c5dfb358edda5c25e9bb308242c533783dba0
Runtime equivalence: PASS
Post-merge normal baseline: PASS
```

The history-preserving merge into `main` contains the accepted Foundation
candidate and its Gate A evidence. Comparing the merge result against
`47fe5c5d465748370d9a8ea046bc443978437203` across `.env.example`, `apps/`,
`database/migrations/`, `packages/`, `scripts/`, `tests/`, `package.json`,
`pnpm-lock.yaml` and `pnpm-workspace.yaml` produced no differences. The only
later changes were governance, status and evidence records.

## Standard verification

Environment:

- Node `v24.20.0`
- pnpm `12.3.4`
- frozen lockfile
- production access: false
- database mutation: false

Results:

- `pnpm install --frozen-lockfile`: PASS with the pinned runtime.
- `pnpm check`: PASS.
- lint and formatting: PASS.
- five workspace typechecks: PASS.
- full tests: 17 files, 288/288 PASS.
- protected boundary suite: 3 files, 34/34 PASS.
- authoritative pattern and boundary scanners: PASS.
- local environment safety: PASS; no linked Supabase project.
- migration validation and ephemeral PGlite rehearsal: PASS.
- Foundation policy and repository secret checks: PASS.
- all workspace builds: PASS.
- `python3 tools/validate_r2_governance.py --json`: PASS.
- `git diff --check`: PASS.

An initial install invocation used the pinned pnpm entry point but inherited
ambient Node `v26.5.0` for lifecycle scripts; the repository correctly rejected
it because Node `v24.20.0` is required. Re-running with the pinned Node binary
first on the child-process path passed. This was an execution-environment
correction, not a source change.

## Boundary after merge

Gate A is complete. Standard engineering verification remains active; new
extreme or open-ended adversarial probing is not required by owner policy.
Existing tests and known regressions remain mandatory.

V06 implementation has not started. ADR-01 and ADR-03 remain
`PROPOSED_NOT_APPROVED` and require the responsible human owner's explicit
decision.
