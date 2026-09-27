# Narrow transfer approval-reference write contract

## Authority, scope and risk

Base: `2f83974a4aa2bb01a6bae63bf73beaaa2a22402e`; isolated branch
`codex/narrow-transfer-approval-reference`. P0 candidate only; no status/ADR
promotion, independent approval, main merge, production access or publication.
Control Tower explicitly assigned the forward migration, manifest, Worker
approval store and targeted tests. No API, browser, receipt-port or original
main-site edits. Existing migrations remain byte-for-byte unchanged.

Read authority: AGENTS.md, PLANS.md, status/decisions.json, ADR-17, ADR-20,
V10.2 exec-plan, FINANCE-U0062–65, TRADE version-bound approvals. ADR-09 remains
PROPOSED_NOT_APPROVED: this repairs only the existing GRAIN/Treasury-GCU fixture
contract; it does not approve a generic Office resolver, new threshold, new
currency or new economic rule. No package entry or completion is claimed.

## Workflow finding (not resolved by adding a reference)

0015 and `openSellerOffer` require an existing immutable Command. The V10.4
`seedAtomicReserves` fixture explicitly persists it before signing. The API
handler, in contrast, calls `approvalReader.readCurrent` before
`receiptPort.acceptOrRead`. Thus an approval-first initial intake cannot create
its own prerequisite. Current bridge tests inject approval fixtures. They are
not evidence of a working first-intake approval lifecycle.

This candidate supports only this already-existing durable path:
trusted Command persistence → Seller Trade offer → Buyer Trade and Finance
signatures → immutable reference binding → consumer verification → separately
guarded authoritative execution. Persistence/approval is not settlement.
No unapproved Command is made executable by this candidate.

The API/F owners must separately reconcile registration versus execution and
provide authenticated pre-approval intake/signing routes or an explicitly
approved equivalent lifecycle. Do not seed fake approval refs to claim Gate B.
If this requires a new economic lifecycle or ADR, stop that affected work for
owner decision. This patch does not silently remove the API approval gate or
the Worker's durable-Command prerequisite.

## Implementation contract

- Reserve forward artifact 0017 after checking manifest (max 0016), all Git
  refs for 0017 (none), remote approval/0017 heads (no competing reservation)
  and Control Tower's explicit confirmation that 0017 is reserved for A.
- Add an append-only, RLS-denied reference table. `(world_id, approval_ref)`
  identifies exactly one buyer proposal/Command/fingerprint/Finance signature;
  one proposal has one reference. Scope/signature composite foreign keys and
  insert validation reject mismatches. No historical backfill or guessed refs.
- Add `bindBuyerFinanceApprovalReference` to the Worker store. Caller supplies
  a server-selected canonical reference and current server observation time,
  not a forged signature. Derive all binding fields from locked durable facts.
- Require complete existing approvals and re-read all current Office revisions
  inside the transaction, including retries. Expired/revoked/stale fails closed.
- Exact retry returns the first immutable binding; reused ref or a replacement
  ref for the same proposal conflicts. Unique constraints arbitrate concurrent
  writes. The reference is audit linkage, never authorization by itself.
- Consumers must match world, buyer country, proposal, Command ID/fingerprint
  and current Finance authorization. API adapter is separately owned. No alias
  from an arbitrary `proposalRef` to the canonical buyer proposal is invented.
- Existing commit-time `assertCurrent` remains mandatory. This patch never
  grants execution based only on reference existence.

## Validation and delivery

Targeted PGlite and disposable native PostgreSQL: success/exact retry,
concurrent retries, ref collision/rebinding, changed intent, missing Command,
missing signatures, stale/revoked authority, expiry, transaction rollback,
immutable rows, direct-SQL scope/signature mismatch, denied browser roles and
unaltered old migration hashes. Lint/format/typecheck, migration provenance,
boundary/environment/secret checks. Report NOT_RUN explicitly for absent
evidence. Commit artifact first; bind manifest hash to that immutable commit.
Freeze final SHA for Review B; no self-merge or Gate B promotion.

Control Tower additionally assigned the focused
`.github/workflows/narrow-transfer-approval-reference.yml` workflow. Native
evidence uses only the ephemeral PostgreSQL 16 service in GitHub Actions.
`APPROVAL_REFERENCE_NATIVE=1` runs the same store tests against fresh per-test
databases behind the existing local/CI environment guard. The tests close
connections and delete only databases/roles they created. No local server or
production connection is needed. F separately owns intake/receipt lifecycle
separation; actual usage/UX testing remains outside this code-only slice.

## Scoped integration acceptance — 2026-09-27

B independently approved exact candidate
`0a61951e7d6b94f6f68b54d4cad46d0a460c13bc` against base
`2f83974a4aa2bb01a6bae63bf73beaaa2a22402e`: P0=0, MAJOR=0.
Reviewer task: `01a086cd-8c3b-7182-b14f-4d3b77f3b67d`.
B verified all six files, immutable migration source/hash, current-authority
checks, exact reference/signature binding, retries and conflicts. The reference
is linkage, not a standing credential or replacement for commit-time checks.

Exact-candidate native PostgreSQL 16 evidence:
[run 36301986278](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/36301986278),
job `108571196630`, SUCCESS; 13 store tests including 11 reference-contract
tests. B also independently reported PGlite store/schema 14/14 and architecture
34/34 plus both scanners PASS. These are separate evidence types.

Control Tower integrated without conflict at
`b953d29fb0bae08a147e9720e7e40fb544b1a3ae` on prior main
`597566d61df8d3142615f58075757911aa375f37`. Composition checks:
`pnpm migration:validate` PASS (17 entries), targeted store/schema PGlite tests
14/14 PASS, `git diff --check` PASS. No duplicate full-suite run.

This unblocks E's server-only reader against the reviewed contract. Initial
registration, signing API, F's intake/queue integration, actual usage,
production migration publication and Gate B remain separate and incomplete.
