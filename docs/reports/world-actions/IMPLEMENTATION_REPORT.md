# Implementation report: reviewed HOLD GitHub Actions

## Status

IMPLEMENTED_UNVERIFIED, P0. The affected boundary is hosting publication
authorization. Independent pipeline review is pending; existing HOLD source
approval does not cover this workflow. No owner approval or gate change is claimed.

Base main at preparation: c74744b21d17bb47e960ff73fe24561884f4f408. A standalone
PR will identify the immutable implementation candidate and actual CI checkout.

## Implemented scope

The workflow automatically validates relevant PRs and supports manual preparation,
defaulting publication off. It verifies the caller repository and the immutable
reviewed HOLD source/tree, builds with pinned tools, runs real workerd, compares
both bundles with the original approved SHA256 and uploads only deployment JS
and public evidence JSON. Downloaded bundles are checked again before publication.

Only an explicit manual main request with the exact confirmation can access
world-cloudflare-hold credentials. The helper checks the existing two Workers'
bindings, URLs and cron before and after executor/API publication; public
health/readiness must demonstrate HOLD. It records attempted and acknowledged
targets, stopping on unknown outcomes without retry/rollback.

## Safety and compatibility

No authoritative implementation, command/event/receipt contract, state, browser
boundary, arithmetic, settlement, idempotency or Clock is changed. No production
Supabase connection or mutation occurred. No migration, reset, seed, SQL, grant,
Hyperdrive creation, paid resource or runtime-secret transfer is introduced.
econmind-os retains the unique production database publication chain and Secrets.

Repository lockfile/dependencies and legacy app are unchanged. Operator tooling
is isolated outside checkouts. Same fixed Workers/account as the prior approved
HOLD release; this workflow does not deploy arbitrary branch code.

## Actual validation

Windows local: Node24.20.0, pnpm12.3.4. Frozen install exit0; syntax/targeted
ESLint exit0; final twenty guard tests passed. actionlint1.7.7
(-shellcheck= -pyflakes=) exit0: actual Actions schema/expression validation;
optional shellcheck/pyflakes were not run. Secret scan exit0,2347 files.

Read-only Cloudflare GET settings/subdomain/schedules on both existing Workers
returned200 and matched HOLD topology, including the schedules:{schedules:[]}
contract. Initial raw OAuth reads returned401; Wrangler's ordinary whoami
refreshed its existing local login, then all six read-only calls succeeded.
No OAuth token was exported to Actions or printed.

First run37940394704 preparation FAIL: workerd used the caller checkout as
cwd while its scripts were under the separate reviewed-hold checkout. It rejected
the resulting parent-directory traversal. Fixed by launching the original
unmodified check from its source root; bundle/source checks remain unchanged.
Final source0c7da3d1e2103849bc7278645eb1ddffd811c488 and actual CI checkout
9d23029913ab263eaaa372334d80be775a29bc97 have identical tree
07424a408dbf55ff9027d4b7425798849b3edf39. Preparation run37940843096 passed:
twenty guards, eleven real workerd checks and exact approved bundle hashes.
Downloaded artifact11621018187 matched upload ZIP SHA256
e1b39b2be3a794b0720c097e874c3de17014121b865b7489004c6072e39916fe.
Its five-file layout matches the publish download path and contains no private
key or TEST_ONLY runtime fixture. Both exact downloaded JS files also passed
Wrangler4.148.0 --no-bundle --dry-run with the unchanged reviewed configs;
output hashes remained equal. No cloud publication was performed.

Caller check in run37940843096 FAIL:3078 PASS/14 FAIL/154 SKIP. Eleven failures
required historical Git objects omitted by the default shallow checkout. Three
bootstrap-lifecycle cases also failed on Ubuntu (process cleanup/exit and forced
cleanup outcome); no Linux lifecycle PASS is claimed. The workflow now fetches
full history and aligns the official check with the existing macos-15 full-check
job in cloudflare-runtime-environment.yml (also macOS in v09-postgres.yml).
No test, timeout or assertion was weakened. Linux lifecycle failures remain an
explicit evidence gap outside this macOS/full-check plus Linux/workerd scope;
this delivery must not claim a new Linux Node execution-host acceptance.

The repaired immutable candidate needs its own actual unmodified full caller
receipt. See TEST_EVIDENCE.json and PR129 for the final results.

CI Cloudflare publication: NOT_RUN (user confirmed no deployment Token).
Formal Supabase/economic activation: NOT_RUN, still blocked independently of
the hosting Token. Environment protection configuration is not implied merely
by the workflow's environment field; actual settings require readback. The attempted
GitHub PUT environment returned403; no environment or variable was created.
Existing environment inventory contained only github-pages. Repository admin
must configure world-cloudflare-hold/main restriction/account variable/Token.

## Incomplete and deferred work

Independent P0 pipeline review, merge/main workflow registration, operator CI
Token configuration and actual cloud publication remain separate conditions.
Required reviewers were not invented. Formal production schema/role/source/
seed/admission/host dependencies and Gate B are not completed by these Actions.

## Next action

Finish actual CI evidence and independent review; merge only the approved
candidate. Configure the scoped environment Token, then use the manual HOLD
publication path when needed. Continue formal database/economic release through
the repository-controlled approved chain; do not treat HOLD success as activation.
