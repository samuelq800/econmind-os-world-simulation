# Exact official boot publication provenance

Status: `IMPLEMENTED_UNVERIFIED`. Independent review and Root publication pending.

## Fixed scope

Base: `1340774e872c02ae7c47707d6c7c618ffd0abdb1`.
Branch: `codex/d-boot-publication-provenance`.
Worktree: `/Users/samuel/Documents/econclub/.econmind-worktrees/d-boot-publication-provenance`.

Owned files: the publication verifier, its focused test, and this report/SOURCE.json.
No boot JS, selected UI archive/baseline, existing visual record, country source,
economic code, database, status/gate, preview service or production data changed.
Root's checkout was read-only. No merge or deployment performed.

## Failure and resolution

Before implementation, the real `pnpm test:authoritative-ui` exited 1 at
`UI_FILE_HASH_MISMATCH:role-prototypes/season1-immersive/journey.js`.
Country-source check passed before that failure. This failure remains part of
the evidence, not a waived or replaced check.

The complete exact `SOURCE.json` is SHA-256-pinned in the verifier. It binds
the source commit/tree/parent, integration base, original selection/archive,
raw original MANIFEST/PACKAGE bytes, and the two exact original/adapted JS
paths, lengths and hashes. Altering the record, even to another internally
consistent record, is rejected. Original metadata is verified before file
processing. A private proof object prevents caller-created or copied records
from becoming verification grants. Each published file must independently
match the exact adapted bytes and original entry.

This is separate from both visual integration and the existing derived-file
set. Visual exceptions remain **2**; the existing derived set remains **75**.
The new boot category must contain exactly **2** files. Unknown JS still uses
the original manifest check and cannot acquire an exception. No non-empty JS
allowlist was expanded. Future JS changes require a new fixed package/review.

The record is provenance, not economic authority, and not self-awarded review
approval. Its fixed status is intentionally not a mutable release-status field.
Runtime validation does not require Git history or the external absolute-path
ZIP in a CI checkout: it uses the hash-pinned tracked archive identity and
original manifest. The ZIP itself was separately read and verified locally.

## Actual verification, 2026-10-08

Pinned Node `24.20.0`, pnpm `12.3.4`. Cached frozen-lockfile dependencies were
installed by pnpm in this worktree (161 reused, zero downloaded); no lockfile
change. No server, database, economic command or stress test run.

- `pnpm test:authoritative-ui`: exit **0**, real mandatory command, not a substitute.
  Country source checked: 70 countries, source SHA
  `5d493e93dfab1425731191ba7491cce47949d176e4769b33fdca48d2d31dba89`.
  Publication: **286** original files, **75** derived, **2** visual, **2** exact
  boot, **70** country pages, **140** reused map assets;
  `economicStateConnected=false`.
- `pnpm exec vitest run tests/world-web/boot-publication-integrity.test.ts tests/world-web/visual-publication-integrity.test.ts tests/world-web/official-country-boot-guard.test.ts tests/world-web/country-module-home-guard.test.ts`:
  exit **0**, **70/70** tests, four files. Includes **29** new provenance tests,
  unchanged **14** visual tests, unchanged **17** boot + **10** HOME tests.
- Focused ESLint: exit **0** for verifier and new test.
- Focused strict TypeScript: exit **0** using `--noEmit --allowJs --checkJs false
--strict --types node --module nodenext --moduleResolution nodenext --target
es2022 --skipLibCheck tests/world-web/boot-publication-integrity.test.ts`.
  The first invocation exited 2: Node types were not explicitly selected and
  three ordinary-JS test calls omitted the existing `adaptedOutput` property.
  Explicit Node types and `adaptedOutput: undefined` resolved those diagnostics;
  no verifier behavior or existing test was weakened.
- Prettier and `git diff --check`: pass.
- `git diff --exit-code 1340774e872c02ae7c47707d6c7c618ffd0abdb1 -- apps/world-web/public artifacts/ui-authority status database`:
  exit **0**, the original boot/UI/authority/data bytes are untouched.
- Local external ZIP SHA-256 equals
  `d436904dc061b6f909c8b5c180104f82299e987f6e89732f9b82dc9a40e3db71`.
  Read-only extracted original journey/world-clock hashes match SOURCE.json.
- `git show 5c1f355aecc7656c45a44bbab444699c0295b526:<published JS path>`:
  both source commit bytes match SOURCE.json and the unchanged published JS.

Negative coverage: changed source commit/tree/parent/base, archive/manifest,
original/adapted hashes and byte counts, unknown/aliased paths, extra/duplicate/
missing record files, changed original manifest/package, changed selection,
empty/appended/same-length-edited output, forged/copied proof and changed
original rows. Existing ordinary JS and visual rejection remain covered.

Production deployment, post-release browser smoke, economic activation,
native database, full build and Gate B: **NOT_RUN** in this source-only package.
This publication-tooling-only fix produces no new screenshot; earlier boot
browser evidence is in `docs/reports/D_OFFICIAL_COUNTRY_BOOT_GUARD/README.md`.
Remaining UI work: Root publication followed by one real official six-role
browser check; genuine runtime data and action-result wiring require separately
admitted backend sources and approved contracts, not local sample fallback.
