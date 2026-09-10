# V07 package review bundle

## Review target and hard stop

The complete V07 content lineage ends at the V07.3 freeze commit
`190bd3b145f8e284c591446daaa1c6da355aa065`. The immutable package review
target is the commit containing this bundle and aggregate evidence; its exact
SHA is frozen separately in `docs/reports/V07/PACKAGE_REVIEW_TARGET.md`.

Package status is `IMPLEMENTED_UNVERIFIED / READY_FOR_PACKAGE_REVIEW`. V07.1,
V07.2 and V07.3 remain `IMPLEMENTED_UNVERIFIED`. This bundle does not claim
package verification, authorize migration publication or main merge, permit
production access, or open V08.

## Authority

- ADR-11, ADR-16, ADR-17 and ADR-20 are canonically `APPROVED` in
  `status/decisions.json`.
- ADR-16 approves the new `world_v2` namespace and branch-local DDL design; it
  is not approval to merge or publish either migration.
- ADR-20 fixes intake authorization plus commit-time reauthorization for
  pending discretionary Commands. Already committed facts remain facts, and
  versioned automatic obligations are not retrospectively revoked.
- Authoritative main remains
  `8e4d9e125a89fc1457ed016c708537fd67e1c8b7`; V07 remains isolated on
  `codex/world-core-v07`.

## V07.1 — Command/Event Schema 与不可变 Ledger

- Historical code candidate:
  `b8c8555bac1f5e8d36d1f147732a691f248431f8`.
- Historical review target:
  `b57b6aa9cd349776e1f5cd8ae10d20413523a69c`.
- Active corrected code candidate:
  `674e6cdf38bb2d52d3ec81d52616bb85a3cfd58f`.
- Active corrected review target:
  `66da354755326fc00ece7fcdb78e35db27f0b15f`.
- Review B decision: `APPROVED_FOR_CONTINUATION`;
  `CORRELATION_FINGERPRINT_MAJOR=CLOSED` and `OPEN_DOWNSTREAM_BLOCKER=0`.
- Superseded intermediate evidence target:
  `02b377614a7337b1d8d7442bae50c534ddbbe3c4`; its subsequent freeze
  `17eb43e` was superseded by the pinned-property target.

The active fix excludes `correlationId` and `submittedAtReal` trace metadata
from the one authoritative Command-intent fingerprint while retaining every
authoritative-intent field. Exact retries cannot create a second Event/effect;
changed intent fails as `IDEMPOTENCY_CONFLICT`.

## V07.2 — Receipts/Outbox/Idempotency

- Migration/artifact source commit:
  `2b3349555137196612bea6d55e22edf156f53cbd`.
- Code candidate: `0f260ab1b582c524dc3005e0de62202d1c5d9a24`.
- Review target: `cea9554c5ad9c3ad69e0ec538c908901660ec761`.
- Review-target freeze commit:
  `2b75d211c91ce4633f1c646618ee076a29a30880`.
- Independent step review: deferred to this V07 package gate by explicit owner
  continuation.

The step separates acceptance from final receipts, returns original receipts
for exact duplicates, rejects changed intent, performs ADR-20 commit-time
reauthorization for pending discretionary work, preserves committed facts and
automatic obligations, and separates immutable authoritative references from
operational outbox/consumer delivery state. V09 still owns leases, fencing,
single-writer enforcement and the final atomic economic/Event/receipt/outbox
transaction.

## V07.3 — Replay、Seed 与版本绑定

- Code candidate: `956d011df95f383917b421ffc522eb896477970a`.
- Review target: `2b645f963422ac7dcb39c599768003e93ddc22d3`.
- Review-target freeze commit:
  `190bd3b145f8e284c591446daaa1c6da355aa065`.
- Independent step review: pending this V07 package gate.

The step binds replay schema, Event schema, reducer registry, engine, model,
domain registry, World schema and numeric policy versions; validates opening
seed/checkpoint provenance and contiguous immutable Events; exposes explicit
counter-based deterministic RNG; and compares canonical live/replay hashes
without write-back. V09 retains checkpoint persistence, recovery scanning,
leases, fencing and authoritative commit mechanics.

## Cross-step acceptance chain

The package reviewer must verify the complete chain:

1. canonical Command intent and idempotency identity are accepted once;
2. the durable queue preserves V06 SimTime ordering and ADR-20 authorization;
3. authoritative execution emits an immutable Event and one final receipt;
4. outbox and per-consumer redelivery never re-execute economic effects;
5. replay consumes the immutable Event sequence with exact seed/version
   bindings and reproduces the canonical state hash.

The review must also confirm that correlation/audit metadata cannot influence
authoritative fingerprints or replay, that no in-memory store becomes a second
source of truth, and that V09-owned concurrency/transaction mechanics were not
silently claimed.

## DDL and migration state

- `0002_world_v2_command_event_ledger.sql` SHA-256:
  `92915905a159961ac0f8eb70f509501cf7697519471c1b84f832ef224cf87695`.
- `0003_world_v2_command_receipts_outbox.sql` SHA-256:
  `bed513ccb1ae555d8c669597c61a46d6d56cdc8173a681a4da818934719502d0`.
- Both are branch-local, manifest-bound candidates in the sole V02 migration
  chain. Neither has `production_approval`.
- No RLS/grant expansion, backfill, shared-schema write, real database access,
  DDL promotion or production mutation occurred.

## Evidence and limits

- Final full baseline at the V07.3 code candidate: 31 files, 383 tests,
  `PASS`.
- Protected architecture: `3 files / 34 tests / PASS`.
- Authoritative scanner: `25 core files / 37 total files / PASS`.
- Boundary scanner: `42 files / PASS`.
- Migration rehearsal: three migrations, clean-baseline and existing-schema
  PGlite modes both `PASS`.
- Secret scanner: `466 files / PASS`; workspace build: `PASS`.
- Normal-engineering findings at freeze: open `P0=0`, open `P1=0`.
  Independent package review may add findings.

PGlite is PostgreSQL-compatible rehearsal only. Real Supabase/RLS, concurrent
multi-process writer behavior, crash recovery, V09 fencing, production access
and production mutation were not run and are not claimed.

## Required independent decision

Review the immutable package target, not the mutable branch head. Return an
explicit package-level decision bound to that SHA and list any P0 blockers or
P1 majors. Until independent approval and subsequent owner action, V07 remains
`IMPLEMENTED_UNVERIFIED`, the DDL remains unpromoted, and V08 remains
`NOT_STARTED`.
