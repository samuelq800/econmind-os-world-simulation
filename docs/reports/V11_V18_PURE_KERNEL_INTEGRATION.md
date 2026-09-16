# V11–V18 pure-kernel integration record

> PREPARATION_ONLY_NOT_V11_STARTED

## Candidate boundary

- **Integration branch:** `codex/v11-v18-kernel-integration`
- **Integration baseline:** `d8d52e7`
- **Imported preparation commits:** `291034d`, `84bfb6d`, `5a115cc`
- **Classification:** P0 calculation preparation; `IMPLEMENTED_UNVERIFIED`

This branch imports F's existing pure `packages/core` preparation on top of
the current owner-authorized V11.1 planning baseline. It does **not** modify
`status/progress.json`, approve Gate B, start V11.1 implementation, authorize
V11.2–V18, merge `main`, deploy, create a command/event/receipt, or access a
database, Supabase, worker, API, UI, or the original EconMind site.

## Exact causal trace contract

Every catalogue edge can be represented by an inert, JSON-safe exact trace
when a later owner supplies its approved inputs. The record contains:

1. stable effect ID, chain ID, canonical string edge index, and canonical
   source/due period strings;
2. named source and target nodes and signed direction;
3. exact source amount plus source unit;
4. exact target-before amount plus target unit and stock-sign rule;
5. exact, versioned response factor with both source and target units;
6. signed exact target delta and exact target-after amount; and
7. on an aggregate calculation, the sorted IDs of every included due effect.

Periods and edge indices no longer accept JavaScript numbers. They are
canonical non-negative/positive integer strings and are compared or added with
`BigInt`, so timing and catalogue positions are neither rounded nor silently
lost. Quantities and money remain canonical decimal strings through the
existing World Decimal path. No default factor, delay, economic rule, country,
or policy coefficient is introduced.

The new all-edge vector runs every directed edge in all 100 chains through
the exact trace API with explicit test-only units and an explicit `1` factor.
It proves trace shape and exact before/rate/delta/after preservation only; it
does not calibrate or activate any causal relationship.

## Verification to record after the candidate commit

- Core build and core typecheck.
- Focused engine-kernel and causal-channel vectors.
- ESLint and Prettier over changed sources/tests/docs.
- Boundary and authoritative-pattern checks.
- One full repository check from the fixed candidate SHA.

No green result in this record is a Gate B decision. The dedicated staging
connection-loss recovery evidence remains an external Gate B blocker, and the
V11.1 owner plan remains the only authorized next implementation scope.
