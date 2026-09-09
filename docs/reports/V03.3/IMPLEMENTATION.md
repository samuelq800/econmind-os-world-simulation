# V03.3 implementation report

## Status

- Implementation commit: `52e62f1b988a3f0c650cf5f4032fada78c7fe43c`
- Effective risk: P0 deterministic serialization boundary
- Status: `IMPLEMENTED_UNVERIFIED`; Gate A independent review required

## Implemented scope

Stable domain error codes and model/schema/registry versions now fail closed.
Canonical serialization sorts object keys, serializes domain exact values as
strings, and rejects ordinary JS numbers, bigint, undefined, functions,
symbols, cyclic structures, Dates, and other arbitrary prototypes. The hash
preimage convention is frozen as `SHA-256`, newline, then canonical JSON; actual
cryptographic persistence hashing remains future server work.

No command, event, receipt, ledger, persistence, or replay schema was introduced.

## Actual validation

Determinism, repeat serialization, exact decimal representation, rejected
number leakage, cycles, unsupported objects, and version mismatch are covered
by the passing V03 suite and strict core typecheck.
