# World Core planning reconciliation

## Bound revisions

- Gate A reconciliation baseline:
  `a4541fead8452ce6a76d59782d37f8536dedf6dd`
- Planning source branch: `codex/world-core-planning`
- Planning source commit: `b803e28a3e225842bf2a70d67f492242dfe359c0`
- History-preserving planning merge:
  `279d70462c52370d5357d1072aedf633266cc51d`

The merge introduced only the named World Core planning, architecture, testing,
governance-draft and control-prompt paths under `docs/**` and
`prompts/control/WORLD_CORE_SPRINT_V06_V10_4.md`. It introduced no
`apps/**`, `packages/**`, `database/**`, status, runtime configuration or
lockfile change.

## Reconciled lifecycle

- Gate A: `PASSED`, authority `PROJECT_OWNER_ACCEPTANCE`.
- Foundation V02.1-V05.3: `VERIFIED` and merged into `main`.
- World Core V06.1-V10.4: `PLANNED`.
- Active continuation route: normal per-step lifecycle; each hard dependency
  must be `VERIFIED` before its dependent step begins.
- `WORLD_CORE_BATCH_CANDIDATE_POLICY_DRAFT.json`: `DRAFT_NOT_ACTIVE`.
- ADR-01 and ADR-03: `PROPOSED_NOT_APPROVED`; V06 remains `NOT_STARTED`.

The planning preserves all seven Gate A remediation contracts and retains the
existing invariant/attack matrices as ordinary regression evidence. It does
not require new open-ended adversarial discovery work.

## Validation

- governance validator: PASS
- formatting: PASS
- JSON policy draft: retained and inactive
- diff hygiene: PASS
- production access/mutation: none
