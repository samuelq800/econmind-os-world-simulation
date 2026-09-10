# ADR-16 — Shared Supabase namespace and migration publication authority

## Status and authority

```text
Decision: APPROVED
Authority: RESPONSIBLE_HUMAN_OWNER
Approved at: 2026-09-10T01:23:40Z
```

This record transcribes the project owner's explicit decision. It is not a
Codex self-approval. It does not authorize production publication.

## Approved resolution

- World V2 authoritative persistence uses the non-public `world_v2` schema.
- World Core uses the sole V02 migration manifest and release-provenance chain.
- Every migration candidate binds its migration ID, source repository commit,
  historical artifact path, and exact bytes/hash.
- World Core may prepare candidate artifacts and run isolated rehearsals.
- The existing main-site repository remains the sole production migration
  publisher for the shared Supabase production project.
- A second migration publication chain, dashboard/manual production SQL, and
  reuse of Legacy tables as World V2 authoritative economic storage are
  prohibited.
- Actual production publication remains separately human-authorized.

## Exact implementation boundary

V07-V09 may build, validate, and independently review branch-local candidate
DDL under the approved namespace and provenance contract. Approval of ADR-16
does not promote any existing candidate, merge it into the publication chain,
authorize access to production, or publish production DDL. Candidate promotion
continues to follow the owning package's review and owner-acceptance lifecycle.

## Alternatives not selected

- A separate World Core migration publication chain.
- Reusing Legacy tables as World V2 authoritative economic storage.
- Dashboard or manual production SQL as migration authority.

## Compatibility

Already published migrations remain immutable. A later schema or publication
change requires a new explicit decision and forward migration; it may not
rewrite historical migration bytes or erase accepted economic facts.

Affected work packages: V01, V02, V28, V30, V31. World Core candidate DDL is
consumed by V07-V09 under their own package gates.
