# Office connection release preflight

Status: **BLOCKED / implementation verification scoped below**. This report
adds an offline release inventory; it grants no approval and performs no cloud
release, credential provisioning, permission expansion, World start or Clock
start. Source baseline: `14595f81caec2ed5ce7cec564d7db9609b693718`.

The user has authorized all-office data connections and cloud release work.
Engineering can continue within that scope. Existing HOLD/PLANNED records and
old stop instructions are historical context to reconcile, not a permanent
veto or a reason to ask the user to repeat the same authorization. The objective
is still incomplete because actual implementation, authoritative bindings,
infrastructure readback and final-candidate review are incomplete.

## Machine-readable classification and ownership

| Category                        | Meaning and next owner                                                                                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CODE_IMPLEMENTATION_GAP`       | Agent implements formal source/actor/Clock constructors, API/executor composition, Finance budget source/atomic guard/sole consumer/browser family and companion migration caller; no generic “await user approval” substitution |
| `AUTHORITATIVE_DATA`            | Required Finance/CB source facts and admitted lineage have no established formal runtime binding; this is not a claim that all source files or adopted data are absent                                                           |
| `INFRASTRUCTURE`                | Actual role/binding/schema/seat readback is unverified and GitHub REST CONNECT is denied; platform owner action is restricted to what engineering cannot access                                                                  |
| `HISTORICAL_GOVERNANCE_CONTEXT` | Old V09.1/HOLD record is emitted under `context`, with `blocksImplementation=false`; reconcile progress from actual new evidence                                                                                                 |
| `FINAL_CANDIDATE_REVIEW`        | Independent P0 review attaches to the actual completed immutable candidate and tests; this report does not self-approve a PR or treat the old HOLD review as a new runtime review                                                |

Each actionable blocker has `category`, `resolutionOwner`, `nextAction` and
evidence status. `authorization.implementationMayContinue=true` records the
current task scope. `productionReady=false` reports current capability/evidence,
not absence of user intent. This offline inventory cannot certify a future
release; its classifications must be reconciled when implementation changes.

## Reproduce

```bash
bash /workspace/.cloud-setup/run.sh econmind-os-world-simulation node tools/office-connection/release-preflight.mjs --plan
bash /workspace/.cloud-setup/run.sh econmind-os-world-simulation node tools/office-connection/release-preflight.mjs --check
bash /workspace/.cloud-setup/run.sh econmind-os-world-simulation pnpm exec vitest run tests/world-api/office-release-preflight.test.ts
```

`plan` (also the default) exits 0 when the inventory was produced; its JSON
`status=BLOCKED` and `productionReady=false` are authoritative for this tool.
`check` exits 2 while blocked. `--plan` and `--check` are equivalent aliases.
All mutation modes and additional arguments are
rejected. The tool reads local source/governance and reuses the existing
`HOLD_RELEASE`, `PRODUCTION_POSTING_RELEASE` and policy fingerprint function.
It never renders executable SQL, invokes a shell, opens a connection, writes a
file or calls a provider. It cannot become a deployment tool by supplying env
variables. Unknown/missing source remains blocked. Source pattern observations
are an inventory aid, not a replacement for tests or independent review.

## Actual Finance and Central Bank paths

| Surface / path                | Existing implementation                                                                                                                                                                           | Unfinished connection                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public country/source display | `country-context.js` uses approved official dataset read configuration and static selected package; `liveWorldState=false`                                                                        | Opening financial source values are not live treasury or bank balances; local immersive allocations and approvals remain local examples                                                                 |
| Authorized Finance / CB read  | `office-projection/controller.ts` → `production-read/client.ts` → HTTPS authenticated read composition → `postgres-runtime-read-executor.ts` / `postgres-full-read-provider.ts`                   | Actual auth provider, current persisted seat, admitted seed/World, least privilege DB binding and deployed endpoint readback must all exist                                                             |
| Read authorization / database | Subject-bound read-only snapshot checks `current_commit_authorization`, `projection_entitlement`, `read_projection`, `opening_seed`, `world_head`, current persisted seat and immutable admission | Missing admission fails closed; UI identity or seed JSON is not an authorization grant                                                                                                                  |
| Financial positions           | Server-filtered owner mapping in `economic-read-visibility-source.ts`; opening plus posting positions validated by `office-projection/model.ts`                                                   | Only nonzero ledger positions, not available/spendable cash; Finance still lacks available treasury, budget commitments and debt maturity; CB lacks policy rate, eligible collateral and bank liquidity |
| Finance trade approval        | `/v1/financial-intake`: `INSPECT`, `SIGN_BUYER_FINANCE`, `BIND_REFERENCE`; real JWT and current read binding precede canonical service / Worker SQL                                               | Not a general Finance action API. Current Finance authorization, exact signature/fingerprint and expiry are rechecked by buyer-finance approval reader                                                  |
| Finance budget                | Backend registers `CORE_FINANCE_BUDGET_APPROPRIATION_V1` intent schema; inert planning/source carriers exist                                                                                      | Browser Office families exclude Finance; `manual-office-intake-runtime.ts` explicitly returns false for budget; no admitted budget source/guard/sole consumer is installed                              |
| CB command                    | Browser `/v1/office-command` supports `CORE_CENTRAL_BANK_OMO_V1`; Core parser and candidate require coherent holdings/quote lineage and current authorization                                     | OMO is not a policy-rate, collateral-loan or FX-intervention API. Formal host and admitted OMO source still block production execution                                                                  |
| Command readback              | Durable queue acknowledgement → exact command/fingerprint FINAL lookup → refresh authorized projection; controller matches decision-result cause                                                  | Queue registration is not economic success; missing FINAL or uncertain cleanup stays unavailable/unknown                                                                                                |

The definitive current formal host source has `ServerCommandHostBinding=never`,
`openIntakeRequest()` always returns null, and diagnostics list missing formal
source, Clock and actor constructors. Cloudflare API source returns HOLD with
`databaseConnected=false`, `authoritativeCommandsEnabled=false`, simulation and
Clock false. `status/progress.json` still records V09.1 PLANNED and
`next_step_ready=false`. That historical progress record does not itself block
continued authorized engineering. The closed formal host and hardcoded HOLD
are concrete code gaps to resolve through real composition, rather than by
replacing the guard with a success flag.

## Controlled publication and recovery

1. World frontend uses `.github/workflows/deploy-world-web.yml` (GitHub Pages).
   It builds shared contracts, the non-authoritative frontend and public-base
   checks; `WORLD_OFFICIAL_READ_BASE_URL` is a public source endpoint, not an
   economic runtime endpoint. A push to main can publish this frontend, so this
   work does not push or merge.
2. World runtime uses `.github/workflows/world-runtime-actions.yml`, main-only
   `world-cloudflare-hold` environment and manual `PUBLISH_REVIEWED_HOLD`.
   The runner fixes source `e7ecf45184baad69a37e2e51fff8862a635267dc`, tree and
   both bundle hashes; checks existing HOLD topology; publishes executor then
   API; verifies HOLD readback. This authorizes hosting only. New economic
   artifacts require their own review and immutable release binding. No generic
   active release path has been accepted.
3. Shared production Supabase schema, roles and admission changes belong solely
   to companion `econmind-os`. Its fixed schema/API-reader/full-reader release
   workflows pin source commits, preflight exact ledger state, use one atomic
   request, verify evidence and stop on uncertainty. The generic
   `deploy-supabase.yml` is not a substitute for World-specific release policy.
   Migration 0023 has a source policy, but `callerRegistration=NOT_REGISTERED`,
   `callerReadiness=CALLER_NOT_READY`, `production_approval=null`; its rollback
   strategy is `forward-fix`. The runtime-read-binding SQL proposal is not an
   authorized migration or admission publisher.
4. Companion `release-world-v2-edge-reader.yml` explicitly holds production
   with `WORLD_V2_EDGE_PRODUCTION_RELEASE_ALLOWED=false` before contact. Its
   later steps would create credentials and activate a LOGIN role. Do not run
   it to solve source connectivity. Separate snapshot publication also requires
   an approved immutable lock; neither path grants economic runtime authority.
5. Unknown publication means stop, retain UNKNOWN evidence and perform the
   applicable read-only diagnostic. Companion
   `recover-world-v2-schema-release.yml` classifies an uncertain fixed schema
   release; it is not a rollback for every later migration. No automatic retry,
   remote cleanup or destructive rollback is authorized. Preserve committed
   event, ledger and seed history; use an independently reviewed forward fix.
   Frontend recovery can republish a reviewed prior immutable source through
   Pages. Runtime rollback requires a reviewed fixed artifact and topology;
   the current HOLD publisher is not a generic active-world recovery system.

P0 changes still require independent review of the final immutable candidate.
Implement the actual schema/least-privilege, immutable admission/current seat,
formal host and recovery changes first, with required evidence, then attach the
review to those bytes. The user has already requested connections and release;
do not turn the old HOLD decision into a blanket permission stop. This
implementation cannot award independent approval or claim a prior HOLD review
covers a new runtime.

## Minimal owner actions and precise source handoff

`userActions` contains three bounded actions; ordinary code implementation
remains the agent's work, not a user setup request:

1. The environment network owner permits HTTPS CONNECT to `api.github.com:443`
   for the finite repository metadata GET paths below. The proxy denies CONNECT
   before token authorization, so there is no evidence to request a replacement
   token or expanded GitHub permissions.
2. Once transport works, verify existing configuration **names/status** in the
   owning store before requesting any missing configuration. World Actions uses
   `CLOUDFLARE_API_TOKEN` (existing controlled Workers publisher),
   `CLOUDFLARE_ACCOUNT_ID` (fixed account) and `WORLD_OFFICIAL_READ_BASE_URL`
   (public Pages dataset reader). Companion Actions uses
   `SUPABASE_ACCESS_TOKEN` (sole schema/readback publisher) and
   `SUPABASE_PROJECT_REF` (fixed shared-production target).
   `SUPABASE_DB_PASSWORD` belongs only to a separately selected companion
   generic backend workflow when that workflow requires it; it is not needed
   for this plan. Keep values in their existing secret stores, not chat. For
   runtime, identify existing reader/intake/source/executor least privilege
   role and connection-reference names; concrete formal binding names still
   need code registration, so inventing env names would not connect anything.
3. Where repository evidence cannot resolve an authoritative source, the
   economic data owner identifies its record location and adopted revision.
   The agent implements producers/readers; the requested facts are precise:

| Source contract                                    | Required formal binding facts                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finance budget (`finance-budget-appropriation.ts`) | World/country/entity/envelope/effectivePeriod, currency and exact amount; envelope cap/revision, line/revision/predecessor and genuine paid/reserved/commitment history disposition; producer/source revision, approvalRule revision, approvalSet and proposal/version; current `FINANCE_BUDGET` grant and same World/version/eventSequence/simTime. Existing fixture zero history cannot be assumed for imported records.                                 |
| CB OMO (`central-bank-open-market-operation.ts`)   | Same World/country/version/eventSequence/simTime and domesticTreasuryRef; complete bank and CB ledger snapshots/account mappings including explicit zeros; security/batch/issuer/holder/currency/maturity and face/encumbered/carrying holdings; quoteRef/securityRef/batchRef/issuerRef/currency/pricePerFace/validAtSimTime/sourceRef/worldVersion; canonical opening plus append-only posting lineage and current `CENTRAL_BANK_MONETARY_POLICY` grant. |
| Authorized reads                                   | Persisted current seat/authSubject/country/office/authorizationRevision; immutable ADMITTED World/seedRef/contentHash/modelVersion and current authorized projection head.                                                                                                                                                                                                                                                                                 |

These are missing established **runtime bindings**, not an assertion that the
corresponding source/adoption files do not exist. Source inventory and contract
validation should resolve as many facts as possible before asking the owner.

## Configuration and access evidence

`config/office-connection/release.env.example` lists names only. Current local
environment has `GH_TOKEN`; no Supabase or Cloudflare configuration names were
present. Neither repo has a real root `.env` file (only `.env.example`).
Provider-side configuration is **not freshly verified**. The 2026-10-16 runbook
historically records `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, HOLD
environment and an empty Hyperdrive list; that is dated evidence, not a new
provider claim. Dedicated reader/intake/source/executor connection references,
role mapping, TLS and disabled query cache remain unverified. Do not introduce
`postgres`, `service_role` or a frontend secret as a fallback.

Fresh bounded network diagnosis on 2026-10-28:

- Both repositories' `gh secret list` and `gh variable list` returned Forbidden.
- Unauthenticated curl to `https://api.github.com/` and the World repository
  REST URL failed during proxy CONNECT: HTTP 403, server envoy, curl exit56.
- Through the same configured proxy, `https://github.com/...git/info/refs?service=git-upload-pack`
  returned HTTP200 with Git advertisement content type. Parent audit separately
  confirmed both repos' `git ls-remote`.

This establishes a proxy/network restriction for `api.github.com:443`, before
GitHub token authorization can be evaluated. It does **not** establish that the
existing token lacks GitHub scope. Do not request a replacement token or bypass
the proxy. The narrowly required access is HTTPS CONNECT to `api.github.com:443`
for GET on these two repositories' Actions runs, secret-name metadata and
variable-name metadata, plus World Pages and `world-cloudflare-hold` environment
metadata. Variable responses can contain values; select names only and never
print raw responses. Additional GitHub permission needs can only be diagnosed
after transport succeeds. No POST workflow-dispatch, PUT secret, permission
change or network-policy edit was performed or requested by this tool.

## Disposable PostgreSQL verification options

Existing CI has a loopback PostgreSQL16 service in `v09-postgres.yml`, a PG17
release-handoff service, and native/workerd integration fixtures in
`cloudflare-runtime-environment.yml`. They use dedicated test fingerprints and
explicit opt-ins; database tests are not production verification.
`test:v09:disposable-evidence` also requires the exact disposable confirmation,
fresh marked local database and bounded output path. The owned PG16 fixture
requires non-root Ubuntu24.04 and pinned PG16.15; native workerd fixtures are
macOS-specific. This Linux environment has Docker CLI but no `psql`, `initdb`
or PostgreSQL binaries; Docker daemon reachability was not tested. No database
was created and no integration run is claimed. A Linux disposable harness or
existing approved CI job is the bounded next verification option, without
production credentials or user Mac access.

## Bounded implementation choices

- Connect approved official/source fields and show precise units and provenance
  while retaining explicit missing/unavailable fields; do not relabel proposals
  as current state.
- After reviewed server contracts exist, implement Finance budget sources and
  sole-consumer protocol, then wire the browser family; for CB, implement each
  missing action family and projected field against admitted source lineage.
- Complete disposable authorization/revocation, exact FINAL/readback,
  idempotency, rollback/UNKNOWN and fencing evidence before production handoff.
  Formal source/actor/Clock constructors and accepted admission remain separate
  runtime work, followed by independent review and controlled release.

Focused verification (2026-10-28, pinned Node24.20.0/pnpm12.3.4 wrapper):

| Check                                            | Actual result                   |
| ------------------------------------------------ | ------------------------------- |
| Scoped Vitest `office-release-preflight.test.ts` | PASS, 6 tests, exit0            |
| Scoped ESLint for tool and test                  | PASS, exit0                     |
| Scoped Prettier for tool, test and report        | PASS, exit0                     |
| Offline plan                                     | BLOCKED JSON produced, exit0    |
| Readiness check                                  | BLOCKED JSON, intentional exit2 |

The first formatting command included the `.env.example` reference, for which
Prettier has no parser; exit2 was corrected by checking supported files only.
The env reference contains comments and empty names, no executable values.
Full suite, production SQL, current provider configuration and true-user
JWT/seat roundtrip are NOT_RUN.
