# V07.3 deterministic replay implementation

## Result

```text
STEP=V07.3
STATUS=IMPLEMENTED_UNVERIFIED
CODE_CANDIDATE=956d011df95f383917b421ffc522eb896477970a
RISK=P0
PRODUCTION_MUTATION=NONE
MIGRATION_CHANGE=NONE
```

## Implemented contract

- Added an explicit replay version binding covering replay schema, Event
  schema, reducer registry, engine, model, domain registry, World schema and
  exact numeric-policy versions. Unknown or mismatched bindings stop before a
  reducer runs.
- Added canonical opening-seed provenance and a validated replay origin usable
  for an opening state or checkpoint. It binds World, last Event sequence,
  WorldVersion, canonical state/hash, seed hash and binding hash.
- Added contiguous same-World replay with exact Event payload/fingerprint
  verification, monotonic WorldVersion checks and fail-closed behavior for
  gaps, duplicates, reorder, tampering, foreign Worlds and unknown Event types.
- Reducers receive a trace-free immutable Event projection and frozen inert
  state/payload. Real audit timestamps cannot affect replay state.
- Added an explicit counter-based deterministic RNG interface derived from
  seed, version binding, World, Event, stream and counter. It defines
  reproducibility but no stochastic economic rule.
- Added exact canonical live/replay hash comparison with no write-back or
  tolerance.

## Ownership and boundaries

- Reads only canonical opening/checkpoint evidence and immutable Events.
- Produces pure reconstructed state and hashes; it does not mutate World head,
  Event history, receipts, queue, outbox, snapshots or economic positions.
- No migration was added. V09 owns checkpoint persistence, recovery scanning,
  lease/fencing and authoritative commit.
- Replay of committed facts never reauthorizes the historical actor.

## Changed files

- `packages/core/src/replay/replay.ts`
- `packages/core/src/errors.ts`
- `packages/core/src/index.ts`
- `tests/world-core/replay.test.ts`
- `tests/property/replay-properties.test.ts`

## Known limits

- Reducer functions are a trusted versioned registry boundary; economic Engine
  reducers arrive in their owning packages and must explicitly register a
  compatible version.
- The current implementation validates in memory and does not claim real
  PostgreSQL checkpoint/recovery or multi-process failure testing.
- Large-state performance remains for V30 profiling; correctness uses exact
  canonical serialization with no optimization shortcut.
