# V07.3 package-review forward fix

## Immutable binding

```text
SUPERSEDED_PACKAGE_REVIEW_TARGET=e802a5233ded3825c56d2897374fcd2de0c40da8
V07_3_FIXED_CODE_CANDIDATE=2b42e0d725da590a24e845a7046501af8f8d4c01
STATUS=IMPLEMENTED_UNVERIFIED
MIGRATION_CHANGE=NONE
PRODUCTION_MUTATION=NONE
```

## Findings implemented pending independent closure

- `V07-PKG-BLK-02`: replay now consumes explicit versioned transition groups.
  Every group must start at the current replay WorldVersion, advance it by
  exactly one, and contain one or more contiguous Events whose independent
  sequence, causation Command and after-version all match the group. All Events
  are reduced before WorldVersion advances once.
- `V07-PKG-MAJ-03`: replay recomputes the canonical seed hash from
  `canonicalSeed` using the supplied canonical SHA-256 adapter and rejects any
  mismatch with the declared seed or origin lineage.
- `V07-PKG-MAJ-04`: replay keeps a scoped set of seen Event identities and
  rejects duplicates before a second application, including across otherwise
  valid contiguous transitions.

Event sequence remains the global deterministic order. WorldVersion represents
logical transition boundaries and is not a per-Event counter. No incompatible
history is silently regrouped.

## Ownership boundary

V07 defines and verifies the transition/Event/replay facts. V09 still owns
atomic persistence, checkpoint recovery scanning, leases, fencing and the
single authoritative writer. No V08 or V09 implementation was added.
