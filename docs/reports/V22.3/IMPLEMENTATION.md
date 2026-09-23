# V22.3 international executors B — parallel preparation record

## Status and immutable code candidate

`PREPARATION_ONLY`.

- Fixed code candidate: `8d85b1a` (full SHA recorded in
  `TEST_EVIDENCE.json`).
- Base: reviewed V22.1 mainline
  `f4815cc3d24e4876e9f09858f5536aac560592ef`.
- Branch: `codex/v22-3-international-executors-b`.

V22.2 is a formal hard dependency. A reviewed nonproduction V22.2 foundation
has since entered `origin/main`, but its acceptance explicitly says V22.2 is
not product `VERIFIED`; repository status remains `PLANNED`, with V21.3,
authoritative V10.4, ADR-10, posting/settlement and the package Gate open.
Consequently this branch remains preparation only and does not claim V22.3 or
V22 completion.

## Implemented preparation

The new pure-Core module contains an executable 23-entry coverage matrix:

- **9 `EXACT_TRANSFER_PREPARATION` subtypes:** Technology Licence, Joint
  International Project, Reserve Swap, Grant Aid, Commodity Aid, Emergency
  Concessional Loan, Technical Assistance, Project Reconstruction Aid and
  Trade Dispute Settlement compensation.
- **8 `STRUCTURED_VALIDATION_PREPARATION` subtypes:** PTA, FTA, Customs
  Cooperation, Sector Market Access, Multilateral Economic Agreement,
  Sanction Package, International Tender and Strategic Economic Partnership.
- **6 `TYPE_ONLY_PENDING_V22_2` subtypes:** Commodity Supply Agreement, FDI,
  Sovereign Loan, Infrastructure Finance, Resource Development Agreement and
  Emergency Supply Contract. This branch supplies no B executor evidence for
  those types.

Every exact subtype has a dedicated public calculation, not merely the common
contract state machine. It returns exact before/delta/after candidates tied to
immutable source facts. Cash, inventory, reserve, debt, project-contribution
and service-capacity calculations reject insufficient source positions,
currency/unit/party mismatch and non-conservation.

Treaty schemas require subtype-specific schedule/access references. Sanctions
require enumerated measures, targets, exemptions and approvals and reject an
abstract intensity. Tender awards cannot exceed a bid or the underlying need;
when partial awards are forbidden they must exactly cover the requirement.
Strategic partnerships are component-agreement containers and reject abstract
buff/direct-effect fields.

## Replay boundary

Every calculation binds fact source, predecessor, version, snapshot hash,
canonical payload and exact simulation tick. Replay verification does not
trust a caller-recomputed public hash: it dispatches by subtype module,
re-runs the calculation/validation from the same bound input facts, and compares
the entire recomputed proof. The focused regression changes the output while
recomputing the public hash and confirms rejection.

This remains a pure candidate calculation. It neither authenticates referenced
rights/approvals nor creates an authoritative Contract, Command, Event,
receipt, right, obligation, posting or durable idempotency record.

## Independent-review forward fix

Independent narrow review of the earlier remote tip `4601b19` found P0=0 and
MAJOR=1: a project receiving account could reuse a participant account
reference, allowing two incompatible after-balances to be calculated from the
same before-balance. Fixed code `8d85b1a` now rejects a project account that
matches any participant account before creating transitions. The regression
uses the reported `ACCOUNT.PROJECT.SHARED` shape and confirms fail-closed
behavior. The old tip remains superseded and is not mergeable.

## Ownership and exclusions

Future authoritative owners remain Treasury/financial ledger, inventory,
technology rights, project funding/ownership, official reserves, debt,
services, treaty rules, sanctions, tender awards and disputes. No owner is
mutated here.

No V22.2 executor-A source, web, API, cache, worker, database, migration, RLS,
Supabase, production, legacy engine, status/Gate or deployment file changed.
Full repository `pnpm check`, live PostgreSQL, end-to-end authoritative
settlement and production validation were not run.

## Mainline comparison

The latest observed `origin/main` is
`751e06b896741fc69c438f5603fa770972d3d5de`, which includes the reviewed V22.2
foundation. The changed-path intersection since this branch's merge base is
empty. A read-only `git merge-tree --write-tree --messages` completed with no
conflict messages. No merge, rebase, cherry-pick or status promotion was
performed.
