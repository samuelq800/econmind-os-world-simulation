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
