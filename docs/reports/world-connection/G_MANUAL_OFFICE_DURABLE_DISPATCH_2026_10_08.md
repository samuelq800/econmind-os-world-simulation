# G SHARED-3 manual Office durable dispatch candidate

Status: `IMPLEMENTED_UNVERIFIED`, P0. Independent review and Root integration
remain pending. No engine, host, production database or loop was activated.

Base: `bcfc66787631a13aa5093df42954070c2d7dd66b` (PR116).
Dedicated branch: `codex/g-office-durable-dispatch`.
Checkout: `.econmind-worktrees/g-office-durable-dispatch`.
The immutable candidate SHA/tree, raw logs, patch, source tar and hashes are in
external packet `artifacts/G_MANUAL_OFFICE_DURABLE_DISPATCH_2026_10_08`.

## Implemented scope and authority

The existing Worker bounded selector now recognizes exactly these manual families:

| Canonical family                       | Current manual capability    | Existing factory/source                                      |
| -------------------------------------- | ---------------------------- | ------------------------------------------------------------ |
| CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1  | CAPTAIN_CABINET              | CaptainPoliticalCapitalRuntimeSource + Captain factory       |
| CORE_CENTRAL_BANK_OMO_V1               | CENTRAL_BANK_MONETARY_POLICY | CB reader + loadCentralBankOmoCandidateSource + CB factory   |
| CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1 | SOCIAL_LABOUR                | SqlSocialJobMatchCandidateSource + Social factory, PLAN only |

The same actual command_submission and command_queue are read; no command or
source snapshot can be supplied to consumeOnce. The optional officeReaders port
is trusted server construction only, with a fixed family switch. It accepts no
caller-selected candidate factory, economic draft, runtime-ready flag or registry.
Missing bindings remain `BLOCKED MANUAL_OFFICE_SOURCE_NOT_BOUND` before claim.
The original local/CI and production-connection rejection guards remain literal.

Each manual command is parsed by its existing strict Core family parser. Current
subject/country/office/capability/team/revision are obtained from actual SQL, with
incoherent active membership refused. READ does not grant manual authority.
The durable subject envelope is the earlier intake audit anchor, using the same
existing Worker/Core membership protocol; it is not a new JWT/login authority.

Source preflight calls only trusted readers and pure existing data/kernel checks;
it does not issue a commit proof, candidate draft, receipt, posting or event.
A new claim locks submission, existing lease, head, current capability/revision
and queue, verifies the same canonical command and exact expected version, then
updates only the existing PENDING row. A CLAIMED row can continue only for the
same Worker and current fencing token; there is no acquisition or takeover.

Execution goes through the existing createAuthoritativeWorkerExecution,
processQueuedCommand, genuine Core-issued authorization proof and the existing
AtomicTransitionRepository. The real family factory rereads its source after
claim and retains its proof/source/kernel checks. Existing SQL cutoff, lease,
fence, CAS, ledger, receipt, authorization audit, outbox and FINAL settlement
remain authoritative. The new preflight is not a second execution protocol.

Automatic CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1 remains unsupported; Social source
construction explicitly binds automaticAuthority:null. No system grant is
created from the manual PLAN authority. Reservation, Shipment and Delivery
construction, factories and automatic claim branch are unchanged.

Owned files: existing durable-command-consumption.ts; new narrow
manual-office-command-composition.ts; direct manual-office-durable-dispatch test;
two explicitly TEST_ONLY fixture helpers; bounded direct-test tsconfig; this
report. No Core export, publisher/projector/DTO, source SQL, API intake, schema,
role/grant, opening adoption, status/progress, UI or legacy data was changed.

## Actual validation

Pinned Node 24.20.0 and native pnpm 12.3.4; frozen offline install exited 0.
Checks use Root's toolchain wrapper, no configured production database.

Final bounded four-file matrix at 15:22:26: **98 PASS**, 4 passed files,
22.18 seconds, exit 0. It includes 19 new actual PGlite direct tests, the original
36 durable-consumption goods regressions and existing Captain/CB source suites.
The new tests apply actual original schema migrations through release_order 17,
store actual canonical commands, current authorization, leases and queue rows,
and exercise actual SQL through the existing authoritative execution/repository.

Captain and CB each commit one real event/receipt/audit/outbox, advance the head
once, finalize the queue once and return IDLE on the next consumption. CB records
one real financial posting batch. Exact capability audit rows are asserted.
Negatives cover all three missing server bindings, bound missing SQL sources,
actual Social NOT_READY operating state, revoked/wrong capability before claim,
revocation after claim (genuine AUTHORIZATION_REVOKED FINAL), cutoff rollback,
old expected versions, head change between preflight and claim, expired lease,
stale claimed fence and unsupported automatic Social MATCH. Missing source before
claim has zero queue attempts and zero economic/receipt/head effects.

The disposable source data is explicitly TEST_ONLY. Captain reads its fixed
source snapshot from a private fixture SQL table. CB reads its original
TEST_FIXTURE seed/facts/trace from that table, calls actual Core parseOpeningSeed
and rebuildV08LedgersFromLineage, then uses the real CB factory. Neither fixture
is adopted genesis. WorldOpeningSeedStore remains unchanged and rejects
TEST_FIXTURE provenance. The tests use the disposable schema owner and do not
prove non-superuser roles, RLS, native concurrency or production grants.

Core build, Worker build/typecheck, direct-test tsc, affected ESLint/Prettier,
boundary scan, authoritative-pattern scan, local environment, repository secrets
and diff check are recorded with individual exit codes in check-exits.json.
Architecture gates: 34 PASS, 3 passed files, 15:24:26 / 10.00s, exit 0; recorded separately in the same packet. Raw final
and repair logs are retained rather than replacing earlier FAIL with PASS.

Preserved failures:

- Initial Worker build TS2305: private bindCommitAuthorizationToCommand is not a
  Core export. Removed that attempted import; preflight remains pure, with proof
  issuance exclusively in the existing execution protocol. No Core export added.
  Original terminal diagnostic was observed; a separate raw first-build log was
  not captured. The repair build log is preserved.
- Initial direct matrix 15:11:37 / 17.20s: 50 PASS, 1 FAIL. A test-only automatic
  Social authorization fixture violated the formal non-null office_id column.
  Retained null on the canonical automatic command; actual manual authorization
  fixture row remains SOCIAL. No schema constraint was changed.
- Initial direct tsc: unused fixture imports and imprecise effects return type;
  corrected only test declarations.
- Repair 15:15:17 / 17.52s: 50 PASS, 1 FAIL; CB test used wrong ledgers.financial
  return shape. Direct tsc also failed. Corrected the fixture read shape.
- Repair 15:19:18 / 17.03s and diagnostic run: CB TEST_FIXTURE opening was refused
  by the real server opening store with OPENING_SEED_INVALID. Preserved that
  refusal; moved TEST_ONLY seed to the private fixture source table rather than
  changing provenance or weakening the server store.
- Repair 15:21:33 / 21.41s: 53 PASS, 2 FAIL from a temporary diagnostic
  JSON.stringify on receipt BigInt. Removed the diagnostic serializer; production
  command/receipt serialization was unchanged.

## Remaining dependencies and next action

At this fixed base the existing Social source selects command_type from
command_queue although the formal queue schema has no such column; the type is
on command_submission. Root assigned C the separate source/query/schema-test
repair. G does not add a queue column or modify that source. The actual missing
operating-state case blocks before the faulty query, so it remains validated;
Social positive source-to-commit execution is `NOT_RUN` on this candidate. Root
must combine the independently reviewed C repair and validate that path with a
real operating-state reader before claiming it operational.

Production/host activation, automatic Social authority, canonical intake positive
sink, official admitted domain carriers/readers, actual API Office writer grants,
immutable admission publication and release composition remain separate required
dependencies. Existing source-blocked intake is not silently enabled by this
Worker-only wiring. No runtime-ready switch bypasses those prerequisites.

Native PostgreSQL role/RLS/concurrency/recovery, production SQL, full engine
loops, hosted API routing, result publisher, browser, CI, merge, engine activation
and Gate B are `NOT_RUN`. No demo/preview is created or started. This increment
supplies reviewable real manual dispatch wiring and bounded local evidence only.
Root/B receive the immutable candidate and evidence for independent P0 review;
G then STOPs without merging, activating or changing governance status.
