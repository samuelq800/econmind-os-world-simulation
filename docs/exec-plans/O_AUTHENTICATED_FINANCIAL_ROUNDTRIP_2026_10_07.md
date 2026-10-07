# O authenticated financial roundtrip consumer test

Status: IMPLEMENTED_UNVERIFIED. Root composed-main acceptance and then B narrow
incremental review are PENDING. This is a TEST_ONLY integration mechanism, not
official opening, production admission/activation, Clock startup or Gate B.

## Authorized scope and composite identity

Root requested one real isolated PG/JWT -> A persisted seat/admission -> G
authenticated intake/three approvals/once-only enqueue -> C fenced
Reserve/Ship/Deliver -> actual ledger/FINAL -> same-World authorized projection
readback. G `df48568837a50961dc2f8bb78d9d64544e25a06e` is independently frozen
and remains in B's queue; this work cannot edit it or bypass its pending review.
Root owns composed-main acceptance before B reviews this new test increment.

New checkout:
`/Users/samuel/Documents/econclub/.econmind-worktrees/o-authenticated-financial-roundtrip`,
branch `codex/o-authenticated-financial-roundtrip`. Composite test base:

- Exact main/PR100 `ede509c29a3e462c54a4db42ec624a251c210a28`, tree
  `9ea9abfec0a95d83099b919bd1e987d7985ebdd8`, containing C fixed runtime/fixture.
- Unchanged G candidate cherry-picked onto main as
  `1bfdea7e00a094dd4a025da99667b48b7dbad061`, composite tree
  `ca7a9a3b291468b1ec9b33657d6a63092df83d18`.

This new commit adds only the O test, its TEST_ONLY fixture, focused typecheck
config and this record. No production G/API/Core/C runtime, migration,
Constitution, official source/proposal or shared status edit. No independent
approval, merge, deploy or grants to actual users.

## Genuine mechanism and source boundaries

The opt-in `O_NATIVE_AUTHENTICATED_ROUNDTRIP=1` creates a fresh empty native
PostgreSQL 16.15 cluster, private short temporary directory and ephemeral
127.0.0.1 port. Actual C target checks see `postgres`, loopback address and
`econmind_v09_o_authenticated_roundtrip`; no target guard is mocked or bypassed.
No ambient database URL or production credentials are read. The cluster is
stopped and its temporary directory removed in cleanup, including setup failure.
Migrations are the existing manifest through release_order 17 plus the A
unnumbered binding proposal, not a full migration rehearsal or publication.

Existing C fixture bootstraps the actual immutable TEST_ONLY documented source
and opening seed, and persists current authorizations for two actual fixture
subjects and three Office capabilities: seller Trade and buyer Trade/Finance.
Buyer is one actor/subject with two separate Office assignments and signatures.
The World namespace is `WORLD_C_ISOLATED_O_AUTHENTICATED`; these synthetic
eligible country IDs are accepted by the actual canonical parser. This is not
a 70-country official World or an actual Owner/admin/user grant.

The actual A seat store publishes persisted seats under a distinct restricted
fixture publisher role. Current entitlement and activity publishers derive
their initial read rows from real current authorization/empty posting source
under the actual writer fence. No golden projection payload, authoritative
economic event, ledger posting or receipt is prefilled. Positive fixture
admission temporarily disables only the existing publication veto in this
disposable database and restores it in finally. The production veto is unchanged;
no actual admission publisher is implemented or claimed.

Actual C/G verifier consumes generated EC256 signed JWTs through a local JWKS
transport fixture. Signature, issuer, audience and expiry checks are real;
there is no always-valid verifier. Separate read/intake/seat roles are
non-superuser and non-bypass. Test provisioning grants UPDATE-column privileges
needed by existing head/current-authorization locks; this is not approval of
production RLS/role provisioning.

G alone registers and enqueues the discretionary canonical Command via its
actual authenticated composition and fixed Worker ports. The test never calls
C fixture direct intake, approve or unused transfer. Both repeated registration
and repeated enqueue preserve the exact command/key/fingerprint and produce
one DISCRETIONARY_USER queue row. Before enqueue, missing approval is rejected;
before execution, no economic effect or FINAL exists. The actual persisted G
Command is parsed by the existing durable lineage reader and supplies subsequent
automatic Command identities/fingerprint.

C acquires an actual persisted fenced lease, verifies the connected server,
rebuilds the persisted opening and consumes its real Reserve/SQL Shipment/SQL
Delivery factories. Only automatic Ship/Deliver use C's existing explicit
TEST_ONLY VERSIONED_AUTOMATIC scheduling port. That is a fixture producer for
these two exact automatic Commands, not a bypass of G's discretionary queue,
second engine, production obligation producer or Clock loop. The explicitly
supplied test Clock changes only to 10000/10100/10200 ticks.

## Actual result and projection contract limitation

One full native test PASS: final head/version/sequence 3/3, three actual Commands,
queue rows, Events, inventory postings and receipts, one financial posting batch.
Reserve FINAL is version 1; Ship FINAL version 2; Delivery FINAL version 3.
Actual opening-aware C lineage gives buyer treasury 2 GCU, seller settlement
8 GCU and buyer available grain 2 tonnes. Authenticated FINAL lookup returns the
actual original Reserve receipt with its exact identity/fingerprint, not a fake
version-3 receipt substituted for that Command. G READ and exact registration
retry return that actual FINAL. C next consumption is IDLE and economic counts
remain unchanged.

Existing `AuthoritativeActivityReadProjectionPublisher.#readLedgerEconomics`
reads only `inventory_posting`/`financial_posting_batch`; it omits opening seed.
The authenticated existing wire payload therefore exposes buyer treasury **-6**
and seller settlement **+6** under `ledger.financialPositions[].netDebitBalance`.
These are exact committed posting changes, not the opening-aware balances 2/8.
The existing wire has no explicit opening-excluded status label. The test asserts
these real values, buyer available inventory +2 and seller available -2, with
actual persisted source-derived projection and same seed/World head watermark 3.
It does not insert golden balance rows, reinterpret -6 as a final balance or
write a second projection engine to hide this existing semantic limitation.

If product acceptance requires absolute balances through this public read
projection, it remains MISSING. Minimal implementation repair is a separately
reviewed publisher that consumes canonical opening-aware lineage at the held
fence/head watermark, or an explicit reviewed change-only DTO/label. That repair
belongs to the production publisher owner, outside this test-only scope. Root
has been notified. Mechanical read success is not absolute-balance acceptance.

The same test rejects a buyer JWT selecting seller Office, cross-country
projection and revoked seller FINAL/intake reads. All G/read activation flags
remain false. It runs no browser, actual provider JWKS/TLS deployment, production
Clock, production role/source/admission/seat-TTL publisher or 70/six-role acceptance.

## Verification and handoff

Pinned Node 24.20.0 / pnpm 12.3.4. Offline frozen-lockfile install reused 161
packages and downloaded zero. Core/Worker/API declaration builds passed.
Focused O test types/lint passed; final boundary, authoritative-pattern,
secret/environment and format/diff checks are recorded in the external packet.
Native command:

`O_NATIVE_AUTHENTICATED_ROUNDTRIP=1 pnpm exec vitest run tests/integration/o-authenticated-financial-roundtrip-postgres.test.ts`

Result: **1 PASS / 0 NOT_RUN**, exit 0, started 2026-10-07 22:09:36 Asia/Shanghai,
4.24s overall. Without opt-in the native test is NOT_RUN, never PASS.

Initial native runs reached all economic/read assertions but failed the added
G READ check because the O request erroneously supplied commandFingerprint.
The actual canonical parser requires READ/INSPECT identity-only fields and
rejects that extra field as PROTOCOL_ERROR. The fixture request was corrected;
no parser/test requirement or production guard was weakened. Shared public
transport type permits optional fields generically, so D must retain the actual
action-specific canonical shapes; no frozen Core repair is made here.

Freeze this four-file test-only increment and exact source hashes. Send Root
the candidate for composed-main acceptance, then B's incremental narrow review
as Root directs. STOP; no selfmerge, production mutation or dependent activation.

## Root composed-main acceptance — forward-only fixture revision

Root replayed unchanged G and O onto main `afff74f3b7dd3611aa3d8a8d62dc8e9f0eb33c11`
as `c32f94b` and `4471f3e`; the original four-file O diff hash remains
`8b19eaad9cec472db087db734d1d7ce8723b33395e20f106acebd9453236f724`.
Combined Core/Worker/API builds passed. The initial credential-empty invocation
failed PostgreSQL startup before any economic mechanism ran. A diagnostic-only
fixture change preserved the bounded startup log before cleanup; the second
invocation exposed `postmaster became multithreaded during startup`, with the
actual PostgreSQL hint to set a valid `LC_ALL`. Both setup failures remain FAIL,
not economic test passes. Original producer evidence remains separate.

An explicitly valid C locale then allowed one complete native roundtrip to pass.
The final forward-only helper pins a minimal, credential-empty PostgreSQL child
environment with `LC_ALL=C`/`LANG=C` for init/start/stop and keeps bounded failure
logs. The final source, without a locale in its parent environment, passed one
complete native test at 22:20:49 Asia/Shanghai, duration 4.77s. Focused strict
types and helper lint passed. No assertion, source/admission guard, economics,
World or original G code was weakened. Disposable clusters were stopped and
removed by the owned fixture.

This acceptance does not close B's separate G-INTAKE-01 uncertain-rollback
finding, approve account visibility in the existing projection, or admit an
official World. G source remains held pending its independent repair review.
Root's helper revision and test evidence need their own bounded review before
publication with the fixed G dependency. Disk exhaustion subsequently prevented
the first attempt to save this record; the source remained unchanged until
only Root's unused generated web build was removed, not user source/evidence.
