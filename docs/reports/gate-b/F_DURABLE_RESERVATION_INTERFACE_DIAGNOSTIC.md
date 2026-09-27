# F durable Reserve interface diagnostic — 2026-09-27

## Disposition and immutable scope

**DIAGNOSTIC_ONLY — runtime implementation NOT_STARTED.** The interface audit
is complete; the proposed durable Reserve factory/runner is not implemented.
This is neither a Reserve code candidate nor a Gate B or formal-step closure.

- Exact inspected baseline: `809d1db528a09dbca681e5dc2d6fb7afa260a38d`.
- Isolated branch: `codex/f-durable-reservation-worker`.
- Worktree: `/Users/samuel/Documents/econclub/.econmind-worktrees/f-durable-reservation-worker`.
- Scope actually changed: this report and its companion diagnostic JSON only.
- Runtime candidate SHA: none. The documentation commit is identified by Git
  history and the handoff; it must not be described as an implementation SHA.

The owner requested that this round stop after completion and that records be
updated. Control Tower explicitly limited the remaining round to the final
interface audit and a diagnostic-only handoff if no existing approved bridge
was found. No further implementation or dependent slice is started.

## Existing components that can be reused

The economic calculation and durable state sources are present. Their existence
does not establish that any deployed World has approved opening data.

| Component at the exact baseline                                                            | Existing responsibility                                                                                                                                                     |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/world-worker/src/persistence/opening-seed-store.ts:134`                              | Explicit immutable opening bootstrap; `loadFrom` at line 181 reads and revalidates durable seed provenance. Missing seed fails closed; TEST_FIXTURE provenance is rejected. |
| `apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.ts:452`               | Rebuilds inventory and financial ledgers from opening seed plus durable Command/Event/Posting lineage; validates both WorldVersion and Event sequence against the head.     |
| `packages/core/src/transfers/narrow-treasury-gcu-transfer.ts:573`                          | Existing `reserveNarrowTreasuryGcuTransfer` calculates AVAILABLE → RESERVED with exact quantity, source identity and current three-party approval validation.               |
| `apps/world-worker/src/authoritative-execution.ts`                                         | Existing Worker composition owns the fixed transaction-cutoff guard and `AtomicTransitionRepository`; candidates do not bypass those checks.                                |
| `apps/world-worker/src/persistence/sql-narrow-treasury-gcu-delivery-preparation-source.ts` | An existing durable source/factory for automatic **delivery**, not discretionary Reserve. It is a reference, not a ready Reserve authorization adapter.                     |

Reserve itself performs an inventory reservation, not a Treasury payment.
No new opening balance, price policy, settlement rule or second economic model
is needed or authorized by this diagnostic.

## Minimum unresolved contract: durable authority → Core context

1. **The consumer requires live, branded contexts.**
   `narrow-treasury-gcu-transfer.ts:573–598` takes approval records and three
   `AuthorizedOfficeContext` values. Its `reauthorizeSignature` at lines
   305–331 calls `reauthorizeOfficeDecision`, checking actor, AuthSubject,
   Office, country, World and authorization revision. Merely reading an
   APPROVED database row does not satisfy this contract.

2. **The constructor has a different source contract.**
   `packages/core/src/authorization/offices.ts:220–275` issues the opaque
   context through `authorizeOfficeCapability`, requiring an
   `AuthenticatedPrincipal`, an `AuthorizationResolver` and, for
   SIGN_OFFICE_APPROVAL, a proposal decision scope. The context is branded in
   a private WeakMap. Lines 278–307 reject plain/deserialized objects and
   re-resolve current membership, team and revision.
   `authorization/identity.ts:17–32` defines the principal with a verified
   token envelope (subject, issuer, audience, issuance and expiry).

3. **Durable approval evidence is not that principal/context.**
   `database/migrations/artifacts/0015_world_v2_narrow_transfer_approvals.sql:1–47`
   stores immutable proposal scope, policy, required Offices and status, plus
   actor, AuthSubject, authorization revision and signature time. It does not
   serialize branded contexts or verified principals. The audited SQL store
   `NarrowTransferApprovalStore.assertCurrent` at lines 669–732 returns
   `Promise<void>` after validation; it does not issue Core contexts.
   These are valid distinctions, not evidence that storing JWTs is required.

4. **Proposal scope needs an explicit reconstruction convention.**
   The Core decision scope includes `proposal.version`
   (`narrow-treasury-gcu-transfer.ts:264–273`), and
   `createNarrowTransferApprovalBundle` at lines 455–490 requires
   `proposalVersion`. The immutable SQL proposal has a `policy_version`, but
   no separate Core proposal-version column or audited reconstruction adapter.
   Whether version should be derived from immutable intent or supplied through
   another approved contract must be made explicit; this diagnostic does not
   assume that a schema change is necessary or that the two versions are equal.

5. **Queued execution has the same restart boundary.**
   `packages/core/src/commands/receipt.ts:678–735` accepts an existing final
   receipt first, but a new discretionary execution requires an in-memory
   `intakeAuthorization` and reauthorizes it. Durable command identity alone
   is not an approved replacement. A runner after process restart therefore
   needs an approved server-held authority rehydration contract as well.

No existing production bridge satisfying those contracts was found in the
Worker/API source at the pinned baseline. Test-only contexts and the synthetic
reservation draft used for the prior intake lock regression are not substitutes.
This is a source/interface finding, not a reproduced runtime failure.

A also confirmed that its separate HTTP slice only constructs principals from
fresh verified JWT claims and issues TRADE_CONTRACTS/FINANCE_TREASURY contexts
for intake. It does not issue SIGN_OFFICE_APPROVAL contexts, restore historical
JWTs, derive proposal versions or rehydrate durable signatures into Core brands.
Its intended endpoint remains QUEUED/read, not Reserve execution.

## Required next decision, outside this stopped round

Approve the smallest server-only bridge from durable Command/signature
identities and current authorization evidence to Core's reauthorizable command
and approval contexts, including the immutable proposal-version mapping and
its ownership. It must preserve current identity, World, country, Office,
capability, team/revision and proposal-intent binding; no caller-issued verdict,
fake verified token, cast around the WeakMap or persistent bearer-token storage.

Only after that contract is authorized should the Reserve source/factory and
bounded queue runner be built. Reuse the existing calculation, durable lineage,
lease/claim, current approval guard and atomic repository. Re-read authority at
commit. Preserve submission → lease → head lock order rather than copying a
different source's query order without analysis. Any unavoidable change outside
the assigned files requires a separate boundary agreement.

The future focused native-PG evidence must cover real persisted opening/lineage
inputs, before/delta/after quantities, current and revoked/revised signers,
missing source, version/fence/claim failures, atomic commit and exact retry
without duplicate facts. These tests have **NOT_RUN** in this slice because
there is no Reserve implementation to exercise.

## Verification, boundaries and handoff

Checks for these documentation-only changes: focused Prettier check, JSON parse
and exact-baseline/path consistency check, and `git diff --check`. Results are
recorded in the companion JSON after execution. Runtime tests, native PG,
runtime typecheck and lint are NOT_RUN for this diagnostic; prior-slice passing
tests are not relabeled as Reserve evidence. No unrelated full suite was run.

No changes to Core, Worker runtime, A's API or approval store, E's reader,
intake, schema/migration 0017, migration manifest, formal status/progress,
production data or the original EconMind website. No production Supabase
connection, migration execution, fixture bootstrap or economic write occurred.

The exact interface conclusion was sent to A
(`01a081c3-5310-7510-b03c-1c2f90da3432`) and Control Tower
(`01a08bf9-fe19-7440-88fa-159677b611bd`). A's separately authorized HTTP
register/sign/reference/enqueue/read work is distinct and must not be called a
completed Reserve execution loop. F stops after the record handoff and awaits
an explicit new instruction; no autonomous follow-on work is scheduled.
