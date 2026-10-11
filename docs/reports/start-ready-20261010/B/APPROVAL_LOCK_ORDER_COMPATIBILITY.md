# B — durable narrow approval / H-first authorization writer compatibility

Frozen implementation handoff, 2026-10-11. **IMPLEMENTED_UNVERIFIED**.
Producer B. Root must assign a non-implementer review. This is not independent
closure, E-I01 closure, a real authorization source, merge or runtime admission.

## Exact subject

- Branch: `codex/b-approval-lock-order-20261010`.
- Base: `eb033a4d9e717a9cb9149e450900b606c3457403`;
  tree `13a60f04c1a9c54eb8ffbaca8b469bf25b293dce`.
- Code: `97ab122d4da146ea20d8d57dac4fd896992b5cec`;
  tree `95cac687e1b9a4a1deab0e42bbbee1483dcb6634`.
- Exact binary/full-index/no-renames/no-ext-diff base-to-code delta SHA256:
  `6e3b4ab19530cae747c3cd1e06754b9728379b01114b2dc838673ca5bcf5e2d8`.
- Four code files: one existing Worker store, one new native test, its private
  test fixture and a new strict test configuration. Product delta is 15 added
  lines / one replaced comment line; eight added executable lines.
- `APPROVAL_LOCK_ORDER_EVIDENCE.json` binds source hashes, actual checks, initial
  failures, immutable code identity and explicit NOT_RUN boundaries. Evidence
  commit/tree are supplied in the final handoff to avoid a self-referential hash.

Root's latest scoped implementation assignment was used, not historical V08
review/deploy wording or the delayed response to the September23 question. Both
historical reviews already had completion records; no duplicate agent/review was
started. The original F-B-01 source-only closure was not reopened.

The complete C writer-design review was read, including both consumer chains:
`/Users/samuel/.codex/state/plugins/codex-security/scans/o-owner-inputs-exact-20261010/artifacts-7c60b5ca12d34d85296a0b822c3e569cfac7d802a7e835c3a45003f825d27f98/artifacts/C_CURRENT_AUTHORIZATION_WRITER_DESIGN_REVIEW/review.md`.
SHA256 `3555d9102ef51428645f798990e816de6391c78aa09012f1c13448e9713e6550`.
C's original statement was a source-inferred A→implicit FK-H / H→A cycle, **not
an independently reproduced old-API deadlock**. That distinction is preserved.

The base was freshly fetched `origin/main` when this branch was created. Local
`main` was stale and not moved. `origin/main` subsequently advanced 13 commits;
this candidate was not rebased or combined with other owners' changes. Root
must review/integrate its exact delta, not treat this checkout as current main.

## Minimal mechanism and actual transaction frontier

The existing private `lockAndAssertDurableCommand` still locks the matching
durable submission **S FOR UPDATE**, rejects a missing row and checks the exact
canonical payload/hash/fingerprint before proceeding. It then locks exactly the
existing same-World **H FOR SHARE**, checks exactly one matching head and holds
it through the enclosing transaction. No insertion, timestamp refresh or head
mutation is added. No alternate auth query helper, global lock reordering or new
public product API is introduced.

H SHARE conflicts with the specified writer's H UPDATE (also NO KEY UPDATE),
so the consumer cannot reach A/proposals/signatures before obtaining the
serialization point. A proposal's later implicit FK KEY SHARE is compatible
with this already-held H SHARE. The lock is not released at helper return.

SHARE is deliberate: `DurableV08LedgerLineageReader.#readHead` already takes H
SHARE during reservation preparation. Blindly upgrading that existing lock to
UPDATE would create a new lock-upgrade contention surface between readers. An
approval does not advance H, so UPDATE is unnecessary. The native SHARE-holder
control specifically rejects such an upgrade regression.

| Entry / actual caller                                               | Fixed supported frontier                                                                                                                                                                                                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openSellerOffer`                                                   | Owned transaction: durable S UPDATE → H SHARE → current seller A UPDATE → proposal/signature and implicit FK checks.                                                                                                                                  |
| `signBuyerOffice` (TRADE and FINANCE)                               | Owned transaction: durable S UPDATE → H SHARE → proposal locks → current signer A UPDATE → signature/proposal update.                                                                                                                                 |
| `bindBuyerFinanceApprovalReference`                                 | Owned transaction enters `assertCurrent`: durable S UPDATE → H SHARE → complete proposal/signature/current-A checks → immutable reference insertion/readback.                                                                                         |
| `assertCurrent`                                                     | Caller-owned transaction: same helper before any of its proposal/signature/A access. Existing S/H locks are reacquired on the same rows, not different IDs.                                                                                           |
| `PostgresNarrowTransferIntake.#inspect`, existing ENQUEUE           | Already S UPDATE → H UPDATE → generic current authority → `assertCurrent`. Reacquisition is compatible. First SUBMIT or its missing-S/read recovery never invokes the approval helper; no reverse S lookup was added to the H-first missing-S branch. |
| `PostgresAtomicTransitionRepository.commit`, positive narrow commit | Already durable S UPDATE → lease/commit guard → H UPDATE → current execution authority → narrow `assertCurrent`. SQL0005 guard owns H before the latter. No lease, positive-commit or zero-effect policy was changed.                                 |
| `createLocalNarrowReservationWorker`, candidate preparation         | S UPDATE → immutable Command read SHARE (same S) → active lease SHARE → lineage H SHARE → narrow `assertCurrent` (same S/H) → current-A checks. New H remains SHARE; no upgrade.                                                                      |

Relevant fixed-source locations are store276/388/471/579/683; intake186–236;
atomic repository commit831–883 and SQL0005 guard242–265; reservation worker
191–220; lineage reader463–480/505–540. Source hashes are bound in the JSON.
This is a bounded caller audit, not proof about an unknown deployment catalog.
The helper is explicitly not for a new H-first transaction without an existing
durable S frontier. Root/A/E must retain that split during future integrations.

Unchanged: canonical identities and fingerprints; SimTime; exact duplicate /
changed-intent behavior; signer/Office/country/revision/expiry rules; required
TRADE+FINANCE approvals; SUBMIT→approvals→ENQUEUE; immutable references;
inventory, financial, Event, receipt and queue semantics; lease policy.

## Native evidence — exact scope

New native suite: **16/16 PASS**, one owned PG16.15 Homebrew cluster, private
Unix socket, TCP disabled, Node24.20.0 / pnpm12.3.4. No ambient DSN, borrowed G
cluster, production key or production connection. All23 manifest migrations
were digest-checked and applied verbatim to an empty template, then fixtures
were cloned into isolated test databases. Storage veto0022 and Posting0023
were preserved; no veto was removed, no formal admission constructed.

Admin was used only for test cluster/schema/fixture provisioning and observation.
The actual new store calls and H→A competitor run as separate LOGIN roles with
`NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`. Test-only RLS
policies and exact table/column grants permit this fixture; they are **not** a
production ACL proposal. Column UPDATE rights needed by existing SELECT FOR
UPDATE/SHARE row locks are explicit. No economic Event/inventory/financial
INSERT privilege is granted to the approval role. Immutable history triggers
remain present. Deployment ACL compatibility remains NOT_RUN.

Six real entry/frontier variants each exercise both orders: offer, Buyer TRADE,
Buyer FINANCE, reference bind, caller-owned `assertCurrent`, and an already-held
S→H UPDATE frontier. Waits are observed through `pg_blocking_pids`, not inferred
from sleeps. Barriers have a3s deadline, lock timeout5s, statement timeout8s.

1. **Writer first:** competitor holds same-World H UPDATE; actual API takes S
   and waits on H. Trace contains only S/H, no A/proposal/signature query even
   attempted. Competitor revokes/advances current A and commits. The post-H
   READ COMMITTED consumer re-reads authority, denies, and leaves the complete
   head/Command/proposal/signature/reference/economic snapshot unchanged.
2. **Approval first:** actual API holds H; the competitor demonstrably blocks
   on that backend until approval COMMIT. The expected immutable proposal /
   signature/reference effect is applied once. Competitor then revokes/advances
   A and commits. Retry denies without changing any immutable history.
3. Controls: exact reference retry preserves the entire snapshot; another
   World's held H does not block this World; missing S stops before H and any
   approval query; an existing H SHARE plus a second same-World SHARE holder
   permits `assertCurrent` without lock upgrade. Role flags, lack of economic
   INSERT grants and both storage veto policies are checked.
4. **Old SQL shape control:** direct SQL uses S→A→proposal implicit FK-H against
   H→A. Exactly one real PostgreSQL `40P01` is observed; both transactions roll
   back and the snapshot is unchanged. This is a source-shaped native control,
   **not execution of the immutable old API**, not a claimed old production
   incident, and not A's implemented writer/source integration.

The H→A competitor only performs the specified primitive lock/update shape on
TEST_ONLY A rows. It does not implement A's complete-replacement/CAS/checkpoint,
real-source/admin/upstream-cutoff contract. No fixture is called registered,
admitted, READY or a real Office authority source. The new implementation's
native competition evidence is distinct from that missing integration.

## Focused checks and failures preserved

- Final native suite16/16 PASS, exit0.
- Six related regression/architecture/governance files100/100 PASS, exit0:
  existing approval store, durable consumption, boundaries, foundation gates,
  foundation CI gate and V01 governance. Durable consumption includes mocked
  mechanism tests and is not relabeled native acceptance.
- Existing staged narrow transfer HTTP suite20/20 PASS, exit0, **PGlite**:
  real local HTTP→SUBMIT→three signatures→bind→ENQUEUE→Worker, current revocation,
  retry/acknowledgement-loss, original SimTime, rollback and once-only effects.
- Core build, Worker build, Worker strict typecheck, new test strict typecheck
  (`strict` and `skipLibCheck:false`), focused ESLint and Prettier PASS.
- Boundaries PASS334 files; authoritative-pattern PASS91 Core/329 total;
  migration validation PASS23; foundation policy PASS; secrets PASS2459;
  clean local environment PASS (`NOT_LINKED`, database mutation disabled).
- Exact diff/cached diff whitespace PASS. Owned PG server process check is empty
  after fixture close; only mkdtemp-owned cluster data was removed after stop.

First native draft was12 PASS /2 FAIL (exit1), preserved in JSON: missing
test-role reference UPDATE-column privilege caused SQLSTATE42501 in successful
bind paths. The fixture alone was corrected with `UPDATE(approval_ref)`; no
product grant or SQL file changed. This was not suppressed as a flaky pass.

First strict invocation produced four TS2345 errors from a union Promise return
in the test dispatcher. Its shell chain ended with successful ESLint and hence
wrapper exit0; this was explicitly treated as **strict FAIL**, not PASS.
Dispatcher now returns `Promise<unknown>`; separate strict invocations exit0.
No compiler flag or third-party declaration was weakened. The original
intermediate approval13/13 run is retained but not double-counted in final
totals. Native ran before the final source explanatory-comment addition only;
the executable source and test contents were already those of the frozen code.

## Boundaries retained / stop

NOT_RUN: full suite/full check/420; provider CI; immutable old API execution;
A real publisher/current-admin/source-registration and upstream cutoff/expiry
integration; actual deployment ACL/catalog; D's separate zero-effect fix;
formal source→opening→runtime admission; production, deployment, push or merge.

D owns `recordZeroEffectReceipt` and its absence predicate fix; its file is
unchanged here. A owns authz writer; G owns intake resources. No caller, SQL,
migration, status, gate, grant, economic rule or other owner's file was edited.
Source-only preflight F-B-01 is not rechecked or promoted by this handoff.

Production HOLD and E-I01 remain unchanged. Compatibility implementation and
bounded producer evidence are delivered, **not independently approved**.
Root receives exact code/evidence identities, must obtain non-implementer
review, and owns any later composition. STOP; no follow-on work is authorized
by a green fixture.
