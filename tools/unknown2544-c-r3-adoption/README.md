# C bounded COUNTRY01 R3 adoption reader

IMPLEMENTED_UNVERIFIED; independent E review pending. Original closures: **0**.

This separate four-file delta consumes the fixed 2026-10-20 direct-human adoption
record, not caller-selected JSON, a caller-chosen hash, or a new authority registry.
It leaves C002, its old pins/packet and the separate 15-path combination unchanged.

## Actual local consumption

`readFixedR3Adoption(request)` reads exactly three fixed small files: the Owner
record (4,136 bytes), recipe source (6,948 bytes), and frozen C002 original-ID
contract (371,499 bytes). Each length and SHA256 is checked against repository-owned,
recursively frozen pins. `createR3AdoptionReader` allows the same exact byte buffers
for deterministic tests but never accepts a custom pin, path or issuer. This is
local scenario evidence consumption, **not** formal source admission or a
FoundationFact constructor. Missing or changed receipt/source/contract fails closed.

The API reuses C002's exact original ID/country/unit/null period/null currency
contract, with an explicit `ADOPTED_PARAMETERS_ONLY` mode. Eight COUNTRY01 IDs are
dependency-linked, not eight accepted field values. CLI example with Node 24.20.0:

The new subset has two IDs per B10/B11/B12/B13 parent. The frozen C002 contract's
four-per-parent count is retained separately under `originalContract.parentBatch`;
it is not this package's denominator.

```sh
node tools/unknown2544-c-r3-adoption/adoption-view.mjs U2544::COUNTRY::COUNTRY_01::waterPotableDeliveredMinimum
node --test tools/unknown2544-c-r3-adoption/adoption-view.test.mjs
```

Only the eight scalar coefficients under
`/recipes/potableTreatmentOperationPerRawM3` are projected: three skill worker-days,
steel, machinery, electricity, treatment yield and pipe-delivery yield. Exact raw
numeric tokens, canonical decimal strings, units and both source/adoption pointers
are retained. Each yield is applied exactly once to derive **0.9024 delivered-m3 per
raw-m3**, a ratio, never an actual delivered volume. The implementation reuses the
merged C lossless parser/canonicalizer and exact decimal multiplication helper.

The 0.11 sale-price leaf, performanceQuality, other recipes/countries, implicit
8-hour shifts, native tariff/cost, quality certification, volume and World/epoch/asOf
are not adopted. Extra request options attempting to add them are rejected.

## Original-ID dependency boundary

Prefix: `U2544::COUNTRY::COUNTRY_01::`.

| Original fields                                        | Narrow effect; remaining evidence                                                                                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| labourMinimumHours / labourPayrollNative               | Water worker-day coefficient accepted; no national minimum hours, source timesheet/hour conversion, legal wages/benefits, employer or payroll |
| waterPotableDeliveredMinimum / waterCompleteCostNative | Water yields/input coefficients accepted; B02 remains deferred, rights/quality/operation/accepted delivery and complete native costs absent   |
| energyDeliveredMinimum / energyCompleteCostNative      | Water treatment MWh input coefficient only; no national energy minimum, actual delivered MWh, tariff or complete energy cost                  |
| transportMinimum / transportCompleteCostNative         | Steel/machinery requirement linkage only; no transport recipe, accepted cargo/title/verified route, tonne-km or native freight contract       |

`adoptedParameters.status` records the bounded parameter adoption separately from
`actual.status`, original null measures and four false original stage flags. The
old dependency/measure view is retained as historical C002 evidence; the new
`parameterDependencyDelta` removes only the water-coefficient adoption obstacle,
not whole minimum/cost dependencies. No original field is closed or fully adopted.

## Existing consumers: read-only evidence

`inspectFixedConsumerSources()` verifies the three source postimages and returns
bounded excerpts. It does not import or execute Worker/Core consumers:

- `tools/unknown2544-c-water-service/produce-candidate.mjs:81`: existing real-source
  refusal stays unchanged; TEST_ONLY consistency is not actual operation.
- `packages/core/src/water/foundation.ts:350`: raw-capacity/delivery-efficiency
  mapping and grant/demand constraints. An eventual mapping must apply the two
  yields once, and must not silently equate raw quotas with net delivered quotas.
- `apps/world-worker/src/preparation/official-water-opening-adoption.ts:510`:
  actual operation requires snapshot-bound FoundationFact, state cursor and time.

B02's five parameters, actual grant/quality/delivery/hours, native full-cost
inclusions and real World/epoch/period remain missing. No source issuer, water
right, account, cash, grant, World, Clock, SQL, network or production write is
implemented. The executable prints readback only. No big journal reads, models,
70-country wrappers, CI/push/merge or register writes are part of this delta.

The mutable decision-summary Markdown is not pinned as the pre-choice document:
the exact fixed adoption JSON itself supplies this bounded decision. Historical
pre-adoption artifacts and their hashes are never rewritten.
