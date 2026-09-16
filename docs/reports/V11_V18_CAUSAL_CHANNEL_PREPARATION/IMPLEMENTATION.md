# V11–V18 causal-channel preparation implementation

> PREPARATION_ONLY_NOT_V11_STARTED

## Candidate

- **Baseline:** `291034d1c4f4ca1f9a3fd8779cf129ec46793b4f`
- **Branch:** `codex/f-v11-v18-causal-channels`
- **Scope:** pure `packages/core` topology, inert exact-decimal scheduling, and
  Firm Ecology calculation only; no status/progress edit and no authoritative
  runtime path.

## Delivered

- `causal-channels.ts` records all 150 user-requested pathways as named,
  signed directed edges. Topology scheduling is deliberately value-free, so a
  bare decimal cannot masquerade as money, people, tonnes, or a rate.
- `causal-values.ts` adds the only concrete numerical path. Every input and
  result is `MONEY(currency)`, `QUANTITY(unit)`, or
  `UNIT_PRICE(currency/perUnit)`, carries an explicit sign rule, and returns
  exact canonical `before`, signed `delta`, and `after`. Cross-dimensional
  response factors declare both source and target units.
- Concrete stock updates fail closed on currency/unit mismatch, a negative
  non-negative stock, an undued effect, or a duplicate effect ID. The pure
  result remains inert and cannot mutate World State.
- `firm-ecology.ts` implements C101–C105 without a representative-firm
  shortcut: discrete entry/exit, cash-flow/default/insolvency classification,
  per-firm energy-cost selection, startup cohorts, and exact SOE
  guarantee/rollover accounting. Inputs/outputs are exact money, named-unit
  quantities, price per physical unit, or explicit dimensioned rates.
- `quantified-systems.ts` executes C101–C150 through their six declared
  system boundaries. `quantified-node-registry.ts` owns a fixed, immutable
  node/system/unit/sign registry for that range; callers cannot supply or
  override a contract, and the generic exact-transmission route rejects
  C101–C150 entirely.
- The focused suite verifies all 150 paths, exact population, price, money,
  physical-unit and network-outage examples, unit/system rejection,
  deterministic partitioning, and all five Firm Ecology mechanisms.

## Boundary declaration

| Boundary                                             | Effect                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| World State / ledger / events / receipts / commands  | None                                                                  |
| Database, RLS, migration, Supabase, production data  | None                                                                  |
| Time / scheduling                                    | Caller-supplied integer periods only; no clock or settlement ordering |
| Authorization / Office approval                      | None                                                                  |
| UI, worker, API, map, cache, forecast                | None                                                                  |
| Legacy or original EconMind site                     | None                                                                  |
| Firm registry, bankruptcy, SOE guarantee application | None                                                                  |
| C101–C150 state settlement                           | None                                                                  |

## Still gated

- No calibration, elasticity, country initialization, default parameter, or
  policy reaction function was added.
- A future authoritative caller must obtain the responsible economic decision,
  resolve authorization and WorldVersion, read canonical state, then apply any
  accepted effect through the approved atomic World Core path.
- V19–V21 implementation, and real banking/FX/trade/FDI/route behavior, remain
  outside this candidate.
- C101–C150 calculations do not authorize a firm lifecycle, liquidation,
  creditor waterfall, guarantee approval, parameter calibration, or World Core
  settlement.

## Exact-unit hardening extension

> `PREPARATION_ONLY_NOT_V11_STARTED`
> Implementation state: `IMPLEMENTED_UNVERIFIED` — this is a report-only
> statement, not a `status/progress.json` mutation.

- **Extension baseline:** `3e2a6c4f3971810ab24ec98db884956ee270dca8`
- **Immutable implementation candidate:** `3c455d13e14e20c438716c72b76f481f6635e3cf`
- **Effective risk:** P0. The changes are pure and inert, but strengthen
  financial/inventory conservation and cross-country-settlement preparation;
  `FAST_MAINLINE` therefore requires independent review before merge,
  `VERIFIED`, or dependent implementation.

### Implemented preparation only

- Replaced naked population, service-capacity, resource, energy, production,
  R&D, project and fiscal factor inputs with exact money, named quantities,
  bounded ratios, and explicit unit rates. Whole-person/case/bed/housing/firm
  stocks fail closed on fractional values.
- Added strict physical-unit checks for resource pools, inventory, fuel, energy
  generation and production. A person cannot be fuel and a currency cannot be
  a physical production capacity.
- Added a pure international settlement binding: local currency, the fixed
  literal `ICU` settlement currency, exact rate, effective period and version.
  A settlement table must use `ICU` with one period and version, and every
  enabled domestic currency must be bound. Cross-country payment output
  remains inert and preserves the domestic debit plus exact international
  settlement amount.
- Required C101–C150 quantified transmissions to use a Core-owned immutable
  node/system/unit/sign registry. Source, target and response units must all
  match that fixed contract; `scheduleExactCausalTransmission()` rejects the
  range so a caller cannot forge a self-consistent contract.

### Explicitly not implemented or authorized

- No V11.1, V11.2, V11.3, V12–V18 step is started, completed, or marked in
  repository status. In particular, no V11.2+ state implementation is
  authorized by this preparation.
- No World State, ledger, command, event, receipt, outbox, worker, API, UI,
  authorization, Office, migration, database, Supabase, production, or legacy
  EconMind path changed.
- No FX source, economic calibration, default policy coefficient, country
  initialization, settlement posting, or deterministic ordering policy was
  added. Future integration must use the authoritative World Core transaction
  path and approved country/parameter registries.

## Review-B MAJOR remediation

> `PREPARATION_ONLY_NOT_V11_STARTED`
> Implementation state: `IMPLEMENTED_UNVERIFIED` — this remediation remains
> subject to independent review and does not change repository status.

- **Reviewed candidate:** `4bb731532f49c16ecd306cb2a34a436a33f26fbb`
- **Remediation implementation:** `d93712cf608bd85a7f458a5d6ab8967f9baa880c`
- Replaced the C101–C150 caller-supplied node contract list with the immutable
  Core registry. The generic route now rejects the range before any
  caller-declared units can be used; the system route requires both endpoint
  units and signs, and both response dimensions, to equal the registry.
- Added focused C123 tests for a valid fixed-registry calculation, wrong
  physical/monetary dimensions, and a direct generic forged path. The two
  invalid variants reject.
- Fixed `ICU` as the sole international settlement currency. `USD` and every
  other canonical three-letter currency reject before conversion or cross-border
  settlement calculation.
- This is pure/inert Core preparation only: no ledger, state, command, event,
  receipt, outbox, database, API, worker, UI, migration, or production path
  was changed.
