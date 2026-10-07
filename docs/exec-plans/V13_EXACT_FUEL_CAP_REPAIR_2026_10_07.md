# V13 exact fuel cap repair

## Scope and original failure

Base: `d0926f288dcb84559cfdef94c7d283ea7ac180e7`.
Branch: `codex/exact-fuel-cap-recovery`. Risk: P0 physical conservation and
deterministic calculation; independent review is required before merge.

F's actual consumer exposed a Core defect, not a missing adopted coefficient.
With 100 MW, capacity factor 0.164583, one hour, fuel rate 1 tonne/MWh,
efficiency 1 and 8 tonnes available, potential generation/fuel is 16.4583.
The previous usable/required division produced a rounded 240-digit repeating
factor. Multiplying it back failed the 120-digit canonical final-quantity
domain although the exact final result is 8 MWh and 8 tonnes consumed.

Root reproduced this before changing the kernel: the new six-case test exited
1, with 2 FAIL and 4 PASS. The second failing case uses fuel rate 2 and
efficiency 0.5, whose exact constrained output is 2 MWh. Failures were
`generation must be a canonical exact decimal`; they are not relabelled PASS.
F's separate earlier consumer failures remain in F's original handoff.

## Narrow repair

In the existing `calculateV13EnergyAllocation`, consumption is first clamped
exactly to min(available fuel, required fuel). Generation is then
potentialGeneration × consumedFuel / requiredFuel, multiplying before division
so cancellable repeating intermediates do not corrupt the final value.
Zero required fuel retains potential generation. Surplus stock is not burned.

No source values, coefficients, priorities, grid flows, decimal precision,
rounding policy, epsilon, Core public interfaces or other engine is changed.
The existing canonical result check still rejects genuinely non-terminating
final generation (8/3), rather than rounding it into an admitted quantity.

## Actual verification

Environment: isolated local checkout, pinned Node 24.20.0/pnpm 12.3.4.
No credentials or production SQL/Clock/Worker activation used.

| Command/scope                                                           | Actual result                     |
| ----------------------------------------------------------------------- | --------------------------------- |
| New fuel-cap test before fix                                            | exit 1, 2 FAIL / 4 PASS           |
| New fuel-cap test + existing V13/V14 foundation + foundation governance | exit 0, 11/11 PASS across 3 files |
| Existing V11–V18 engine kernels                                         | exit 0, 11/11 PASS                |
| `pnpm --filter @econmind/core build`                                    | exit 0                            |
| ESLint: changed kernel and new test                                     | exit 0                            |
| Prettier: changed kernel and new test                                   | formatted; no arithmetic change   |
| `scripts/check-boundaries.mjs`                                          | PASS, 253 scanned files           |
| `scripts/check-authoritative-patterns.mjs`                              | PASS, no violations               |
| `git diff --check`                                                      | exit 0                            |

New tests cover exact 8 and 8.22915 consumption, zero usable stock,
efficiency/rate dimensionality, surplus fuel, explicit zero-fuel generation,
deterministic replay evidence and refusal of an unrepresentable final amount.
All inputs are TEST_ONLY mechanism inputs, not adopted solar fuel coefficients.

No whole-repository suite, hosted CI, native PostgreSQL, economic posting or
production acceptance is claimed by this pure-kernel repair. The independent
fixed-candidate review must retain this distinction. F's new adapter consumer
will separately update its formerly expected limitation case after this repair
is approved and incorporated.
