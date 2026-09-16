# V11–V18 causal-channel preparation

> PREPARATION_ONLY_NOT_V11_STARTED

## Scope and baseline

- **Immutable baseline:** `291034d1c4f4ca1f9a3fd8779cf129ec46793b4f`
- **Candidate branch:** `codex/f-v11-v18-causal-channels`
- **Requested addition:** a user-supplied catalogue of 50 cross-engine causal
  chains, numbered 1–50, covering human systems, industry/technology/energy,
  fiscal/monetary/banking, and FX/trade/FDI.

This is a pure `packages/core` preparation only. It must not update
`status/progress.json`, create a command/event/receipt, modify a migration,
connect to Supabase, choose a country, seed a resource, or attach a worker/UI
runtime. Its outputs are inert proposed effects; only a later authorized World
Core transaction may decide to apply them.

## Change classification

- **Highest affected boundary:** P0 economic-rule preparation. The code is
  deterministic and non-persistent, but the eventual response parameters and
  World-State application are economic and authoritative decisions.
- **Affected future owners:** E02–E14 for chains 1–24; V19 banking/monetary,
  V20 FX, and V21 trade for chains 25–50.
- **Reads/writes:** no reads and no writes. Every response magnitude, delay,
  parameter version, and period is an explicit caller input.
- **Time:** the library schedules an inert effect only for a caller-supplied
  positive future period; it does not read a clock or define settlement order.
- **Legacy/production impact:** none.

## Design

1. Record every requested chain as a finite directed graph of named signals,
   signed edges, and owner scope. The catalogue carries no numeric parameter.
2. Expose an exact-decimal scheduler that accepts the selected edge, a
   non-negative exposure magnitude, an explicit non-negative response factor,
   a non-empty parameter version, and a positive delay. It returns one inert,
   canonically rendered effect.
3. Expose deterministic due/pending partitioning. No effect is applied, no
   state is stored, and all caller-supplied effects retain their provenance.
4. Treat chains 1–24 as parameterized-kernel-ready preparation. Keep 25–50 as
   future-interface-only catalogue entries; their owners and equations remain
   gated by later work packages and unapproved ADRs.

## Invariants and evidence

- All 50 IDs are unique and present; every chain has at least one directed
  edge and an explicit owning scope.
- A caller cannot schedule an unknown chain/edge, a negative magnitude/factor,
  a zero/negative delay, or an empty parameter version.
- A decreasing edge produces a negative exact delta; an increasing edge
  produces a positive exact delta; neither implies a state update.
- Due/pending partitioning is deterministic and preserves every effect once.
- Tests must demonstrate the human-system, industry/energy, and future
  monetary/trade paths without supplying implicit economic parameters.

## Deliberately deferred

- Calibration, elasticities, policy reaction functions, country selection,
  resource endowments, and default parameter values.
- Banking, FX, trade, FDI, route, tariff, or sanctions execution.
- Any settlement-time ownership resolution, event/posting generation,
  authorization, atomic commit, production database operation, map, or UI.
