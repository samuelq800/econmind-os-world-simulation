# D official country boot guard and six-role smoke

## Status

IMPLEMENTED_UNVERIFIED; independent review PENDING. Treat the highest affected
boundary conservatively as P0 presentation provenance: selected-country loading
must not substitute sample economic values or advertise a local Running clock.
No authority, settlement, host, database or engine-clock change.

Branch `codex/d-official-country-boot-guard`, base
`bcfc66787631a13aa5093df42954070c2d7dd66b`. Root's subsequent `7f1c05c`
update was reported as documentation-only; this fixed base was retained.
Candidate SHA/tree are in the immutable handoff receipt outside this commit.
The earlier `811ebe74bcfae6940aed3f0745f2d4328ff8f6b3` candidate was not edited.

## Implemented scope

Actual official target: `https://world.econmind.group/season1-immersive/`, country
01, all six public role views. Root supplied Pages run 37736879174 SUCCESS;
D did not independently audit that provider run. D independently fetched both
affected published scripts and confirmed byte equality with fixed base:

- `journey.js`: SHA256 `e76476784e38f014e792d277bcce598105563893c0af2fda1b26b595c3355b25`.
- `world-clock.js`: SHA256 `eb61b7889868048a45c5d2f37581ebb6386ce2d5710280526cf2c96ff0bdf646`.

Browser repro: select Finance from Captain Country HOME. Before the asynchronous
selected-country source finishes, the existing catalogue bootstrap clears the
hash, then the journey initializer starts a sample journey. Actual Finance
screen displayed North Harbour sample treasury 120M LNY and a local Running
clock. Final source arrival restored Avenor Finance and `#country`. Industry,
Trade and Social direct country entries also visibly passed through a sample
journey during loading. This is a transient provenance leak, not a permanent
wrong-country route. The original provisional screenshot/record is retained;
`role-switch-final-state.json` clarifies the subsequent final state.

Four owned files only:

1. `apps/world-web/public/season1-immersive/journey.js`: scope guards before
   journey navigation, sample journey/office rendering and bootstrap timer.
2. `apps/world-web/public/season1-immersive/world-clock.js`: country scope exits
   before local clock mount or DOM update. The pre-existing country pulse guard
   and engine clock logic are untouched.
3. `tests/world-web/official-country-boot-guard.test.ts`: executes actual shipped
   functions/initializer/failure handler directly, without a new browser page,
   economic fixture, official source values or invented binding.
4. This report.

No sample code was deleted to hide the failure. Direct negative/positive tests
retain non-country navigation, sample rendering and sample clock mount. Country
HOME, source intake, allocation disabled boundary, map and role-specific forms
are not modified. No new outcome fields, balances, zeros or public DTO.

## Safety and compatibility

No Core/API/Worker, RLS, migrations, production SQL/data, seed/admission,
dispatcher, credentials, engine Clock or legacy site changes. No economic
command was sent. No local preview/demo service was started, repaired or
stopped. No mock official browser response, production DOM injection or forced
source failure was used.

The new isolated worktree uses a narrow sparse checkout to avoid copying the
large map assets. Tracked base/index remains intact; the final diff is only the
four owned files. Existing dependency packages are read-only links with an
independent local test cache; no install or lockfile update. Full website build
and full architecture/publication verification are not claimed from a sparse
checkout.

## Actual validation

Pinned Node 24.20.0 and TypeScript 6.0.3; macOS. Evidence:
`/Users/samuel/Documents/econclub/.econmind-artifacts/d-official-six-role-smoke-20261008/`.

| Check                                         | Actual result                                                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public HTTP, six same-country role entry URLs | PASS, HTTP 200 for all six, one bounded GET each                                                                                                             |
| Published two-script identity                 | PASS, HTTP 200; byte-equal to bcfc base; `live-source-identity.jsonl`                                                                                        |
| Actual six-role final render                  | EVIDENCED, all returned selected-country HOME; screenshots 01–06 and `six-role-checks.json`                                                                  |
| Missing runtime/projection                    | EVIDENCED, Captain/CB/Industry/Trade/Social dialog checks disabled; Finance transfer dialog disabled with TRUSTED_FINANCIAL_BINDING_MISSING                  |
| Finance runtime entry                         | EVIDENCED, visible NOT_CONNECTED; separate runtime/projection dialog sampling for Finance NOT_RUN                                                            |
| Desktop scene layout                          | EVIDENCED, default 1280x720 same-country role samples have no document horizontal overflow; Social 1024x768 scene background width 1024, document width 1024 |
| Scroll                                        | EVIDENCED, Captain reaches scrollY 210 / max 210; Social 1024 reaches document bottom; screenshots/geometry retained                                         |
| One CB selector wait                          | NOT_RUN: CDP wait timed out after 3 seconds; no repeated wait; subsequent ordinary AX observation evidenced final CB render                                  |
| Initial direct-test scaffolding               | FAIL, 16 failures including missing journeyChoices test stub; retained `boot-before.log`                                                                     |
| Corrected fixture against unchanged base      | FAIL, 15 expected provenance-guard failures; two non-country compatibility tests PASS; retained `boot-before-fixture-complete.log`                           |
| Fixed source regression                       | PASS, exit 0, 27 tests: 17 new + 10 existing country-module HOME guard; `boot-after.log`                                                                     |
| New regression types                          | PASS, exit 0, tsc --noEmit --target es2024 --module nodenext --moduleResolution nodenext --strict --types node --skipLibCheck                                |
| Regression lint/format                        | PASS, exit 0, ESLint + Prettier on new test/report                                                                                                           |
| Both production scripts syntax                | PASS, exit 0, node --check                                                                                                                                   |
| Production script formatting/lint             | Existing repository ignore policy preserved; not misreported as lint/format PASS                                                                             |
| Diff whitespace and owner scope               | PASS, only two source scripts + direct test + report                                                                                                         |
| Actual browser after deployed fix             | NOT_RUN, candidate not published; direct-test PASS is not browser-after/deployment evidence                                                                  |

Direct tests cover six-role catalogue-ready-before-source ordering; slow/late
bootstrap, rapid role navigation/retired callbacks, the actual rejected-source
error handler, direct legacy navigation/render guards, formal local clock DOM
blocking and non-country compatibility. They do not prove an authenticated
decision-to-result loop, live financial positions, server authorization or real
engine activation.

## Incomplete and deferred work

Formal page still lacks trusted host/read/financial bindings. All current HOME
data observed is opening-source/static reference, not current economic outcomes.
There are source-generated mixed-language facility labels, e.g. COPPER开采组;
no source dataset rewrite was undertaken. No claim that six roles are playable.

NOT_RUN: full 420 audit, all original forms, full map/website build, authenticated
Office, real command/FINAL cycle, private financial read, force-failed production
source, concurrent browser role switching, publication and post-release smoke.
No temporary consumer fields are created while E's outcome contract is pending.

## Next action

Root/B review this exact candidate independently, then publish through the
authorized formal release chain. After publication, rerun the bounded actual
country boot/role-switch browser check against verified script hashes. Until
then, do not state the live leak is fixed or the economic engine is enabled.
