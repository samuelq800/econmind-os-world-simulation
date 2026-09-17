# V12 foundation helper traceability

## Baseline and use boundary

This candidate starts from the independently narrow-reviewed F foundation tip
`5356fe93932eb285b3c21977a655e4c6e7bb6746`. It imports only the following
reusable F resource/inventory helpers. No unlisted F helper is imported by the
V12 resource/inventory module.

| F helper                     | V12 use                                                                     | Preserved constraint                                       |
| ---------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `assertResourceConservation` | validates every constructed, transitioned, and replayed geological state    | five mutually exclusive pools equal the fixed endowment    |
| `transitionResourceLayer`    | applies the four one-step lifecycle moves                                   | cannot skip a layer, exceed a source pool, or change total |
| `reconcileInventory`         | calculates typed caller-supplied inventory reconciliation                   | non-negative closing stock and same physical unit          |
| `reserveUsableInventory`     | performs E08 usable-to-contract-reservation movement                        | reservation may not exceed usable stock                    |
| `transferStrategicInventory` | performs E08 usable-to-strategic accumulation or explicit strategic release | source strategic/usable bucket must cover the amount       |

The V12 wrapper adds resource-code/unit binding, immutable lineage references,
before/after records, duplicate-reference rejection, trace/source-link checks,
and an E08-only ownership boundary. It does not reinterpret an F helper as a
Command, Event, durable receipt, transaction, or product implementation.

## Source traceability

- Constitution U0063, U0224–U0227, U0239–U0248, U0433–U0445, and U0661–U0665:
  physical conservation, explicit units, fixed geological endowment, layer
  separation, exploration-only pool movement, and E08 ownership.
- Master U0737–U0762: E08 resource/inventory source-of-truth, six geological
  resource units, five resource layers, and inventory buckets.
- Industry specification sections 5–11, 16, and 43: five-layer resource
  definitions, discovery constraint, developed/extracted boundary, inventory
  identity, and strategic reserves.
- ADR-04 is still `PROPOSED_NOT_APPROVED`: V12 selects no opening/current/prior
  or phase ordering. ADR-08 is still `PROPOSED_NOT_APPROVED`: V12 selects no
  conversion, rate, price, or rounding formula. V09.3 retains durable atomic,
  idempotent, and recovery ownership.
