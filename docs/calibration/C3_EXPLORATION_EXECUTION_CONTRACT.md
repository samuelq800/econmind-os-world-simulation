# C3 Exploratory Distribution and Coverage Contract

Status: **APPROVED_FOR_CONTINUATION / EXPLORATORY_NON_AUTHORITATIVE / NO_RUNTIME_AUTHORITY**

C3 is a deterministic descriptive exploration of the frozen C2 pilot. It is
not a calibration package, statistical inference, archetype decision, trade
matrix, or runtime input.

## Frozen inputs

The execution contract is
`data/calibration/exploration/c3_execution_contract.v1.json`. It binds every
generated C3 artifact to the C2 historical review target
`42adf110c1d8e8f01932b8b9b5f97a1e086d0343` and to the byte hashes of these
four inputs:

- `data/calibration/pilot/normalized_observations.v1.json`
- `data/calibration/pilot/quality_diagnostics.v1.json`
- `data/calibration/pilot/snapshot_manifest.v1.json`
- `data/calibration/pilot/pilot_report.v1.json`

The historical C2 target remains immutable reviewed evidence. Its forward
closure target `56d9882cddd7244dca84a4dda3eed2dd10866ac1` was independently
approved for continuation under Class A: `C2-M01` and `C2-M02` are closed and
there are no open blockers or MAJOR findings. That approval changes no frozen
C2 artifact and was not itself a C3 review decision; the separate C3 decision
is recorded below.

C3 historical target `21c571cd215b89bff20804bf2e38db687b44e55e` remains
immutable `CHANGES_REQUIRED` evidence for `C3-MAJ-01`. Its forward-remediation
target `77c4fb3083970573ed56cbd280e0e41a8d83e43a` was independently approved
for continuation: `C3-MAJ-01` is closed, with zero open blockers and zero open
MAJOR findings. This is a review decision for the frozen descriptive C3 line;
it does not alter the historical target, authorize an archetype decision, or
make C3 a runtime or final-calibration input.

The generator reads only those fixed local artifacts. It rejects a changed
input byte hash, an unexpected C2 input-path set, an altered C2 partial-pilot
status, loss of the `WTO_API_KEY_MISSING` truth, or a Comtrade source that is
not the recorded public-preview pilot. It performs no live provider retrieval.
Before parsing C2 data, it verifies the fixed C3 contract canonical hash and
all four raw C2 byte hashes. Each supplied byte array is copied once before
hashing or parsing, so a getter or later mutation cannot swap the parsed value.
Public summary and uncertainty constructors accept only the resulting
module-attested bundle, rather than caller-supplied arrays or diagnostics;
manifest construction likewise accepts only outputs attested to the same
bundle. Structural clones and runtime-forged lookalikes fail closed.

## Descriptive methods

The WDI portion uses the explicitly recorded 10-entity by 3-period grid. It
reports reported-cell and non-missing-value coverage separately, retaining
explicit nulls and never imputing them.

The Comtrade portion is a sparse requested slice. Its output deliberately has
no coverage denominator and no inferred unreported-cell count. Exact duplicate
observation IDs remain visible in `sourceFactCount`; a byte-identical repeated
observation is counted once in a univariate distribution, while conflicting
reuses fail closed.

For each non-empty variable, the generator emits minimum, nearest-rank P25,
P50, P75, maximum, exact decimal sum, and an exact mean fraction. A terminating
mean decimal is emitted only when exact division terminates; otherwise it is
`null` and no rounding is applied. The order of input facts and input-artifact
bindings cannot affect the output. Summary variables and identifier lists use
explicit code-unit ascending order; distributions use canonical-decimal
ascending order with observation ID as the deterministic tie-breaker.

## Uncertainty register

`c3_uncertainty_register.v1.json` carries forward the C2 evidence rather than
resolving it: six explicit missing observations, one exact duplicate fact,
three reporting-asymmetry diagnostics, the unavailable WTO provider, provider
vintage limits, and empty live WDI record-level unit fields. It also blocks
claims or decisions about p-values/confidence intervals, archetype algorithms
or counts, fictional-country mapping, IPF/RAS or trade reconciliation, and
final calibration/runtime parameterization.

## Generated audit artifacts

- `data/calibration/exploration/c3_exploration_summary.v1.json`
- `data/calibration/exploration/c3_uncertainty_register.v1.json`
- `data/calibration/exploration/c3_exploration_manifest.v1.json`

Each output has a canonical content hash and is deeply frozen. The manifest
refuses a summary or uncertainty register whose private bundle attestation,
identity, normalized input binding, or content hash does not match the
contract.

## Four review rounds

1. **Arithmetic and determinism:** inspect exact-decimal sums, exact rational
   means, nearest-rank positions, and order-independence tests.
2. **Coverage and quality treatment:** inspect explicit WDI-grid denominators,
   sparse-trade null denominators, null preservation, duplicate handling, and
   fail-closed conflicts.
3. **Provider truth and uncertainty:** compare the C3 register to the C2
   diagnostics, pilot report, snapshot manifest, WTO gap, preview status, and
   revision/unit caveats.
4. **Cross-artifact integrity and boundaries:** recompute the contract/input
   hashes and manifest content hashes; attempt altered raw bytes, erased
   diagnostics, legacy caller-supplied arrays, and runtime-forged bundle/output
   lookalikes; then verify no output is used for a prohibited decision or
   imports World Core/runtime code.

## Local reproduction

Use the repository-pinned Node `24.20.0` and pnpm `12.3.4`:

```sh
pnpm --filter @econmind/calibration exploration:generate
pnpm vitest run tests/calibration/calibration-exploration.test.ts
pnpm --filter @econmind/calibration typecheck
```

The first command is local-only and regenerates C3 artifacts from the frozen
C2 files; it is not a provider fetch and does not change C2 inputs.
