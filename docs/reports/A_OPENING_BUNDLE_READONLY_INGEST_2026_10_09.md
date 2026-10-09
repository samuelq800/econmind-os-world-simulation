# A — real opening bytes loader and read-only preflight

2026-10-09 Asia/Shanghai. IMPLEMENTED_UNVERIFIED; Root/B independent review PENDING.

Base `96217db583db4c1bd6ef74714b2e0a5ef6b7ed6d`,
tree `f605d1a21899a18636e62ebcb8bec69cd39cd3ac`.
Branch `codex/a-opening-bundle-ingest-20261009`; separate checkout
`/Users/samuel/Documents/econclub/.econmind-worktrees/a-opening-bundle-ingest`.
Five new owned files only: loader, preflight, dedicated test/config and this report.
No other's work reverted; no existing source, Core, currency/admission rule, SQL,
schema, migration, startup, API/browser, governance or legacy-product file changed.

## Implemented private entry

`new OfficialOpeningBundleLoader({ repositoryRoot, incoming? }).load()`
reads only a reviewed server-controlled immutable directory. No invocation path,
client path, approval/READY flag, validator callback, key or database input exists.
`incoming` is server composition's file identity configuration, not a new formal
economic input protocol or a manifest trusted from the package itself.

The loader verifies all 86 original CHECKSUMS files, including non-JSON originals,
plus seven independently pinned carriers: CHECKSUMS, mapping, coverage, proposal,
selection, map manifest and gaps. It retains the existing bundle's exact 34
structured dataset bytes. Fixed source pins and raw originals are unchanged.
Safe normalized relative locators, no file/parent/root symlinks, regular files,
bounded reads, exact sizes/raw SHA-256 and fatal UTF-8 decoding are enforced.
Limits: 32 MiB/file, 96 MiB total, 64 Owner records. The root must be privately
retained, not concurrently rewritten by an untrusted uploader.

Incoming decision/assembly locations are fixed at `incoming/decision.json` and
`incoming/assembly.json`; Owner records use validated server-configured IDs under
`incoming/owner-records/`. Their identities and complete bundle digest are
independently configured once, not read from those bytes. The existing
`OfficialOpeningPublicationSourceBundle` and
`officialOpeningPublicationSourceSha256` are reused without replacement.
No current decision/assembly is synthesized when the configuration is absent.
All snapshots and nested byte maps are frozen; a copied caller status report is
not a genuine loader snapshot.

`preflightOfficialOpeningBundle(loaded)` directly invokes existing source
inspection, official admission-source inspection, decision reconciliation and
canonical bridge. With no real incoming decision, only E's existing explicitly
unresolved diagnostic is used; it is never represented as a supplied Owner record.
If the existing bridge ever supplies a genuine candidate, canonical rehydration
and V08 ledger reconstruction use the actual Core parser/rebuilder. That
successful seed branch is NOT_RUN with current real data.

## Actual source result, not readiness

Compiled code reads 93 files / 62,374,856 bytes, preserving all 34 JSON datasets.
Actual statuses: source VALIDATED_SOURCE_NOT_ADOPTION; admission-source,
decision and bridge BLOCKED; Core seed validation NOT_RUN_NO_SEED.
Result PREFLIGHT_BLOCKED, null seed fingerprint/World, activation forbidden,
formal admission unevaluated. The diagnostic has 1,002 stage-specific blocker
entries, not 1,002 unique missing quantities or newly revoked Owner decisions.
Exact grouped codes and per-file hashes are in `actual-preflight.json`.
Legacy full-intent validation does not revoke the existing approved Owner subset.

Real code gap remains explicit: old canonical assembly permits one GCU batch per
country; official bootstrap requires a selected LC batch per country and permits
additional GCU. Core already has `OpeningSeed.financialBatches:
FinancialOpeningBatch[]`; no new ledger or arithmetic is needed. Formal
source-backed LC/FX (rate/version/valueDate) and complete 21-category CB register
producer contracts are absent. Current Owner-adopted FX/CB success mechanisms
are TEST_ONLY and cannot become formal carriers. This is NOT merely an external
numeric-data wait. The producer is NOT_CONNECTED_IN_CURRENT_BASE; its engineering
work is HOLD pending actual fields/source contracts and independent review.
Implementation gaps are reported separately from existing validator blockers,
not installed as new economic or governance rules.

After a complete compatible real seed is independently reviewed and its World,
fingerprints and execution authority are supplied, the separate explicit writer
may use existing `OfficialWorldOpeningBootstrapper.bootstrap` →
`WorldOpeningBootstrapReadback.bootstrapAndReadback`. This slice neither
installs nor invokes that path. No bootstrap/admission result is issued.
The existing admission publisher, SQL veto and production release boundary remain
untouched. Map manifest identity is checked; 203 image/asset bytes were NOT read
or claimed as an asset deployment check.

## Bounded evidence

Evidence:
`/Users/samuel/Documents/econclub/artifacts/a-opening-bundle-ingest-20261009.A3ggmE`.

- Node 24.20.0 / pnpm 12.3.4, frozen offline installation, ignore install scripts:
  161 reused, zero downloaded, no manifest/lockfile edit.
- Core dependency build and this checkout's Worker build: exit 0; no Worker process.
- Dedicated test: 14 PASS / 0 FAIL / 0 SKIP, 6.23s, `final-focused-tests.json`.
- Strict dedicated TypeScript with unchanged base strict/index/optional checks:
  exit 0, no skipLibCheck or compiler relaxations.
- Focused ESLint, boundaries, authoritative-pattern and cleared local-environment
  checks: exit 0; exact commands/results in `targeted-checks.json`.
- Formatting/diff/scope checks and immutable SHA/tree/file hashes are in the
  external frozen handoff. Compilation uses this checkout, not another dist.

Tests cover complete original bytes, exact monetary-source string preservation,
real validator blockers, absent actual decision/assembly, and digest-valid
wrong-schema real carriers. The latter copies the real Owner subset receipt and
real material reconciliation into inappropriate slots solely to prove rejection,
not to fabricate a positive approved seed. Negative controls cover changed bytes,
truncation, UTF-8, missing non-JSON original, locator/manifest tampering, symlink
paths, caller flags, duplicate/traversing record IDs and individual/total budgets.
Actual preflight asserts zero bootstrap/store/readback/publication method calls.

Initial test FAIL retained: 13 PASS / 1 FAIL due to this new test's byte-sum typo
(62,384,856 instead of verified 62,374,856), `first-focused-tests.json`.
The assertion was corrected to the independently summed source sizes, not removed.
Initial lint FAIL `no-control-regex` was repaired with explicit code-point
checks; no suppression or weakened path constraint.

Production, database access, bootstrap/admission execution, Worker/Clock startup,
native PostgreSQL, successful real seed, full suite and provider rerun: NOT_RUN.
Root's latest handoff reports PR118 still unmerged and the previous whole-job
CANCELLED retained; Root restarted that job after runner-capacity diagnosis.
No new provider outcome is inferred or queried here; no duplicate full/100-test
run, CI change, push, merge or promotion by A.

Stop at frozen SHA/tree for Root/B narrow review. Code/test success is not
independent approval, admitted opening state or permission to enable the World.
