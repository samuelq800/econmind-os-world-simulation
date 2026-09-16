# V11–V18 causal-channel preparation

> PREPARATION_ONLY_NOT_V11_STARTED

## Scope and baseline

- **Immutable baseline:** `291034d1c4f4ca1f9a3fd8779cf129ec46793b4f`
- **Candidate branch:** `codex/f-v11-v18-causal-channels`
- **Requested additions:** two user-supplied catalogues of cross-engine causal
  chains, numbered 1–50 and 51–100, covering human systems,
  industry/technology/energy, fiscal/monetary/banking, FX/trade/FDI,
  expectations, political support, and crisis resilience.

This is a pure `packages/core` preparation only. It must not update
`status/progress.json`, create a command/event/receipt, modify a migration,
connect to Supabase, choose a country, seed a resource, or attach a worker/UI
runtime. Its outputs are inert proposed effects; only a later authorized World
Core transaction may decide to apply them.

## Change classification

- **Highest affected boundary:** P0 economic-rule preparation. The code is
  deterministic and non-persistent, but the eventual response parameters and
  World-State application are economic and authoritative decisions.
- **Affected future owners:** E02–E14 for the human, real-economy and
  distribution paths; V19 banking/monetary, V20 FX, and V21 trade for the
  external/macro paths; V24 for governance, political-support, stability and
  crisis paths. This preparation does not transfer any of their authority.
- **Reads/writes:** no reads and no writes. Every response magnitude, delay,
  parameter version, and period is an explicit caller input.
- **Time:** the library schedules an inert effect only for a caller-supplied
  positive future period; it does not read a clock or define settlement order.
- **Legacy/production impact:** none.

## Design

1. Record every requested chain as a finite directed graph of named signals,
   signed edges, and owner scope. The catalogue carries no numeric parameter.
2. Expose a value-free topology scheduler that accepts only the selected edge,
   a non-empty parameter version, and a positive delay. It returns no numeric
   delta, so it cannot accidentally represent unitted money or population.
3. For concrete measures, expose a separate exact-value path. It must carry
   a target node, a discriminated quantity or money unit, a signed/non-negative
   value rule, an explicit conversion factor, an exact before/delta/after
   calculation, and a positive delay. A currency amount can never be silently
   treated as a population count or a generic score.
4. Expose deterministic due/pending partitioning. No effect is applied, no
   state is stored, and all caller-supplied effects retain their provenance.
5. Treat topology as preparation only. The future-owner catalogue entries do
   not authorize banking, FX, trade, political, or crisis implementation.

## Invariants and evidence

- All 100 IDs are unique and present; every chain has at least one directed
  edge and an explicit owning scope.
- A caller cannot schedule an unknown chain/edge, a zero/negative delay, or an
  empty parameter version.
- A concrete caller cannot omit the `MONEY(currency)` or `QUANTITY(unit)`
  dimension. A decreasing edge produces a negative exact delta; an increasing
  edge produces a positive exact delta; neither implies a state update.
- Due/pending partitioning is deterministic and preserves every effect once.
- Concrete quantity and money calculations reject unit/currency mismatch,
  negative stock results, duplicate effect IDs, and effects that are not due.
- Tests must demonstrate the human-system, industry/energy, and future
  monetary/trade paths without supplying implicit economic parameters.

## Deliberately deferred

- Calibration, elasticities, policy reaction functions, country selection,
  resource endowments, and default parameter values.
- Banking, FX, trade, FDI, route, tariff, or sanctions execution.
- Any settlement-time ownership resolution, event/posting generation,
  authorization, atomic commit, production database operation, map, or UI.
