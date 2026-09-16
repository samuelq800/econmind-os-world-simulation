# V11–V18 pure engine-kernel preparation

> PREPARATION_ONLY_NOT_V11_STARTED
>
> This candidate is a deterministic library preparation, not a V11–V18
> implementation record. It does not change status/progress.json, register a
> command, mutate World State, add a migration, create an event, or enable a
> Worker path. The V10.4/Gate B and every NORMAL hard dependency remain
> controlling.

## Boundary

packages/core/src/engine-kernels/ contains input-total pure functions only.
Each function takes canonical decimal strings and inert records and returns
canonical decimal strings and inert records, or fails closed. It has no clock,
database, network, authorization, event, receipt, command, cache, projection,
or hidden mutable state.

A later authoritative command implementation must:

1. resolve current authorization and the required WorldVersion;
2. read canonical input state from the one World State;
3. invoke a kernel as one domain-validation/calculation step;
4. prepare append-only events/postings and commit atomically through the
   approved World Core path.

The kernel result itself is never a durable state update and is not evidence
that a V11–V18 engine has started.

## Source coverage

| Engine | Master source | Pure calculation/constraint coverage |
| --- | --- | --- |
| E02 Population | MASTER-U0259–U0328 | Cohort transition, population identity, net migration, dependency ratio, non-negative cohorts |
| E03 Labour & Wage | MASTER-U0329–U0430 | Labour-force metrics, vacancies, skill gap, compatibility-limited matching, one employment-pool assertion |
| E04 Education | MASTER-U0431–U0509 | Minimum of applicants/seats/teacher/budget capacity, duration-gated graduation, explicit skill handoff |
| E05 Healthcare | MASTER-U0510–U0586 | Delivered-care minimum and carried backlog; bed occupancy |
| E06 Housing | MASTER-U0587–U0658 | Household-based net/unmet gap, vacancy rate and housing burden |
| E07 Public Safety | MASTER-U0659–U0735 | Available staff, deployment limit, incident rate, clearance and case backlog |
| E08 Resource & Inventory | MASTER-U0736–U0833 | Five-layer forward-only resource conservation, physical inventory reconciliation, reservation and strategic-stock moves |
| E09 Energy | MASTER-U0834–U0912 | MW × time generation, fuel burn, MWh balance, reserve margin, energy availability and storage energy balance |
| E10 Production | MASTER-U0913–U1002 | Potential/actual output by weakest bottleneck, derived input consumption and value added |
| E11 Technology/R&D | MASTER-U1003–U1106 | R&D output/progress and rights/prerequisite eligibility; licence remains distinct from mastery |
| E12 Project | MASTER-U1107–U1234 | Start prerequisites, weakest-component progress, funding gap, remaining inputs and commissioning predicate |
| E13 Household/Demand | MASTER-U1235–U1312 | Paid-income cashflow, essential basket, real margin and residual saving |
| E14 Fiscal/Treasury | MASTER-U1313–U1412 | PIT/VAT/CIT/payroll arithmetic, balances, debt, fiscal capacity, guarantee cap and cash shortfall |

## Explicit non-formula inputs

The Master uses f(...) without supplying a policy equation for wage growth,
job-matching policy, rent movement, response time, dispatch priority,
maintenance reliability, unit cost allocation, transfer absorption, royalties,
consumption demand, payment priority and FX revaluation. These are deliberately
not invented in this candidate. A later approved owner must provide each
versioned rule/parameter as canonical state or as an explicitly approved,
deterministic input. The kernels accept already-derived capacity/factor inputs
where the specification requires a minimum/ratio calculation.

## Deliberately excluded architecture work

- Canonical command schemas, events, receipts, idempotency and scheduling.
- Authorization, approval, Office routing and re-resolution.
- World State ownership, repository reads/writes, atomic persistence and
  migrations/RLS.
- Posting inventory or finance, handling concurrency/recovery, projections,
  UI, browser, production and Supabase access.
- Any claim that source-engine statuses, V11–V18 steps or Gate B have advanced.

## Verification target

The focused vector suite is
tests/world-core/v11-v18-engine-kernels.test.ts. It validates each engine
family's documented formula or failure boundary only. It is not an end-to-end
or Gate B test, and does not replace later step-specific tests.
