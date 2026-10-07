# F production/consumption posting schema proposal

PREPARATION_ONLY_NOT_V09_2_STARTED

## Authority and scope

P0 additive migration candidate. IMPLEMENTED_UNVERIFIED pending independent
fixed-candidate review. No production approval, publication, runtime admission,
status/progress change or completion of a World work package is claimed.

Control Tower scoped delegation reserves 0023 on
`codex/f-production-posting-schema`. Original preparation checkout was
`d4e3a8cfba318372d534cf2b281d291edb93333b`. After the explicit fixed-main
correction and disk-space recovery permission, it was normally fast-forwarded to
the actual reviewed production writer integration:

- Exact implementation baseline: `ea492a2d76daf2eab600a58c866d7f600a53112f`.
- Baseline tree: `44a9286859d322c8dbe99ffc3e70c9d95b3acb60`.
- Reviewed Core source origin: `8603d61a21890c3ada6a4e3e370964fe2c8bcd80`.
- SQL artifact SHA-256: `0e1ec372429164acb94f9b9588beac75fbf984f5a41413af13715e28a4e94a36`.

Ownership is only the new 0023 SQL artifact, new isolated schema tests and their
support/configuration, this record, and a separately committed manifest entry.
Existing 0007/0009 artifact bytes, Core, Worker, API, reader, Root atomic CAS,
map/public assets, other owners' files and the original main website are untouched.

The human explicitly requires Captain, Finance, Central Bank, Industry, Trade
and Social, not Finance alone. This candidate covers the Industry persistence
proposal only. It does not substitute for construction, integration or acceptance
of any of the other five roles. Cross-role completion remains a separately
evidenced Control Tower responsibility.

## Implementation

The existing `world_v2.inventory_posting` remains the sole inventory posting
table. The original four-movement validator is renamed with its body preserved
byte-for-byte; the same canonical payload trigger dispatches movement payloads to
that validator and production payloads to the new validator. No shadow ledger,
new economic table, grant, policy, login, shared-schema write or backfill exists.

The fifth operation requires exact row/payload version/SimTime binding,
canonical decimal strings and dimensional recipe coefficients, OP ownership,
explicit maintenance/licence/permission/cost source references, consistent source
facts/snapshot/time, unique complete material mappings and accounts, actual V13
bottleneck output and exact input before/use/after conservation. Its settlement
Event must contain the same production evidence/result and the actual Core
payload hash preimage. A final receipt cannot precede production insertion.

Five partial unique indexes prevent duplicate run, outcome, facility/tick,
output batch and funding/cost-leg recognition on the same table. A deferred
constraint trigger binds the complete COMMITTED production final receipt and
the actual committed OP expense plus one exact cash/deposit credit. Existing
update/delete guards are retained; inventory TRUNCATE is also append-only guarded.

These guards are not a second V13 engine or runtime authorization authority.
Full Core revalidation/replay, current authorization, stock snapshot and
nonnegative financial balance checks remain mandatory at the actual Worker
boundary. SQL does not claim to rebuild the complete authoritative economic
state, consume E09/E03/logistics ledgers or admit production runtime.

## Tests and evidence

Tests directly call the actual approved Core constructors to create the opening
seed, financial posting, commands, transitions, production result and inventory
posting. Fixture inputs are TEST_ONLY and reused from the reviewed production
tests, not official resource values. There is no golden JSON or independent
production calculation oracle. An earlier newly generated golden file was
removed from this candidate before validation in response to the fixed-main
correction.

One serial in-memory disposable PGlite is used. The existing World-only prefix
0001–0021 is explicitly applied, followed by 0023. The storage-only 0022
companion is intentionally not executed in a fake storage schema. This is not a
complete manifest-chain rehearsal or production/storage evidence.

Fresh empty World-schema installation is rehearsed and DDL rolled back on that
same instance; then an old schema containing all four valid movement rows is
upgraded. Old validator body/rows and conservation rejection are checked.

Focused matrix: 22 PASS, 0 skipped, exit 0 (4.79 seconds on 2026-10-07):

- Empty-schema installation and five-index presence; populated old-schema upgrade.
- Old four movements and same-commodity/batch/unit conservation rejection.
- Actual 3-tonne Core result with exact Event/funding/final receipt, both rolled-back
  rehearsal and committed canonical readback.
- Inflated output, forged material debit, wrong OP title/unit, missing maintenance,
  null run ID, wrong source batch, duplicate source account, mixed snapshot,
  wrong cost and unsettled funding all rejected with rollback and zero production rows.
- Wrong posting fingerprint, plan rather than settlement Event, foreign World
  binding, missing receipt and wrong final Event set rejected.
- Duplicate run under a different posting ID rejected before final receipt by
  the run unique index. Other four indexes are installed, not individually
  concurrency-proven by this serial matrix.
- Late append, UPDATE, DELETE and TRUNCATE rejected after actual commit.

Commands use Node 24.20.0 and existing frozen dependencies; no network dependency
installation. Commands are run with a cleared environment and pinned Node PATH:

```text
node node_modules/vitest/vitest.mjs run tests/world-core/production-posting-schema.test.ts
node node_modules/typescript/bin/tsc -p tests/support/tsconfig.f-production-schema.json --incremental false
node node_modules/eslint/bin/eslint.js tests/support/production-schema-fixture.ts tests/world-core/production-posting-schema.test.ts
node node_modules/prettier/bin/prettier.cjs --check <owned TS/JSON/Markdown files>
node node_modules/typescript/bin/tsc -p packages/core/tsconfig.build.json --incremental false
node node_modules/typescript/bin/tsc -p apps/world-worker/tsconfig.build.json --incremental false
node scripts/check-boundaries.mjs
node scripts/check-authoritative-patterns.mjs
ECONMIND_ENV=local node scripts/assert-safe-environment.mjs
node scripts/check-repository-secrets.mjs
node scripts/validate-migrations.mjs
git diff --check
```

The focused TS configuration follows the repository's existing PGlite test
convention: `skipLibCheck` only for vendor declarations missing Emscripten
ambient namespaces, strict application/test checking retained; `allowJs` for the
existing local PostgreSQL environment guard import, without running native PG.

Current local verification results (all exit 0): focused TS typecheck and lint;
owned-file formatting; minimal Core and Worker builds; boundary scan (253 files);
authoritative pattern scan (248 files, 84 Core files); environment guard
(`databaseConfigured: false`, `NOT_LINKED`, mutation forbidden); secret scan
(2110 files); whitespace checks. Migration Git provenance validation is pending
the required artifact-source commit and second manifest commit, not claimed PASS
at this first artifact/source commit.

Prior failures retained: initial Git fast-forward failed ENOSPC and stopped
without cleanup/retry until Control Tower permission; initial setup SQL had a
CASE-expression parser ambiguity and ran no tests; the next run had 4 PASS and
16 failing assertions because existing transaction errors wrap the SQL cause.
The syntax was corrected, and assertions now require the confirmed rollback
wrapper before inspecting its original rejection cause (no weakened test).
The first strict TS attempt found vendor ambient declaration/import issues and
lint found test-only `any`/unused binding; these were fixed before delivery.
The initial boundary check failed closed on unbuilt workspace export targets;
minimal existing Core/Worker builds are required before its repeat, not a source
ownership-policy relaxation. No failed check is represented as passing evidence.

## Release and integration gate

The artifact/source is committed first. Only a second commit may append the
manifest with that full Git source commit, exact hash, release order 23 and
`production_approval: null`. The source commit must resolve the exact artifact
path/bytes through Git with replacement objects disabled. Main-site release
chain alone owns publication after independent/staging review; no manual SQL or
second migration history is permitted.

The existing `historicalWorldOnlyMigrations()` helper recognizes a 22-entry
historical prefix and rejects 23. It is deliberately not changed in this slice.
Its authoritative owner must admit an exact additive suffix without weakening
the frozen 0022 storage veto before complete-chain rehearsal. The focused
World-only tests do not mask or claim that missing release-chain evidence.

NOT_RUN / not authorized here: native PostgreSQL concurrency/crash recovery,
full migration/storage-chain rehearsal, staging and production SQL, publication,
production Supabase/API, Clock/run activation, official OpeningSeed/economic
data mutation, full assets, whole repository suite, frozen prior F matrices,
six-role runtime acceptance and Gate B. No new dependency or production secret.

Worker `PRODUCTION_PERSISTENCE_SCHEMA_NOT_ADMITTED` remains intact. Any later
admission requires explicit Control Tower direction, independent approval,
the reviewed release-chain result and complete actual runtime validation.
This candidate alone cannot open the gate.
