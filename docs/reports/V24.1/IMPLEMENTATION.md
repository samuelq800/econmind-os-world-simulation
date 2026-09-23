# V24.1 Captain strategy/governance — pure preparation record

## Status and dependency boundary

`PREPARATION_ONLY_DEPENDENCIES_OPEN`.

- Validated code candidate: `ed21614bb6b9de166eca1a5d9b6c6612c7066285`.
- Base: `015de795dfd1780c14c580e743cd7d0fa721b0c6`.
- Branch: `codex/v24-1-captain-strategy-preparation`.

During implementation, a reviewed V23.3 read-only risk/score preparation
entered nonproduction mainline. Its acceptance explicitly preserves formal
V23.3 product dependencies as open, and `status/progress.json` still records
V23.3 as `PLANNED`. This V24.1 candidate therefore remains preparation only;
it is not product completion, verification, Gate advancement or production
authority.

## Prepared governance contracts

- Fixed catalogs for nine national strategies, twelve priorities, six offices
  and seven Political Capital buckets.
- National strategy maintain/change/suspend/resume candidates with explicit
  political cost and crisis/reason references. A primary change requires a new
  strategy and positive cost; strategy results contain no macro buff.
- Primary/secondary priority candidates with distinct values, fixed reason and
  no-op rejection.
- Cabinet Agenda candidates with structured target/constraint/office facts,
  dedicated status actions and at most three active/under-review issues.
- Version-bound Captain proposal decisions for approve, reject, revision,
  joint package and Cabinet vote. Fiscal/FX/resource data remain read-only
  inputs; the result references owner settings and explicitly performs no owner
  mutation.
- Political Capital reallocation and spending use exact
  `political_capital` quantities. The snapshot enforces
  `opening + generated = total = available + spent`, `closing = available` and
  `available = sum(bucket balances)`. Reallocation is zero-sum. Spending emits
  exact bucket, available, closing and spent transitions and cannot create
  capital.
- Government commitments enforce cautious/firm/explicit-target structure.
  Credibility and public-support effects are deliberately absent for later
  system calculation.
- Cabinet conflict coordination emits only structured coordination candidates
  and an empty office-policy mutation set.

## Captain authority boundary

Requests containing direct tax-rate, policy-rate, production, inventory, GDP,
productivity, trade-balance, money-supply, credibility or public-support
mutation fields fail closed. Captain can reference Finance, Central Bank,
Industry, Trade and Social facts, costs, prerequisites and approvals, but this
module never changes their authoritative values.

Every input is bound to source/predecessor references, source version, snapshot
hash, canonical payload and exact simulation tick. Replay dispatches by module,
re-runs the complete preparation from the same bound facts and compares the
full proof, rejecting a rewritten output even if its public hash is recomputed.

The candidate creates no authoritative Strategy, Priority, Agenda, Proposal,
Commitment, OfficeApproval, role grant, Command, Event, receipt, database row,
posting or durable idempotency record.

## Exclusions

No original main-site, web/API/worker, database/RLS/migration, Supabase, cache,
legacy engine, status/Gate, deployment or production path changed. Full
repository `pnpm check`, live PostgreSQL, authoritative authorization and
end-to-end governance execution were not run.

## Mainline comparison

Latest observed `origin/main` is
`fa281e2bdb7a6b2a1628f015aa721e859438fbb8`. It descends from this branch's
base and includes reviewed V23.3 preparation. Changed-path intersection since
the merge base is empty; `git merge-tree --write-tree --messages` completed
without conflict messages. No merge, rebase, cherry-pick or status promotion
was performed.
