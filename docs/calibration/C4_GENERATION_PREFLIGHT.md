# C4 Generation Preparation Preflight

Status: **APPROVED_FOR_CONTINUATION / NOT_READY_NON_AUTHORITATIVE / FINAL_GENERATOR_NOT_READY**

C4 is not a 70-country generator implementation. This preflight records the
next dependency-ready preparation boundary after the approved C3 descriptive
exploration, and fails closed if its frozen C3 evidence differs. It creates no
fictional country, archetype, trade matrix, calibration package, or World Core
input.

## C4 continuation review

Review B approved immutable target
`de663d7d6a5d5dc0873f9e49905af8c57ce645fc` for continuation:
`C4_READINESS_GATE=PASS`, `OPEN_BLOCKER=0`, and `OPEN_MAJOR=0`. The decision
confirms that the preflight correctly binds its C3 evidence and correctly
remains not ready. It does not approve a final generator, change
`finalGeneratorReady` from `false`, authorize new empirical coverage, or relax
any C4 prohibition.

## Review lineage and frozen inputs

C3 historical target `21c571cd215b89bff20804bf2e38db687b44e55e` remains
`CHANGES_REQUIRED` evidence for `C3-MAJ-01`. Its forward target
`77c4fb3083970573ed56cbd280e0e41a8d83e43a` is
`APPROVED_FOR_CONTINUATION`: `C3-MAJ-01` is closed, with zero open blocker and
zero open MAJOR findings. That decision applies only to
`EXPLORATORY_NON_AUTHORITATIVE` C3 work.

`data/calibration/preflight/c4_generation_preflight.v1.json` records that
decision, the C3 contract canonical hash, and raw SHA-256 hashes for these
fixed C3 inputs:

- `data/calibration/exploration/c3_execution_contract.v1.json`
- `data/calibration/exploration/c3_exploration_summary.v1.json`
- `data/calibration/exploration/c3_uncertainty_register.v1.json`
- `data/calibration/exploration/c3_exploration_manifest.v1.json`

The contract's canonical content hash is
`323bf1d117d0511cb40891a02a161e052682e9aa8938f33ddbad6ce732fc5843`.
Verification snapshots each supplied byte array once, checks all C3 raw hashes
before parsing them, verifies C3 canonical and manifest content bindings, and
pins this exact C4 preflight semantic contract. A rewritten preflight cannot
claim readiness merely by recomputing its own content hash.

The C3 review outcome is recorded as a bounded provenance fact; this verifier
does not re-adjudicate Review B.

## Evidence scope

The frozen C2/C3 evidence remains a partial pilot: 10 empirical entities, 8
macro variables over 3 annual periods, and 2 sparse bilateral-trade variables.
WTO remains `NOT_FETCHED/WTO_API_KEY_MISSING`. The C3 uncertainty register
retains explicit missing values, an exact duplicate source fact, reporting
asymmetry, provider-vintage limits, and a WDI unit-metadata limit.

This is enough to design gates and provenance tests. It is not enough to choose
an archetype method/count, map real entities to fictional countries, reconcile
trade, parameterize a final package, or feed runtime state.

## Permitted preparation

- Specify a C4 feature-admission gate that requires explicit coverage, unit,
  missingness, and provenance evidence for every proposed feature.
- Design a deterministic generator contract and its provenance/determinism test
  plan without generating synthetic country records.
- Assemble owner-decision packets for method, feature, missing-value, sector,
  and trade-reconciliation choices.

## Explicit unmet gates

The machine-readable preflight carries seven evidence-linked unmet gates:

1. Missing-value policy for archetype features is unapproved.
2. Archetype method, count, and labels are unselected.
3. Fictional-country mapping is not authorized.
4. WTO tariff evidence is absent.
5. Provider-vintage stability is unestablished.
6. Sector taxonomy and trade reconciliation are unreviewed.
7. Final calibration and runtime handoff remain blocked.

Until those gates have separate evidence and approvals, C4 must not produce a
final 70-country package, IPF/RAS result, final calibration parameterization,
World Core import/mutation, or production-database operation.

## Reproduction

Use the repository-pinned Node `24.20.0` and pnpm `12.3.4`:

```sh
pnpm --filter @econmind/calibration c4:preflight:verify
pnpm vitest run tests/calibration/calibration-c4-preflight.test.ts
```

The verifier is local and read-only. It reports
`C4_PREFLIGHT_VERIFIED_NOT_READY` on success; that result confirms binding and
the preflight boundary, not authorization to generate a world.
