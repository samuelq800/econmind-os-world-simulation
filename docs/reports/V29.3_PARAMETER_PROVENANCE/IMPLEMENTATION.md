# V29.3 numeric-parameter provenance preparation

## Immutable identity and status

- Branch: `codex/v29-3-parameter-provenance-preparation`.
- Mainline base: `22369f8cdfee80c6a2b8fb7c67761350b516b738`.
- Plan commit: `2a862775e61d4deca344712a66316615e5bf7a6d`.
- Frozen tool/test commit: `e35d31afa34be2c8e90d1e76e57df9ab0b640716`.
- Frozen code tree: `c70cbae42eef53bf5fceb69d4b12c3fa36816171`.
- Classification: `IMPLEMENTED_UNVERIFIED / PREPARATION_ONLY_NOT_V29_APPROVAL`.
  Formal V29.3 and its dependencies remain unchanged in
  `status/progress.json`.

## Delivered boundary

`tools/v29/parameter-provenance-preparation.ts` is a pure in-memory structural
tool. It accepts caller-supplied source availability, source ID, SHA-256 digest,
locator, time range, parameter availability/value/unit, source bindings,
transformation ID/formula and economic Event type references.

Available sources must have a lowercase SHA-256 digest, locator and explicit
time range. Available parameters must use a canonical finite decimal string,
explicit unit, at least one declared source, one inert transformation/formula
and at least one Event type. Missing sources and parameters require explicit
missing reasons. Missing hashes, units, unknown/duplicate identities,
non-finite values and incomplete available records fail closed.

Only parameters whose complete source set is available emit causal-chain rows.
Each deterministic row preserves:

`source ID/hash/locator/time range -> parameter ID/value/unit/transformation/formula -> economic Event type`.

The row is an audit inventory, not causal identification: every row records
`sourceBytesVerified=false` and `causalEffectVerified=false`. Formula text is
never evaluated. Output always records `formallyVerified=false`,
`eventAuthorized=false` and `parameterApplicationAuthorized=false`.

No parameter data, default, coefficient, unit conversion, formula, source
mapping or Event behavior was supplied by this branch. The test values and
hashes are fixtures only. No Core, Worker, replay harness, database, state,
Gate, main-site or production file was changed; F's Worker replay ownership is
untouched.

## Verification

- Focused parameter-provenance test: **PASS**, 1 file / 6 tests.
- Combined existing V29.1 evidence tool and new V29.3 provenance tests:
  **PASS**, 2 files / 10 tests.
- Strict standalone TypeScript over both V29 tools/tests: **PASS**.
- Targeted ESLint and Prettier: **PASS**.
- Repository secrets: **PASS**, 999 files.
- `git diff --check`: **PASS**.
- Base-to-code changed-file audit: **PASS**; only the plan, new tool and new
  focused test changed through the frozen code commit.

## NOT_RUN and unresolved contract gaps

Actual source files and source-byte hash verification, real parameter values,
units-registry resolution, formula correctness/dimensional analysis, empirical
or causal validation, mapping to actual Core Event schemas, Worker replay,
economic-state application, full repository tests, independent review,
formal V29.3 status/Gate, release and production are `NOT_RUN`.

The existing contracts do not yet provide a reviewed real parameter dataset or
an approved parameter-to-Event mapping. Consequently this delivery stops at the
minimal structural interface and does not create a data-fill artifact.
