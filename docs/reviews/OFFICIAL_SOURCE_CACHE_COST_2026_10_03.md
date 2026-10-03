# Official source cache: offline cost correction

Status: IMPLEMENTED_UNVERIFIED, pending independent review and release authority.
Production retry, deployment, logs, credentials, database and simulation: NOT_RUN.
HTTP 546 root cause: UNKNOWN. This change does not claim production closure.

## Scope and provenance

A owns the snapshot source/store cost correction. G's independently reviewed
CORS change is already in base main `a09e357aedcd24c882947ebd8a076ce68c454bf0`
and is preserved unchanged. No route DTO, CORS, registry, source bytes, parser
number rules, schema, migration or authoritative runtime state is changed here.

The original production FAIL evidence is immutable:

- Report SHA-256: `681c866179e6727822d60fa5a0ba50fb8dbf521ef41743933f37488de86aad77`.
- Readback SHA-256: `745e6485ebfde6cd83ca2d20abeffde54d9aed0dfc3ba1d817d1d6699d1e0ed9`.
- Failed route: `/v1/world-data/datasets/geography?section=physical&offset=50&limit=50`.
- Original all34 audit remains FAIL/partial, not retroactively PASS.

## Concrete offline finding

Before this patch every structured page fetched the full source, constructed
150 KB SQL-compatibility chunks using a character-by-character split, hashed
those chunks, rejoined/rehashed them, and losslessly parsed the full JSON.
The same reader's warm geography requests repeated the entire process.

Dataset route inspection found ordinary section selection and bounded page
serialization, not an additional whole-tree traversal per page beyond source
reconstruction/parsing. Climate paging still trims oversized pages using the
existing serialization algorithm. That algorithm and the 256,000-byte response
limit are deliberately unchanged. Observed response bytes all remain below it.

The snapshot-only direct byte loader now avoids that synthetic chunk round-trip.
A per-reader LRU retains only hash/size/UTF-8 verified, losslessly parsed, deeply
frozen trees. Every new load is verified before admission; coalesced same-key
loads share a promise; failed promises are removed, not cached. Keys bind bundle,
selection hash, slug, source/storage paths, source hash, byte count and kind.
Generic SQL readers and the native-number country compatibility bridge retain
their existing paths. No browser/global cross-reader cache or second World truth
is introduced. The historical candidate remains non-live and non-activated.

Per-reader caps: 4 entries, 12,000,000 original-source bytes represented by retained
entries, 32,000,000 accounted parsed-value bytes, 2 distinct in-flight dataset
loads, and the existing 9,000,000-byte per-source limit. LRU eviction drops cache
references. A valid tree exceeding retention budgets is returned but not cached;
at-capacity distinct loads fail closed. Raw buffers/chunks are not retained.
The parsed-value accounting charges UTF-16 keys/strings, containers and slots;
it is a retention budget, NOT a guaranteed process RSS ceiling. Cold transient
buffers, engine overhead, response allocations and caller-held trees are separate.

## One serial cold/warm fixture suite, before and after

Actual geography fixture: 8,441,668 bytes,
SHA-256 `c1a3d521ae91b37845f764be4ede73d522bc6958be90f4676ad5a19395b26a35`.
Node v24.20.0, local macOS, injected fixture fetch only. Each suite used one
reader and four serial requests; there was no production network. These are
single-run observations, not an isolated benchmark, Deno resource guarantee or
proof of the HTTP 546 cause. Focused checks were also running on the host during
the after measurement; no repeated profiling or large concurrent fixture load
was used to choose favorable timings.

| Geography request                   | Before elapsed / CPU ms | After elapsed / CPU ms | Source reads before → after | DTO bytes |
| ----------------------------------- | ----------------------- | ---------------------- | --------------------------- | --------- |
| physical offset 0, limit 50 (cold)  | 418.596 / 423.810       | 102.019 / 127.955      | 1 → 1                       | 19,267    |
| physical offset 50, limit 50 (warm) | 327.439 / 329.472       | 0.814 / 0.980          | 1 → 0                       | 5,172     |
| climates offset 0, limit 50 (warm)  | 357.959 / 353.942       | 13.043 / 12.724        | 1 → 0                       | 251,120   |
| climates offset 3, limit 50 (warm)  | 364.114 / 364.628       | 4.193 / 3.865          | 1 → 0                       | 249,339   |
| Total                               | 1,468.109 / 1,471.852   | 120.070 / 145.524      | 4 → 1                       | unchanged |

Fetched bytes: 33,766,672 → 8,441,668. Compatibility query calls: 4 → 0.
Observed maximum process RSS: 400,960 → 141,600 KiB; not a deployment bound.
All four response bodies matched both byte count AND SHA-256 before/after:

- physical 0: `00ea94f9d6003f2771d71a29377f6b564155bb4056fad92e261a528168fef5c1`.
- physical 50: `5faefc2b03e066af1fc13b5be72b1d051666f53ae83f557adc024c5b58f34f2c`.
- climates 0: `0b844e36b1364459535a885b0ca38e0e7ce93ca1998a8989f72686ae1b242e09`.
- climates 3: `ce8f59ee9f8dd34b55d5125369154aee70b02a70c01180243d0e6da2c7631075`.

Durable local artifacts under
`/Users/samuel/Documents/econclub/artifacts/a-source-cost-profile.EWglHA/`:

- `before.json`: `5c3c81198892e55dce397dafd69c0fb8a0c32c1729ac4853eba1a354fa2ae6e3`.
- `after.json`: `1589ea8398a3e615b858b8056e24eb79649b71efb2b2ed685de8088e414d291c`.
- Executed `profile.mjs`: `326cb2b9c01544a9c4daac2ee97a2d37c33ae8cdf3a4a5344574eaebe625b667`.

`after.json` binds the four edited TS/JS source hashes; the profile did not bind
an uncommitted tree to its base SHA alone. A subsequent type-only `CacheLimits`
annotation permits lower numeric test limits instead of literal default values.
Both emitted JS hashes remain exactly those measured in `after.json`:
`649108b4110a58c203ba4985711da3cca95c3219dad528e01af1525d4c52e6dd`
and `5911b1e41ef134625f815383ae26dd871513ff406c2909c690b700436af596da`.
No runtime code changed after measurement; no extra profile suite was run.

## Focused verification

Pinned Node v24.20.0, existing dependencies and lockfile; no new dependency.
Local compiler/generator, 22-file generated bundle check, API typecheck,
scoped ESLint, Prettier and diff checks passed (exit 0). The three focused files
`official-source-snapshot.test.ts`, `official-all-datasets.test.ts` and
`official-edge-read.test.ts` passed: 37 tests, exit 0. Focused tests cover:

- all34 fixed source fixtures and existing DTO/precision/page regressions;
- exact decimals, negative zero, exponent lexemes, dates, nature and units;
- nested mutation rejection and serial warm reuse;
- normal small-fixture coalescing and distinct-load capacity;
- failed fetch/hash/size/UTF-8/parse/kind cleanup followed by a fresh request;
- reader/identity separation, LRU touch/eviction and retention non-admission;
- generic SQL readers still reading every time;
- preserved origin policy, fixed-query restrictions and no live-state claim.

Existing official Edge CI executes the snapshot tests, generated bundle check,
Deno check, core/worker builds and API typecheck. Actual CI outcome is reported
with the PR handoff, not assumed from configuration. No full repository/840-test
suite or production audit was run for this correction.

## Proposed bounded readback continuation — NOT IMPLEMENTED OR AUTHORIZED

The existing audit CLI has no resume mode. Do not silently bypass its release
guards or execute an unreviewed resume script. A narrowly reviewed future mode
would bind the original FAIL report/readback hashes, selected source hashes,
original checker identity and newly reviewed/deployed A+G function tree.

After independent review, Root release authorization and E's single combined
function update, request explicit authority for one GET of the formerly failed
route first. Stop on failure; do not infer a platform root cause from status alone.
If that passes, seek authorization for a bounded continuation tool:

1. Reconstruct the entire unfinished geography logical group, not merely resume
   at physical offset 50: a complete tree comparison needs all its sections and
   cursors. Do not rerun the 12 already complete dataset groups or metadata catalog.
2. Read the later 21 NOT_RUN dataset groups, then the NOT_RUN dedicated country
   list/detail and country-association groups, using existing request/byte/time
   limits and fail-closed stopping rules.
3. Keep prior-version verified groups and new-version results explicitly separate.
   Label the combined report MIXED_VERSION_COVERAGE; it cannot claim an all34
   same-function-SHA PASS or rewrite the original FAIL evidence.

This proposal does not start a retry, implement resume, deploy the function,
activate an opening seed, start a worker, authorize a command or advance Gate B.
