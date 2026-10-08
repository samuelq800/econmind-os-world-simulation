# G manual Office HTTPS route adapter

## Status and fixed authority

`IMPLEMENTED_UNVERIFIED`, P0. Blocking independent review `PENDING`.
No self-approval, merge, host registration, production activation or Gate B claim.
Root authorized this exact adapter slice at reviewed fixed integration candidate
`7502eca1cb5222e1215250468bfef4738ab82e65` / PR121, tree
`adbf4d2c29f06cbd91c4e3c4b57d85cdcdb95dc5`.

Dedicated checkout:
`/Users/samuel/Documents/econclub/.econmind-worktrees/g-manual-office-https-route`.
Branch: `codex/g-manual-office-https-route`. Immutable final commit/tree are in
the external packet receipt, generated after committing this report and source.
This report cannot embed its own containing commit hash. The candidate preserves
the base's reviewed positive intake and C source fixes without editing them.

The fixed-base inspection found the actual Office service and existing read /
financial route adapters, but no Office route adapter, mount or path constant.
The plan was therefore to add only one explicit transport adapter and its pure
path, construct the real Office service, exercise real local sockets through the
actual JWT/SQL/source/intake chain, then freeze for independent review and STOP.
`AGENTS.md`, `PLANS.md`, current progress and centralized review policy remain
controlling. Current gate/status/progress and the official publication chain were
not changed by this authorized source-only slice.

## Owned implementation

Six files only:

- `apps/world-api/src/integration/https-authenticated-office-command-route.ts`:
  new explicit server transport adapter.
- `packages/core/src/commands/authenticated-office-command-contract.ts`:
  precisely one pure line, `AUTHENTICATED_OFFICE_COMMAND_PATH = '/v1/office-command'`.
  The remaining original contract is byte-for-byte unchanged.
- `tests/support/g-office-route-test-only-fixture.ts`: separate TEST_ONLY
  real-chain builder derived from the fixed positive suite. No original helper,
  positive suite or service was edited. Its full construction function and all
  dependencies are present, with compiled Worker identity preserved.
- `tests/world-api/https-authenticated-office-command-route.test.ts`:
  dedicated real socket/service tests.
- `tests/world-api/tsconfig.https-office-command-route.json`: strict direct types.
- This report.

No API/Worker/web default startup, route registration, financial route, E read
adapter/DTO/index, economic kernel, SQL migration/manifest, grants/RLS/schema,
workflow, dependency/lockfile, global test configuration, legacy site, Root or
other checkout was modified.

## Transport and actual authority

`createHttpsAuthenticatedOfficeCommandRoute` accepts the unique exact Core path,
an immutable snapshot of canonical nonlocal HTTPS allowed origins, and a real
Office service configuration or null. It constructs
`createAuthenticatedOfficeCommandService` itself. There is no injected positive
handle, readiness callback, browser source/identity/clock or bare READY port.
Actual TLS/server/router provisioning remains the caller's responsibility;
this module does not listen, mount a default route or activate an engine.

Exact URL equality means health/read/financial/legacy paths, query strings,
encoded aliases, suffix slashes and absolute request targets fall through.
Only POST and narrowly scoped OPTIONS are handled. Origin, Authorization,
Content-Type and preflight headers require one actual raw header occurrence.
CORS reflects only the pinned origin, never credentials or a wildcard. Cookies,
compression and unsupported MIME/charset are rejected. Bearer size is capped at
8192 characters. JSON uses fatal UTF-8 decoding and a 16KiB actual byte cap,
including chunked and declared lengths. Responses are private/no-store JSON with
nosniff and a 1MiB fallback cap. A settlement guard prevents repeated replies.

The body deadline is 5 seconds. The whole deadline is 10 seconds from valid POST
headers, including body time. Request abort and response close abort the actual
service signal. Every branch that installs body/service listeners clears its own
listeners and timers. A service CANCELLED before possible intake maps the route
deadline to 408/504. The existing service's conservative
`WRITE_OUTCOME_UNKNOWN`, retryable=false, survives a possible write, commit ack
loss or cancellation after intake begins. There is no automatic replay or
economic success conversion. A disconnected client receives no late response.

The adapter retains the existing real JWT verifier, persisted current
seat/admission/seed/head/capability checks, Core parser, server clock/actor,
module-private actual runtime/sole-consumer binding, source preflight, cutoff
locking and atomic existing command_submission + command_queue transaction.
Null configuration returns NOT_CONNECTED; a genuine service without the bound
runtime keeps SOURCE_RUNTIME_UNAVAILABLE and zero effects. Success is only a
durable QUEUED/EXECUTING/FINALIZED acknowledgement. FINALIZED is historical queue
state and never returns a receipt, COMMITTED or a new economic outcome.

## TEST_ONLY evidence boundary

The new fixture derives the complete actual builder from base7502's positive
suite. Actual ES256 signatures are verified against its pinned disposable JWKS;
current persisted SQL/RLS binding and original migrations through17 are used.
The trusted fixture source reads actual private SQL domain data and actual lease,
constructs the real private runtime with the same clock/pool/World and genuine
consumer, and preserves API/compiled Worker constructor identity. No mock
positive callback or injected official source is accepted.

The fixture seed/admission and Captain quantities remain explicitly TEST_ONLY.
Disposable admission veto disable/re-enable, restricted roles, UPDATE columns
for existing lock conventions and subject-bound entitlement lock policy are
inherited test evidence only. They are not production admission, official
genesis, grants or least-privilege provisioning. Its PGlite port shares one
disposable SQL connection and temporarily restores actual roles. It is not two
native concurrent PostgreSQL sessions or a production database.

Transport tests open actual HTTP sockets on 127.0.0.1 ephemeral ports. Allowed
Origin is an HTTPS `.invalid` test origin. This establishes real local socket
adapter behavior, not TLS, DNS, reverse proxy or deployed HTTPS evidence.
One test explicitly starts the already-existing prepared consumer and calls it
once after socket intake to verify the underlying real consumer-to-Atomic-FINAL
chain, then stops it. The adapter itself never starts that consumer or a loop.
COMMIT ack loss is injected after actual local SQL COMMIT; it is not a native
network commit fault. Deadline and disconnect cases gate actual server actor
resolution or actual intake pool connection while retaining real JWT/SQL/service
construction; late release causes no new SQL effect or response.

## Actual validation and preserved failures

Pinned Node24.20.0 / native pnpm12.3.4, frozen offline installation exit0.
Toolchain PATH prefix: `/private/tmp/econmind-control-tower-toolchain.451x0O`.
No production DSN configured, no credentials read, no native/remote DB reached.

Final bounded command:
`pnpm exec vitest run tests/world-api/https-authenticated-office-command-route.test.ts tests/world-api/positive-manual-office-command.test.ts tests/world-api/authenticated-office-command.test.ts`.
Actual result: **85 PASS / 3 files / 0 FAIL / 0 SKIP**, exit0, start21:16:05 local,
61.61s. This includes39 new route/socket cases, all16 fixed positive and all30
fixed default service regressions. No existing tests were changed or skipped.

The new cases verify actual once registration and server clock retry; explicit
sole-consumer processing and historical FINALIZED-only ack; real default refusal;
expired signed token, current SQL revocation and browser extra-field rejection;
actual COMMIT ack loss/explicit retry/no reinsertion; exact path fallthrough;
constructor/path/origin rejection; absent/duplicate/unsupported headers and CORS;
POST/OPTIONS; malformed/empty/non-UTF8 JSON; exact-limit and declared/chunked byte
caps; real 5s body timeout, 10s pre-intake/possible-intake deadlines and client
disconnect; route listener cleanup, single settled response and late zero effects.

Individual exit0 checks are recorded with raw outputs in the packet:

- Core, Worker and API builds in that dependency order.
- Core, Worker, API, new route direct and original positive/default direct strict
  typechecks.
- Scoped ESLint and Prettier over all touched source/test/config files.
- Repository boundary and authoritative-pattern checks.
- Safe local environment (`databaseConfigured:false`, mutation disallowed) and
  repository secret check.
- Diff whitespace and final ownership/provenance checks.

Initial socket run was **37 PASS / 2 FAIL**, 39 total, exit1, 30.73s. Both failures
were cleanup assertions that incorrectly required every IncomingMessage end
listener to disappear after an incomplete request. A focused recheck still failed
after a pre-route native-listener snapshot. Diagnostic recheck also failed and
identified Node24 `_http_server.clearIncoming`, installed dynamically after
response finish. The fix captures actual listener identities synchronously
installed by the adapter and proves those identities are absent after settlement,
while preserving Node's native cleanup. No route timer, deadline, negative or
unknown-result expectation was weakened; adapter code was unchanged by this test
attribution fix. The full final matrix then passed. Failed diagnostics and their
actual observations are retained separately from the final PASS evidence.

## Evidence gaps and next action

`NOT_RUN`: native PostgreSQL role/RLS/concurrency/recovery; actual TLS/HTTPS host,
DNS/proxy/client integration; native network commit/rollback fault; official
source/genesis/admission or least-privilege grants; production SQL/schema/keys;
default route/clock/consumer/host registration; CB/Social positive socket-to-FINAL
execution; full engine/economic loops; external provider CI, merge, deployment,
production activation, official result publication and Gate B.

This is a reviewable manual Office route adapter, not formal production route
registration. Existing production environment/source guards remain intact. No
missing prerequisite is relabelled as ready, zero or PASS. Follow centralized
P0 policy: freeze candidate SHA/tree/report/patch/source/log receipt, hand it to
Root for independent review, and STOP. Independent reviewer alone can issue the
review decision; this implementation remains IMPLEMENTED_UNVERIFIED.
