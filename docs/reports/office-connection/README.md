# Office connection implementation and acceptance

This work continues the user's all-office connection request from actual main
`14595f81caec2ed5ce7cec564d7db9609b693718`. Existing source-only and simulated
implementations are usable engineering inputs, not operational acceptance. No
old Social stop instruction blocks implementation. The user's 2026-10-28
14:27:54 UTC instruction explicitly authorizes adopting the generated opening
wage, student/medical demand, housing and policing rules after population,
funding and capacity validation. That project adoption does not supply a
production signature/admission, production SQL/grants, World/Clock start or PR
approval.

## Executable workflow

Use the repository's Node 24.20.0 and pnpm 12.3.4. In the prepared cloud machine,
prefix commands with `bash /workspace/.cloud-setup/run.sh
econmind-os-world-simulation` if the shell has a different toolchain.

```sh
# Check immutable migration history. This never contacts a database.
node tools/office-connection/provenance.mjs --check
# Only when objects are missing: existing Git HTTPS origin, exact manifest SHAs.
node tools/office-connection/provenance.mjs --fetch

# Enumerate every required field/action and produce a compact readiness report.
pnpm connections:plan
node tools/office-connection/catalog.mjs --plan > /tmp/office-matrix.json

# Run an explicitly selected, newly executed mechanism case.
node tools/office-connection/acceptance.mjs plan
node tools/office-connection/acceptance.mjs run --case scoped-cache

# Separate the simulated Social flow from native and formal acceptance.
node tools/office-connection/social-workflow.mjs --plan
node tools/office-connection/social-workflow.mjs verify --fixture
node tools/office-connection/native-evidence.mjs --plan
node tools/office-connection/browser-evidence.mjs --plan

# Inspect production gaps without SQL, network, deployment or activation.
node tools/office-connection/release-preflight.mjs --plan
pnpm connections:check
```

`connections:check` deliberately exits 2: an offline inventory cannot establish
formal runtime readiness. A plan command exiting 0 means enumeration succeeded,
not that its connections passed. New reports must use new output paths; evidence
must match the candidate commit, source/configuration hashes and actual selected
target. A changed candidate invalidates earlier runtime evidence.

## Actual denominator

| Office                        | Modules | Inputs | Readouts | Catalog acceptance targets | Current formal checks |
| ----------------------------- | ------: | -----: | -------: | -------------------------: | --------------------- |
| Captain                       |       9 |     58 |        6 |                         73 | NOT_RUN               |
| Finance                       |      20 |    174 |       48 |                        242 | NOT_RUN               |
| Central Bank                  |      15 |    110 |       17 |                        142 | NOT_RUN               |
| Industry, including Resources |      23 |    210 |       33 |                        266 | NOT_RUN               |
| Trade                         |      28 |    384 |       21 |                        433 | NOT_RUN               |
| Social                        |      25 |    190 |       33 |                        248 | NOT_RUN               |

There are 1,404 shared catalog targets plus 148 shared page commands, not 1,552
verified connections. Five computed command expressions remain explicitly
unclassified. The official 70-country manifest yields 420 country/office pairs
and 98,280 country/catalog acceptance targets. Three local sample countries are
not the official country denominator. Resources is a domain, not a seventh
office.

Each generated row retains field/action -> quoted requirement -> source -> API
-> database -> scope/authorization -> idempotency/concurrency/audit -> authorized
readback -> persistence/repeat-execution status. Missing links remain null or
BLOCKED; the existing 34 selected-source datasets are recorded separately.

## Current implementation

Shipped browser clients now reject stalled/out-of-range source pages and invalid
fragments, distinguish zero records from the end of a page, classify HTTP
401/403 before parsing a success schema, enforce the complete request deadline,
and retire pending work on scope changes. Regression fixtures exercise the old
failure modes. Actual browser tests use real local HTTP with TEST_ONLY source
responses; this is not official backend evidence.

The Social workflow reuses its existing employment/college/clinic domain,
atomic repository, private PG16.15 host and HTTP/controller verifier. Fixture,
native HTTP, native persistence, browser and formal acceptance are distinct.
Its scenario and private due publisher do not enable formal automatic MATCH.

This cloud checkout initially lacked eleven immutable migration source commit
objects. Exact-origin Git fetch restored them; the unchanged 23-migration
manifest and source-byte validation then passed. The reusable provenance command
fixes missing checkout history without rewriting migration hashes or tests.

## Remaining critical path

Production office acceptance remains **0/6**. The independent Trade/Captain
recheck covers **7 source/test/SQL files**, with **6 tests PASS, 0 skipped**;
it is a scoped dirty-worktree result with retained raw hashes, not seven
production checks or whole-candidate approval. Evidence:
`/tmp/postwar-trade-captain-837b1f1f-recheck.{vitest,provenance}.json`.

| Office       | Concrete source/runtime gap                                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Captain      | Custody candidate has three TEST_ONLY boundary tests; actual political-capital/reason originals and Atomic source-guard threading remain missing                       |
| Finance      | Isolated TEST_ONLY native SET/LINE intake and consumers passed; authoritative production policy publication, deployed bindings and other families remain separate      |
| Central Bank | Authoritative ledger/account/holdings/quote binding for OMO; other central-bank families remain unconnected                                                            |
| Industry     | Source/custody candidate has 11 PGlite tests plus one native original/read/revocation test; twelve actual operating-input gaps still block authority                   |
| Trade        | Actual c427 tests retain typed MISSING when OP CASH/GCU is zero despite positive GRAIN; no synthetic money/rights, command, queue or FINAL is inferred                 |
| Social       | Isolated POSITION/PLAN/MATCH H3 evidence exists; current-prefix publication and UI/consumer integration still require separate verification, not production acceptance |

These include actual code integration gaps as well as source/infrastructure
requirements; historical gate text is context, not a permanent stop order.
Use CAPTAIN.md, INDUSTRY_TRADE.md, SOCIAL_REVIEW.md and RELEASE.md for exact
existing entry points and owner input contracts. Do not fill unavailable facts
with proposals, synthetic defaults or first-event snapshots.

Git read access works. GitHub REST CONNECT to `api.github.com:443` returns 403
before token authorization can be evaluated. Network access has been approved,
but environment draft revision 6 has not been applied; the observed CONNECT 403
remains unresolved. After access works, inspect existing publisher configuration by names/status before
requesting anything new. Secrets belong in the owning environment/GitHub settings,
never chat or browser variables. The companion repository remains the controlled
production schema publisher. A draft PR is reviewable work, not PR approval.

The cloud environment draft is separate from production hosting. Its publication
requires the product settings flow; no supported agent publication API exists.
Never report a development listener or a static Pages response as operational
World acceptance. Never access WeChat or the user's Mac.
