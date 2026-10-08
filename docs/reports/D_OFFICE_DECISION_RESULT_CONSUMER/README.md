# Classified committed-result drawer consumer

Status: `IMPLEMENTED_UNVERIFIED` for the narrow remediation below. F reviewed
original candidate `15d5b8e3d510eedb696128c6a1dc87fa3dc91346` as
`CHANGES_REQUIRED` (F-D-01). That verdict/evidence is preserved; this replacement
has not independently closed it. Independent review, composed CI and publication pending.

Base: `5e8a405004b1617233d1274f0d40339336d7826c`.
Base tree: `34c97b7ec3c3e14081a0cd3aaaa978ee895b9a5b`.
Branch: `codex/d-office-decision-result-consumer`.
Worktree: `/Users/samuel/Documents/econclub/.econmind-worktrees/d-office-decision-result-consumer`.

## Actual missing path and bounded change

The sole Worker replace publisher carries `decisionResult` for private Office
rows and `decisionResults` for COUNTRY rows. The strict API adapter validates
these optional exact fields. In the fixed base, `production-read/client.ts`
already accepts the opaque projection payload; no client top-level contract
needed expansion. `office-projection/model.ts` did not consume either field,
and `view.ts` displayed only activity, net Posting movement and current ledger
positions. No result consumer existed in that path.

`country-runtime/entry.ts:304` installs `EconMindOfficeProjection` on the
formal page. Its explicit trusted-host `connect(binding)` creates the existing
controller/read client. Successful reads run through `consumeOfficeProjection`
and the existing drawer renderer. No production host call to that `connect`
exists in the fixed base: a public official-source endpoint is a different
source reader, not an Office seat, admission or private-result grant.

The completed source path is:

`trusted host binding -> existing read client -> existing controller -> strict result consumer -> existing drawer`

This package fills the last result consumption/rendering gap, not the missing
production host. It does not synthesize that host, infer config from URL/storage,
add a command port or promise that real results already appear online.

## Owned files and behavior

- `apps/world-web/src/office-projection/decision-result.ts`: exact result shape,
  immutable display copy, identity/head/cause/metric checks and explicit absence.
- `apps/world-web/src/office-projection/decision-result-view.ts`: additive result
  section using existing DOM/drawer/font surface. Semantic table headers,
  canonical string values, partial/withheld states, expandable cause/source.
- `apps/world-web/src/office-projection/model.ts`: consume only the correctly
  classified optional result field; reject the other classification's field.
  CB disclosure uses existing validated economic availability, not a raw marker.
- `apps/world-web/src/office-projection/view.ts`: append the section inside the
  existing drawer; clarify that remaining gaps concern current Office state.
- New focused consumer/DOM tests, test tsconfig, TEST_ONLY fixture and this report.

No Core DTO, Worker/API, controller/client authority behavior, production host,
public JS, immutable archive/UI baseline, map, CSS/layout, preview, database,
gate/status or source opening changed. Other checkouts were read-only.

Captain and authorized CB show supplied before/change/after, units and original
command/event fingerprints. Source publication head and historical cause
version are distinct. The result is explicitly **not current balances**.
COUNTRY can expose only the exact withheld summary; it has no result values,
cause or instrument IDs. CB denial and malformed visibility never disclose.
Social plan commitment is matching **pending**, not completion; settled match
is still **partial**, with null before/delta and `afterState=null`. Missing
predecessor values render “Not supplied”, never zero. Industry stays source
unavailable. Finance/Trade null and old DTOs without result fields degrade to
unavailable, not event-count-derived outcomes.

Browser code imports only Core types. Wire schema/event/bucket literals and
decimal bounds are checked against existing Core export types at compilation;
no runtime Core barrel, event parser, settlement or economic kernel is loaded.
Bounded canonical coefficients are compared using BigInt solely to validate
the supplied delta; displayed values remain server strings. No result/position
is calculated or substituted. This also removes the first draft's Node-module
externalization warning and unnecessary runtime bundle weight.

## TEST_ONLY source provenance and evidence boundary

The new fixture mechanically reuses E's canonical Captain/CB/Social constructors
and held SQL double from `tests/world-core/office-decision-result-projector.test.ts`
at the fixed base (reviewed b64a140 integration). It calls the actual sole
`AuthoritativeActivityReadProjectionPublisher.replace`, then the actual strict
`readEntitledWorldProjection` adapter. The held executor asserts verified
subject, exact query scope and active/not-revoked predicates. Only a local
array is modified; no PostgreSQL connection, real token, admission or host exists.

Unmodified publisher -> strict API -> HTTP-envelope double -> real browser
read client -> consumer/DOM covers Captain commitment, Social plan, all-country
withholding, CB denial, Industry unavailable and unsupported Finance/Trade.
Additional authorized CB and Social system-due cases use the actual reviewed
pure projector -> actual strict API -> consumer, with explicit TEST_ONLY
disclosure/head. Those are not claimed as the unmodified publisher/native or
production path. Both paths preserve actual derived metrics, nulls and causes.
Negative DTO mutations are bounded consumer tests, not generated game state.

DOM checks use a minimal test double, **not** a real browser, screenshot or
layout acceptance. They exercise the shipped renderer's table/caption/header
semantics, canonical text, null handling, expandable causality and withheld
absence. No new test/preview page or service was created, started or closed.

## Actual commands and outcomes, 2026-10-08

Pinned Node **24.20.0**, pnpm **12.3.4**. Offline frozen-lockfile dependencies:
161 reused, zero downloaded, no lockfile change. Core and Worker compiled only
in this worktree to provide normal test/build prerequisites; their source was
not modified.

- `pnpm exec vitest run tests/world-web/office-decision-result-consumer.test.ts tests/world-web/office-projection.test.ts tests/world-web/office-projection-denied.test.ts tests/world-web/current-financial-position.test.ts tests/world-web/production-read-client.test.ts tests/world-core/office-decision-result-projector.test.ts`:
  exit **0**, **215/215**, six files. New consumer tests **44**; existing browser
  regressions **115**; unchanged E projector/publisher/strict-adapter tests **56**.
- `pnpm exec tsc -p tests/world-web/office-decision-result-consumer.tsconfig.json`:
  exit **0**, strict focused types with existing browser Bundler/JSX settings.
- `pnpm --filter @econmind/world-web build`: exit **0** including tsc, Vite,
  140-map publication, official-source config and static-budget checks.
  Build config says `officialSourceRead=NOT_CONFIGURED`, `liveWorldState=false`.
  Final country runtime entry about **63 kB** (gzip about **19 kB**).
- Focused ESLint and Prettier checks: pass.
- `node scripts/check-boundaries.mjs`: exit **0**, 300 files.
- `node scripts/check-authoritative-patterns.mjs`: exit **0**, no violations.
- `git diff --check`: pass.
- `git diff --exit-code 5e8a405 -- packages/core apps/world-api apps/world-worker apps/world-web/public artifacts/ui-authority database status`:
  exit **0**, all excluded authoritative/public source bytes preserved.
- **`pnpm test:authoritative-ui`: exit 1, NOT PASS.** Country source check passes,
  then the fixed base's known `UI_FILE_HASH_MISMATCH:.../journey.js` remains.
  The base does not contain the separately frozen provenance candidate
  `73b7d952f788c621d14e34af35ce0cb96f711acb`, which is already awaiting C review.
  This package neither hides the failure nor edits/cherry-picks that candidate.
  Root must compose the independently approved provenance fix and run the real
  mandatory check before publication.

Development chronology retained: first consumer run **35 PASS / 4 FAIL** because
new assertions incorrectly used one-element `toMatchObject` arrays against
complete 7/2/4-metric results. Correct complete-length plus metric assertions
then passed; no existing test changed. First focused tsc failed under NodeNext
rather than existing browser settings, plus readonly fixture metadata/null
diagnostics; use of existing Bundler settings, `Object.assign` on a test copy
and explicit null guard resolved them. First boundary scan failed because a
local assertion helper was named `require`, and Worker dist was not yet built;
renaming it to `assertResult` and local prerequisite compilation resolved that
without weakening boundary rules. First Vite build passed with a Core-barrel
Node externalization warning; final type-only contract imports remove it.
Existing map-size and runtime stylesheet-resolution warnings remain visible.

## Handoff / remaining work

This candidate is source-only and independently reviewable. Root owns CI
registration, review composition and normal release. The existing frozen
provenance candidate remains untouched. Full CI and a composed
`test:authoritative-ui` PASS are not claimed here.

Production trusted host/session/seat/admission binding, real engine execution,
native PostgreSQL, deployed result readback, actual browser visual smoke and
Gate B: **NOT_RUN / not supplied by this package**. Enqueue is not COMMITTED;
derived display is not approval; commands remain disabled. After approved
host binding and publication, verify one genuine authorized result and a
revocation clear in the official browser. Until then the correct default remains
missing/unavailable, with no sample-result fallback.

## F-D-01 closed-drawer remediation delta

Remediation parent: `15d5b8e3d510eedb696128c6a1dc87fa3dc91346`, tree
`56878a69fbb2ba0b6e96eafba1a156bae24bc11e`. Same owned branch/worktree.
The independent 215 PASS does not cancel F's separate **3 FAIL**.

Read-only original F report and helper were read and SHA-256 verified against
Root's frozen handoff. They remain unchanged:

- Report SHA: `4e898e2435c8cd22951421b3417e456d13d07bbf6a3fccabc5407c5f90f75d39`.
- Helper SHA: `fa261d6b7f150ce46eb631b93ff998dcb578426846cfa83564ee133cf0ddf328`.
- Both are under `/Users/samuel/.codex/state/plugins/codex-security/scans/d-office-decision-result-consumer/artifacts-8d66da755f2372f0545c0bbeba93231080f47f658ae4c7614900087a2e551017/artifacts/F_D_RESULT_REVIEW_2026_10_08/`.

Only production change: existing `office-projection/view.ts`. A closed drawer
now removes all child nodes before returning from a render notification. This
removes metrics, cause/fingerprints, source/authorization metadata, financial
readouts and FINAL history from the materialized sink. The Close button also
clears immediately; a native close-event listener covers Escape/host close and
does not clear a surface already reopened before a queued event arrives.
No CSS-only hiding, alternate state, DTO/backend/controller/client or authority
change. Normal Close retains a still-valid model/receipt and seat lifetime;
reopen renders only after the original current/liveness check. Revocation,
disconnect, navigation and failed/late reads keep the original state semantics.

New owned `office-projection-closed-drawer.test.ts` ports F's installed-view
integration mechanism to a strict-typed DOM double. The first three losses
also isolate the render guard by closing without delivering a close event, so
they cannot pass merely because the Close button discarded old nodes. Separate
controls exercise actual Close/native-close callbacks and reopening. The
existing focused tsconfig includes this regression. This report is the only
other changed file; the original 215 tests and all result parsing stay unchanged.

Actual delta evidence, Node 24.20.0 / pnpm 12.3.4, 2026-10-08:

- Before the view fix, `pnpm exec vitest run tests/world-web/office-projection-closed-drawer.test.ts -t 'closed drawer clears result'`:
  exit **1**, **3 FAIL** (revoke, disconnect, same-element role change). Each had
  `model=null` but **18** old dialog children. Six other registered cases were
  intentionally unselected/NOT_RUN, not acceptance evidence.
- After the fix, the new installed-drawer test file: exit **0**, **10/10 PASS**.
  The three original loss scenarios pass. Additional controls cover normal
  Close/focus/model preservation/reopen without duplicate read/fresh readback,
  native close, queued-close-after-reopen, country change, pagehide, closed FINAL
  and financial history revocation, and closed pending read/late retirement.
- Focused strict tsc, ESLint, Prettier and `git diff --check`: PASS.
- Delta outside view/new regression/tsconfig/report: zero. Core/API/Worker,
  DTO, parser/model/controller/client, public scripts/UI/map, preview, database,
  authority and status/gate remain untouched.
- Original **215** tests were **not rerun**, as directed; their independent F
  PASS and separate FAIL packet remain valid historical evidence, not a new
  full-suite claim. Full build/composed publication/real browser/native DB/
  real host/engine/Gate B were not repeated or activated by this delta.

Implementation is ready only for F's immutable **delta** re-review. Do not mark
F-D-01 independently closed or publish until Root obtains that review and
performs the separately required composed publication checks.
