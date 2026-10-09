# A — filtered-chain rehearsal provenance correction

Date: 2026-10-08 (Asia/Shanghai).
Status: IMPLEMENTED_UNVERIFIED; fixed candidate for Root/B review, not merge approval.

## Fixed scope and baseline

- Checkout: `.econmind-worktrees/a-rehearsal-filtered-provenance`.
- Branch: `codex/a-rehearsal-filtered-provenance`.
- Base: `13fd4ce820d5c5a9296c9a3cc9bc2ece32ef8fe5`.
- Base tree: `02e2a24a9c91b9f6c9d8f665ee346eff9d3de6bb`.
- Exactly three candidate files: `scripts/rehearse-migrations.mjs`, its direct
  Node regression test, and this report. Final commit/tree/diff hashes are in
  the external candidate handoff to avoid a self-referential commit hash.
- Renewal candidate `fe8c4f263dbde520a3f1725fb39ffe199c1c8254` remains frozen;
  no renewal test, manifest, artifact, policy, workflow, permission, Core or
  Worker changes are included.

## Actual defect and correction

The executed World-only chain is 0001–0021 followed by 0023. It contains 22
entries; Storage 0022 is executed later against the disposable fixture.
The old comparison used `manifest.migrations[index]`, so its last World-only
row was incorrectly compared with Storage 0022's source commit.

The correction compares the queried release rows with the exact executed
entries, checking count and each migration ID, artifact hash, source commit,
and original release order. The 0023 release order stays 23; it is not
renumbered to 22. The complete artifact path/hash/Git preflight, append-only
apply-chain behavior, shared-schema assertion and exact two-policy Storage
fixture check remain unchanged.

## Actual checks

Pinned Node: 24.20.0. Existing read-only third-party dependency links were used;
no install, lockfile rewrite, native database URL or production access.

| Check                                                                                 | Result                                                                                                                            |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Original unmodified baseline `node scripts/rehearse-migrations.mjs`                   | FAIL, exit 1: `clean-baseline release provenance mismatch` (observed before patch; original transcript remains a failure)         |
| Intermediate direct regression                                                        | FAIL, exit 1: 10 passed / 1 failed; new test incorrectly expected the already approved exact 0023 rehearsal suffix to be rejected |
| Final `node --test tests/foundation/migration-rehearsal-filtered-provenance.test.mjs` | PASS, exit 0: 12 passed / 0 failed / 0 skipped                                                                                    |
| Actual clean-baseline in-memory PGlite rehearsal, run by the final test import        | PASS: 22 World-only release rows, 23 total; shared-schema assertion passes before disposable Storage fixture                      |
| Actual existing-schema in-memory PGlite rehearsal, run by the final test import       | PASS: same exact counts and assertions                                                                                            |
| ESLint for script and direct test                                                     | PASS, exit 0                                                                                                                      |
| Prettier check for script and direct test                                             | PASS, exit 0                                                                                                                      |
| Node syntax checks for both MJS files                                                 | PASS, exit 0                                                                                                                      |
| `git diff --check`                                                                    | PASS, exit 0                                                                                                                      |
| Native PostgreSQL / renewal four-case suite / CI                                      | NOT_RUN                                                                                                                           |
| Production migration / activation / Gate B                                            | NOT_RUN; not authorized by this candidate                                                                                         |

Negative controls reject wrong ID/hash/source/order, excluded Storage source,
missing/extra/duplicate/reordered release rows, an unauthorized artifact path,
missing Git provenance, an altered pinned 0023 hash, and unknown 0024 suffix.
Historical 21-entry comparison remains valid.

The intermediate test expectation was corrected against the fixed base, not by
changing policy: base already admits the exact reviewed 0023 rehearsal suffix.
The regression checks byte equality to base for the shared migration policy,
manifest, independent staging policy and staging runner. The staging allowlist
still admits only the exact reviewed 20-chain or pinned 0021 candidate; this
rehearsal fix does not admit 0023 into that staging runner.

## Remaining boundary / stop

This is isolated rehearsal tooling evidence only, not proof of native database
behavior, economic caller readiness, CI success, production activation or a
package/gate closure. No status or ADR authority was changed. Root/B must review
the immutable candidate before any promotion. Stop after candidate handoff;
no production/native blind rerun and no downstream implementation.
