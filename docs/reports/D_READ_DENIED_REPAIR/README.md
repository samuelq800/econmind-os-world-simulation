# D-READ-01 authority-retirement repair

2026-10-07 Asia/Shanghai. IMPLEMENTED_UNVERIFIED; independent narrow closure
required. This does not approve the original candidate, Gate B or deployment.

Exact parent: `84fcbf2ed6f7d7d4509ac11033f900811a62967d`.
Branch: `codex/d-read-denied-repair`.
Checkout: `/Users/samuel/Documents/econclub/.econmind-worktrees/d-read-denied-repair`.
The original branch/SHA and evidence remain unchanged. The unfinished financial
browser increment is preserved separately in `d-browser-financial-intake`;
none of its files or G dependencies is included in this repair.

## Finding and smallest runtime change

The existing real ProductionReadClient retires its read authority on HTTP
401/403 and returns DENIED. The original new controller only cleared its model:
it retained a previous verified FINAL and still advertised read/lookup controls.
This was an authorization-retirement failure, not an ordinary network failure.

Only `apps/world-web/src/office-projection/controller.ts` changes runtime behavior.
Its existing terminal-disconnect routine is factored into `retire(reason)`.
DENIED now retires the controller's host-bound lifetime, increments the epoch,
clears model and FINAL, disconnects the real port, unsubscribes the host session,
disables read/lookup and preserves visible DENIED. Every late completion sees
the retired lifetime and cannot restore data. There is no automatic reconnect.
The host can only create a separate binding through an explicit later connect.
The production-read client and view are unchanged; no denial is hidden in UI.

UNAVAILABLE and ordinary STALE refresh remain nonterminal: a verified FINAL can
remain visible, with no current model, while read/lookup remain retryable under
the still-current host session. Existing liveness retirement still clears all.

No Core/API/Worker/public asset/map/opening source, economic logic, production
data, migration, existing client, governance state or server config changed.

## Failure first, then repair

The fixture exports its existing client-local fetcher for tests only. All seven
new tests instantiate the real `createProductionReadClient`, not a substitute
port. The transport is explicitly OFFLINE TEST_ONLY; no real endpoint, signed
token, seat or admission was used.

Before changing runtime code, the dedicated test command exited **1**:
**6 FAIL / 1 PASS**. Actual assertions showed old FINAL retained and read/lookup
still true after denial. Failure evidence is preserved, not overwritten.

After repair, the same denial assertions pass, plus the existing selected
read/runtime/architecture regressions: **5 files / 154 PASS**, exit **0**.

New cases:

- HTTP 401 and 403 after verified FINAL + projection: all data cleared, terminal
  DENIED and subsequent read/lookup clicks do not dispatch.
- A real-client denial during a pending FINAL: late HTTP success cannot restore.
- A real-client denial during a pending refresh: late projection cannot restore
  either old FINAL or model.
- Real-client HTTP 500 refresh: verified FINAL stays, current model clears and
  read/lookup remain available. Existing ordinary STALE test also remains PASS.

## Local checks and evidence

Pinned Node 24.20.0 / TypeScript 6.0.3. Offline third-party dependency links are
read-only; workspace package exports and `.vite`/`.vite-temp` caches belong to
this repair checkout. No install, full dependency copy or borrowed cache link.

Actual commands (using the pinned Node binary):

```sh
node node_modules/vitest/vitest.mjs run tests/world-web/office-projection-denied.test.ts
node node_modules/vitest/vitest.mjs run tests/world-web/office-projection-denied.test.ts tests/world-web/office-projection.test.ts tests/world-web/production-read-client.test.ts tests/world-web/trusted-country-runtime.test.ts tests/architecture/boundaries.test.ts
node node_modules/typescript/bin/tsc -p apps/world-web/tsconfig.json --pretty false
node node_modules/typescript/bin/tsc -p tests/world-web/office-projection-denied.tsconfig.json --pretty false
node node_modules/eslint/bin/eslint.js apps/world-web/src/office-projection/controller.ts tests/world-web/office-projection-denied.test.ts tests/world-web/office-projection-denied-test-only.ts tests/world-web/office-projection-fixture.ts
node scripts/check-boundaries.mjs
node scripts/check-authoritative-patterns.mjs
node scripts/check-repository-secrets.mjs
ECONMIND_ENV=local node scripts/assert-safe-environment.mjs
node scripts/verify-authoritative-ui-publication.mjs
cd apps/world-web && node ../../node_modules/vite/bin/vite.js build --logLevel warn
```

Web/test typechecks, scoped TS lint/format, canonical boundary256, publication
288/derived75/70countries/140maps and Vite build PASS. Existing runtime-resolved
CSS and large-chunk warnings remain. This is a bundle build, not another full
map-publication/deployment or six-role gameplay audit. Core/worker prerequisite
builds only generated ignored local package exports; no backend code changed.

The initial added test-typecheck config inherited NodeNext and omitted browser
JSX/CSS declarations, failing on existing browser imports. It was corrected to
the web application's ESNext/Bundler/react-jsx and vite/client settings;
strictness was not reduced and no existing import changed.

Evidence directory:
`/Users/samuel/Documents/econclub/.econmind-artifacts/d-read-denied-repair-20261007/`.

- `before-fix.log`: real failing baseline; `after-fix.log`: repaired regression.
- `browser-checks.json`: real client + client-local TEST_ONLY HTTP 401/403 both
  visibly DENIED, no FINAL/command fingerprint/model, read+lookup disabled.
- `01-before-denial-test-only.png` and `02-after-http-{401,403}-test-only.png`.
- The dedicated TEST_ONLY browser harness is not a production build entry.

The temporary 4183 TEST_ONLY server is stopped after verification. Original
4178 local DEMO and fixed84fcbf 4182 unbound visual preview are left unchanged;
this repair has not replaced their frozen source/output.

NOT_RUN: live authorization endpoint, production denial, production commands,
database runtime, full workspace checks, independent acceptance, merge/release.
Root/B must bind their closure decision to the immutable repair tip separately.
