# V03.1 implementation report

## Status

- Implementation commit: `52e62f1b988a3f0c650cf5f4032fada78c7fe43c`
- Effective risk: P0 deterministic authoritative numeric semantics
- Status: `IMPLEMENTED_UNVERIFIED`; Gate A independent review required

## Implemented scope

`decimal.js` 10.6.0 is fixed in the core package and lockfile. Only the numeric
layer imports it, through an isolated 80-digit half-even `WorldDecimal`
constructor. Authoritative input is a canonical decimal string; whitespace,
exponents, separators, leading zeroes, JS numbers, NaN, and infinities are
rejected. Canonical output removes redundant trailing zeros and normalizes
negative zero.

Money, Quantity, Price, Rate, and non-clock SimTime primitives enforce currency,
unit, range, and string-first rules. Formula-specific rounding, minor units,
settlement, and V06 scheduling remain unimplemented.

## Validation history

The first typecheck exposed an incorrect decimal.js import form; it was changed
to the library's named ESM class. A later registry test incorrectly looked for
the error code in message text; it now inspects the structured `DomainError`
code. Final core typecheck and 10/10 example tests passed.
