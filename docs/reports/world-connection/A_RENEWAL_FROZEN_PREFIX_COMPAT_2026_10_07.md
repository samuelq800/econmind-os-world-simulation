# A renewal fixture compatibility — source-only forward fix

## Candidate and unchanged acceptance

Base: `ff8ecb931389d53e7fe70897c5d0c06183cf0e09`, tree
`76a628455b9a1fcc4e11d146ec4e3823a229209d`.
Branch: `codex/a-renewal-frozen-prefix-compat`.
Status: IMPLEMENTED_UNVERIFIED; independent review / provider native validation
PENDING. This is historical test setup compatibility, not a World runtime step,
complete new-chain rehearsal, migration publication, seed or production authority.

PR114's provider renewal run `37643561796` returned 4 skipped / 0 passed and
2 failed suites from setup failure. Raw evidence remains unchanged at
`/private/tmp/econmind-renewal-ci.ub4OH1/renewal-results.json`.
The existing setup bound the entire current manifest to frozen hash
`39efbcfdb28b0a5302fc2d8b7a6c55c8543539e265daaa272b065284d2d839bf` and 22 entries.
Base now has 23 entries and manifest hash
`e675bd8bd18ba6c51aeffa674320dba3ac79299b7e12eeef834fe28547f9025e`.
Its first 22 complete entries remain identical. The old failure is not relabelled
PASS, and no historical candidate or evidence was overwritten.

## Scoped implementation

- Copy the exact historical manifest from immutable
  `ea492a2d76daf2eab600a58c866d7f600a53112f:database/migrations/manifest.json`
  to `tests/fixtures/migrations/renewal-frozen-22.manifest.json`.
  Its raw bytes retain the original frozen SHA-256 above; loader additionally
  compares the copy byte-for-byte to immutable Git with replacement objects disabled.
- Test-local helper compares full header and first 22 complete objects with that
  original. No changed prefix, missing entry, unknown metadata or new authority
  is accepted. Only the exact reviewed F0023 complete identity is permitted as
  the single optional suffix: source `4714c1da7af9324741996b94c6da036bf54c39a4`,
  SQL SHA-256 `0e1ec372429164acb94f9b9588beac75fbf984f5a41413af13715e28a4e94a36`.
  Extra/unknown suffixes and changed identity fail closed.
- Validate **all current 23** artifact bytes and immutable source provenance with
  the unchanged `readMigrationGitProvenance` / `validateMigrationManifest`.
  Unexecuted 0023 cannot bypass validation. This is validation only, not SQL execution.
- Return only the original 22 ordered SQL artifacts. Native setup retains the
  original `manifestHash`, `toHaveLength(22)`, canonical disposable environment
  guard before connection, fresh-target check, original bounded Storage fixture,
  and the original release-record insertions. It never applies 0023.
- All four actual renewal/competing holder/backward time/takeover and fencing
  case bodies are byte-for-byte unchanged from base; a focused test verifies this
  and the unchanged Storage fixture. SQL, current manifest, shared Root helpers,
  scripts, Core, Worker, workflow filters/permissions and governance are unchanged.

## Checks and engineering boundaries

Pinned Node 24.20.0 / pnpm 12.3.4. Sparse checkout is about 1 MiB: no public/map
asset copy, build, dependency install or new database. Reused only read-only
third-party packages from A's own previous checkout, not workspace packages;
new checkout owns its `.vite`/temporary caches. The incidental lockfile write
caused by a version probe in the sparse environment was restored byte-for-byte
to base; lockfile is not a candidate change. Subsequent checks use pinned Node
directly, avoiding package-manager bootstrap.

| Check                                                                        | Actual result                                        |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| Pure prefix/provenance controls                                              | PASS, 23 tests, one file, no database                |
| Scoped TypeScript including unchanged native cases                           | PASS, exit 0                                         |
| Scoped ESLint                                                                | PASS after fixing a test-regex formatting diagnostic |
| Complete current migration validation                                        | PASS, 23 migrations, no violations                   |
| Frozen original bytes/digest; unchanged four case bodies and Storage fixture | PASS                                                 |
| Formatting / staged diff check                                               | Bound in fixed external receipt                      |
| Real PostgreSQL/native renewal four cases                                    | NOT_RUN; no V09_TEST_DATABASE_URL                    |
| Provider CI rerun / complete 23-chain SQL rehearsal / production             | NOT_RUN                                              |

Controls include historical-22 and current-23 positives; reformatted frozen bytes;
changed prefix hash/source/order/path/approval/metadata; missing/reordered/extra
entries; changed suffix identity/schema/approval/metadata; changed publisher
authority; tampered 0023 SQL; missing or altered 0023 Git source; and missing
historical Git provenance. None weakens a native economic/lease/fence assertion.

`tsconfig.renewal-prefix.json` is test-local: allowJs/checkJs=false loads existing
MJS helpers, DOM types satisfy Vitest's tinybench declaration; no production
type configuration or skipLibCheck relaxation was introduced.

## Owner handoff and stop

Root/B review the fixed forward-fix commit. Root then integrates it and runs the
unchanged provider workflow against its fresh owned CI PostgreSQL service. Only
downloaded results with exactly 4 PASS / 0 FAIL / 0 SKIP close that native check.
Do not equate these 23 pure controls with four native passes, complete new-chain
rehearsal, Storage production permissions or economic activation.

Fixed SHA/tree/base/diff/report hashes and the preserved failed-run digest are
in the external receipt. No CB-1 candidate was changed. Stop after handoff;
no self-approval, main merge, production access or further runtime work.
