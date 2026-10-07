# G nonactivated full read provider

Status: IMPLEMENTED_UNVERIFIED, independent P0 review pending. No activation or
production operation. Root owns integration and the sole publication chain.

## Authority and scope

Owner decisions `/Users/samuel/Downloads/EconMind_World_V2_Owner_Decisions_Codex_Prompt_20261007.md`
SHA256 `57bfdec38a9a400991cb26362a99d33d7a81c8e6258c03460185e51501fb5ac5`
were explicitly adopted by the human. Additional D02 implementation instruction
SHA256 `5d07a94e087f545dc3c1948a321ccd74c16aecb4483f5266de59085186c7d29b`
prioritizes actual API/provider/session/World/authorized projection wiring. Root
retains the decision originals and crosswalk; historical proposal/audit remains
unchanged. D05 production host/activation is excluded. Labour/social source was
inspected but no module was written before Root reprioritized this window.

Clean base `278c9c98527bcda4f3942f3b6b47e8e926a14ca0`, tree
`3ea3118c63594ace2bb134995b0b264695c88774`; normal fast-forward of independently
approved A storage `5daba03570a3ebc50ddcb291131b7b885f6c8e3d`, tree
`da1700f753c8a0658d9fa55e646fcc4be8dfa45f`. Root confirms equivalent main
PR94 merge `e34f8d9521edeafbf983d6ebb3dc73efed6a6622`. No reset/copy of A
implementation. Branch `codex/g-non-host-labour-seat-adoption` retained for identity.

## Actual consumers

- The original PostgreSQL facts reader remains compatible. Its transaction
  runner now allows server-only consumers to reuse the same subject-bound,
  repeatable-read/read-only snapshot and cancellation handling.
- `createPostgresServerReadBindingProvider` implements existing
  `ServerReadBindingPort`. It consumes A's real `RuntimeReadBindingStore`
  read methods, validates real current assignment/entitlement/revision, exact
  opening seed/model/fingerprint/admission and actual head. It neither assigns
  seats nor publishes admission. Missing or ambiguous facts deny.
- `readbackRef` is the actually queried immutable `admissionRef`, as explicitly
  confirmed by Root. It anchors the SQL readback; it is not an independent
  readback certificate, deployment receipt or Clock evidence. No generated
  READBACK/seat/admission identity.
- `createPostgresRuntimeReadExecutor` allows only the two existing authenticated
  projection/final handler query constants, with verified subject and the same
  managed read pool/role. It reuses the same A hydration inside its payload
  transaction: unadmitted Worlds return no rows even when this executor is used
  directly. It does not provide a raw SQL endpoint or economic writes.
- `createNonactivatedRuntimeReadHost` composes the existing real Supabase JWKS
  verifier, HTTPS composition and bounded route. It does not listen, deploy,
  obtain credentials, create a pool, write a seed or start a Worker/Clock.
- D06 preparation selects the first two actually eligible canonical countries,
  six separately approved Offices each, exact real-time 24h TTL and revocation.
  It reuses existing Core current ADMIN authorization. Output is explicitly
  PREPARED_NOT_GRANTED and contains no Core Office authority or seatRef. Missing
  verified admin/approval/source denies. The NPC/SYSTEM function is an additional
  restriction only, never authorization: PREOPEN/PAUSED and all NPC operations
  denied; SYSTEM restricted to existing rule-version/causation-bound obligations.

## Verification scope

Pinned Node 24.20.0 / pnpm 12.3.4. Native PostgreSQL is a freshly created disposable
cluster with a private short Unix socket and TCP disabled. No DSN, production
credentials, provider request or production database. Synthetic source fixture
is explicitly TEST_ONLY with DOCUMENTED_ASSUMPTION provenance to exercise the
existing production parser, never forged official source/adoption. Positive admission mechanism tests disable only the existing
publication veto in that disposable database; a separate negative test runs the
unaltered proposal and proves publication still denied. No test bypass exists
in application code or the actual A proposal.

Native suite requires explicit `WORLD_V2_G_NATIVE_PROVIDER_TEST=1`; without it
native verification is NOT_RUN, not PASS. This avoids a Homebrew/native runtime
requirement for unrelated CI. Current native test entrypoints are local macOS
`/opt/homebrew/bin/initdb` and `pg_ctl`.

Actual final commands/exit codes/results and immutable candidate identities
are recorded in the external review evidence package. Earlier initial native
startup failed because macOS temporary path exceeded Unix socket bounds;
corrected to a private short /tmp path. Initial API declaration build revealed
cross-app source-import rootDir and private inferred HandlerInput problems;
fixed with existing server-only Worker package-export pattern and an explicit
named return type. Required checks must pass on final contents before freeze.

## Exact remaining gaps

- Real independently trusted admission publisher remains missing; A proposal
  still vetoes INSERT. No official source/World/admission is made by this change.
- No actual owner/admin identity, separate current test Office approvals or
  genuine TTL seat publisher was supplied. D06 output is preparation only.
  Current membership/store supports one coherent country/team per subject:
  a two-country actual grant needs an approved existing authorization consumer,
  not bypass of that coherence rule. No production test admin is created.
- Multiple current Offices make a COUNTRY selector ambiguous under the existing
  binding contract; it denies. OFFICE_PRIVATE selects exact scope. No first-row
  fallback; any explicit Office selection contract is Root-owned future work.
- Current persistent schema has no authoritative Clock/lifecycle carrier to
  bind here. All activation flags remain false. This is not Clock/lease runtime
  verification or production session/provider configuration evidence.
- C's real seed -> reserve/ship/delivery -> postings/events/receipt -> projection
  joint isolated test is a separate integration increment. These provider tests
  read actual persisted synthetic projections; they do not claim a financial
  command executed, balances changed through Worker, or all70/six-role acceptance.
- Production host/project/TLS/deployment/session, production adoption, activation,
  independent review, merge and Gate B are not established by these local checks.

No Core, source mapping, economic ledger, shared status/manifest, C verifier,
E HTTP route, A storage implementation, migration publication or old site changed.
Root explicitly approved the single server-only Worker package export for
build-compatible consumption of A's existing module. Final API declaration
build, API typecheck and focused test typecheck passed. Latest consumer run
passed 87 tests in 4 files, including 13 real native PG provider/host tests and
5 D06 preparation/restriction tests. The earlier broader affected run passed
210 tests in 7 files; after the final payload-transaction hydration change,
only its affected four files were repeated. Final lint/format/boundary/
authoritative-pattern/secret/environment checks passed. These are local
implementation evidence, not independent P0 verification.
