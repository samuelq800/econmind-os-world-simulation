# CB-1 OMO source-to-draft — parallel preparation

## Authority and scope

NON_ACTIVATED / PARALLEL_PREPARATION. This is not V09 entry, an opening seed,
formal 70-country source completion, host activation, or permission to publish.
The frozen financial-opening candidate `801660d` is unchanged.

Sources: immutable E backlog `bb285afe2f6405678b096f84b560aeb07291859a`,
`docs/reports/world-connection/E_FOUR_OFFICE_RUNTIME_GAPS_2026_10_07.md`;
Central Bank U0270–U0289 and U0815–U0817; approved ADR-17 ownership.
Repository base: `afff74f3b7dd3611aa3d8a8d62dc8e9f0eb33c11`.

## Dependency and decision gate

P0: exact Money, rights conservation, authorization, one authoritative transition.
No status/ADR edits; V09 remains governed by status/progress.json. Independent
review is required. Root owns intake/dispatch, durable readers, domain replay,
current checkpoints, and the existing transaction-cutoff/fencing repository.

## Change plan

- A owns the new Core OMO command, Worker source adapter, focused tests/report.
- Root stitches one `export * from './commands/central-bank-open-market-operation.js';`
  into Core index. A does not edit that shared file.
- Strict CENTRAL_BANK_MONETARY_POLICY command carries direction, security/batch,
  face value, settlement tick and optional policy note, never settlement cash,
  holdings, quote, authorization verdict, R/A aggregates or macro patches.
- Worker reader must supply current quote, all relevant held batches/encumbrances,
  complete BANK/CB ledgers reconciled to authoritative posted positions, and the
  same reserve claim at one WorldVersion/fence. Missing evidence fails closed.
- Reuse calculateOpenMarketOperation, canonical Financial Posting Batch, Event,
  receipt, outbox and Atomic Draft. No new SQL/table/host or second financial engine.
- Minimum immediate same-currency settlement only. Non-par prices are exact, but
  carrying value must support the existing four-leg transaction; P&L/revaluation,
  FX valuation and future scheduled settlements are not silently invented.
- A exposes securities-rights replay; Root must compose it with canonical global
  lineage and durable current materializations before activation.
- No production access, migrations, seed, release, legacy or frozen bridge edits.

## Validation plan

TEST_ONLY BUY/SELL, exact four legs, unchanged TGA, same R claim, rights and
financial replay/retry without duplicate effects. Reject missing sources,
unowned/encumbered securities, invalid price/currency/time/version, incomplete
ledgers, stale authorization and mismatched claims before the draft factory.
Use real canonical opening/reconstruction and issued commit proof, not trusted=true.
Scoped Core build, source-composition typecheck/lint/tests, formatting, boundary,
environment, secrets checks. No full map/dependency copies on the full disk.
PASS/FAIL/NOT_RUN/INSUFFICIENT_EVIDENCE are distinct.

## Exit condition

Freeze a source-only candidate; report immutable SHA, actual checks and missing
real CB sources. Stop at IMPLEMENTED_UNVERIFIED; no self-approval or merge.
