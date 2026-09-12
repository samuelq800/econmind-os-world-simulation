# V10.2 Worker reservation implementation candidate

Status: `PREPARATION_ONLY`, P0, independent review pending. This is runnable
candidate construction, not committed inventory or an approved V10 stage.

## Delivered

`prepareGoodsReservation` in `apps/world-worker/src/trade/goods-reservation.ts`
consumes the canonical GRAIN/Treasury command, both authoritative proposals,
server-held current Office contexts and explicitly supplied approved policy.
There is no default ADR-09 policy or client-controlled approval flag. It binds
all required country/Office signatures, re-resolves current authorization,
checks current WorldVersion and idempotency, and generates a real
`GOODS_RESERVED_V1` event plus V08 `RESERVE` posting. The existing joint lineage
writer validates stock and reconstructs the candidate without mutating inputs.

Output includes `ledgerTransition`, `posting`, `reserved`, `settlementAmount`
and `nextLedgers`, labelled `CANDIDATE_NOT_COMMITTED`. Title, risk and physical
location are unchanged. Buyer inventory and financial positions do not change.
No cash-reservation model or payment is invented; V10.3 owns actual payment.

C's fixture commits a68d848 and ae6c230 are reused verbatim through cherry-pick.
The unified synthetic scenario remains 4 tonnes opening, 2 tonnes reserved at
3 GCU each, and 8 GCU buyer cash. No calibration values become runtime data.

## Actual verification

Pinned Node 24.20.0 / pnpm 12.3.4, local only:

- New focused reservation tests: 12 passed.
- Combined reservation, command contract and C fixture: 3 files, 38 passed.
- Worker strict typecheck: passed.
- Preparation strict typecheck: passed.
- Focused ESLint, Prettier and git diff whitespace checks: passed.
- First module load/typecheck failed because this worker has no workspace
  package dependency on `@econmind/core`; fixed to the same Core source entry
  used by the existing fixture, preserving one opaque-brand module instance.
- First behavior run: 9 passed / 3 failed on lowercase generated identifiers;
  fixed deterministic ID suffix to canonical uppercase, then 12/12 passed.

## Remaining integration

The caller must read the policy, proposals, source and lineage from trusted
server stores inside V09's writer transaction, repeat current authorization
at commit, and persist the returned candidate atomically. Durable duplicate
receipt lookup is V09's responsibility; this constructor rejects duplicates
instead of reserving again. No DB connection, deployed migration, RLS proof,
server policy installation, UI entrypoint, or production release is claimed.
ADR-09 is still unapproved. Formal dependency gates and main remain unchanged.
