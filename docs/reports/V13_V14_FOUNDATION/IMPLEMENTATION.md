# V13-V14 energy, production, technology, and project foundation record

## Candidate identity

- Foundation baseline: `5356fe93932eb285b3c21977a655e4c6e7bb6746`
- Branch: `codex/v13-v14-foundation-mode`
- Report state: `FOUNDATION_IMPLEMENTED_UNVERIFIED`
- Scope: pure Core modules, focused tests, plans, and evidence only.

## Pure-kernel surface

- `foundation-provenance.ts` defines immutable source/predecessor/version/
  snapshot/hash/tick/payload bindings, exact quantity before/delta/after
  transitions, and canonical SHA-256 replay preimages.
- `energy-production-foundation.ts` wraps E09 generation, grid allocation, and
  E10 bottlenecked output. `MW` is validated independently of `MWh`; V12
  usable-fuel/material values remain caller-owned read-only inputs.
- `technology-project-foundation.ts` wraps E11 rights/R&D and E12 lifecycle
  inputs. Rights categories are runtime-validated, R&D never changes a right
  or capacity, and a facility-handoff proposal requires completed construction,
  commissioning, and explicit consumed-input evidence.

Every returned numerical relationship is an exact canonical decimal plus unit,
source-bound fact, or proposed before/delta/after transition. The calculation
does not add a rate, price, default, dispatch, rounding, macro-policy, or
authoritative state formula.

## Deliberate exclusions

- No V13/V14 lifecycle, status, Gate, hard-dependency, merge, deployment, or
  production claim.
- No database, RLS, migration, API, worker, UI, Command, Event, receipt,
  ledger, transaction, scheduler, authorization decision, or state write.
- No V12, V15-V18, integration-plan, or V09 code changes. V09 remains the
  owner of durable atomic commit, idempotency, writer coordination, and
  recovery evidence.
- Normal R2 dependencies remain unchanged: V13.1 requires V03.3/V11.3/V12.3;
  V14.1 requires V05.3/V06.3/V08.3/V11.3/V12.3/V13.3; subsequent steps retain
  their recorded predecessors.
