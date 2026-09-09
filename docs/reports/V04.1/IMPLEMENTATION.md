# V04.1 implementation report

## Status

- Implementation commit: `b91fb6ec92d9a19ff23eaeb7573b69e838dca0cc`
- Effective risk: P0 deterministic property-test foundation
- Status: `IMPLEMENTED_UNVERIFIED`; Gate A independent review required

## Implemented scope

The test-only `@econmind/testkit` package pins `fast-check@4.9.0` and provides
canonical generators for exact decimals, identifiers, Money, Quantity, Rate,
and compatible Price/Quantity pairs. The Foundation property suite uses fixed
seed `20260909`, 250 runs per property, verbose counterexamples, and
`endOnFailure` so a failing seed/path can be replayed.

Production packages do not depend on fast-check.

## Actual validation

Six properties passed: decimal round-trip, arithmetic type closure,
Price-times-Quantity exact Money, deterministic invalid-input rejection,
registry uniqueness, and stable serialization.

The first property invocation failed before collection because fast-check was
only resolvable from the testkit workspace. The root test runner dependency was
then pinned to the same version; the property suite passed without weakening a
property.
