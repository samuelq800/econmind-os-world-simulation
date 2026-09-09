# V04.2 implementation report

## Status

- Implementation commit: `b91fb6ec92d9a19ff23eaeb7573b69e838dca0cc`
- Effective risk: P0 authoritative-core architecture boundaries
- Status: `IMPLEMENTED_UNVERIFIED`; Gate A independent review required

## Implemented scope

The authoritative-pattern scanner fails closed on direct decimal.js imports
outside the Canonical Numeric Layer, floating-point conversion, browser APIs,
forbidden UI/persistence/test dependencies in World Core, and fast-check in
runtime packages. Architecture tests exercise each deliberate violation in a
temporary repository before accepting the real tree.

## Future invariant extension contract

The same fixed-seed property harness will host, but does not yet claim to run:

- V06: clock monotonicity, pause behavior, and deterministic scheduling;
- V07: command idempotency, replay equivalence, and receipt determinism;
- V08: stock-flow conservation and ledger balance;
- V09: atomicity, rollback, and single-writer invariants;
- V10: cross-country isolation and retry/concurrency/crash recovery.

Each is explicitly `NOT_RUN` until its owning runtime exists.
