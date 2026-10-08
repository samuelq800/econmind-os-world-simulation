# F — Exact HTTPS posting-source remote compatibility

Date: 2026-10-08
Status: IMPLEMENTED_UNVERIFIED — independent review required
Scope: SOURCE_ONLY / NOT_REGISTERED / CALLER_NOT_READY.

## Fixed baseline and actual failure

- Repository: econmind-os-world-simulation only.
- Base: `1340774e872c02ae7c47707d6c7c618ffd0abdb1`.
- Base tree: `caeb94e19ca428009ee425038dd54698417e0fcf`.
- Branch: `codex/f-posting-remote-compat`.
- Checkout: `/Users/samuel/Documents/econclub/.econmind-worktrees/f-posting-remote-compat`.
- Trusted CI run [37757898825](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37757898825) is completed / failure at the exact base. Its direct test bootstrap fails with `POSTING_RELEASE_REMOTE_INVALID`. This FAIL remains FAIL; no CI rerun is claimed.
- A real local shared bare Git fixture reproduces the missing-`.git` rejection against unchanged base policy. New regression-only run: 35 PASS / 2 FAIL (the legitimate bare-HTTPS child and its parent), exit 1. No mock Git executor or invented source bytes.

## Minimal repair and preserved authority

The origin gate permits only these exact strings:

- `https://github.com/samuelq800/econmind-os-world-simulation`
- `https://github.com/samuelq800/econmind-os-world-simulation.git`

Remove only Git's one terminal record newline, then compare exact strings. Do not parse or normalize URLs; ports, userinfo, encoded paths, query, fragment, alternate host/owner/repo/path/case, trailing paths and changed suffixes remain refused. Whitespace is not silently trimmed. Existing base source accepted only HTTPS with `.git`; this repair does not add SSH or SCP acceptance.

No original/shared Git configuration is edited. Only owned disposable test fixture origins are varied to exercise the actual gate. Clones are local shared bare clones, with no fetch/network; fixture cleanup owns its unique mkdtemp path.

Fixed source commit `7461a053a74131fcc8273a8ac981e28b510ca03c`, migration tree `97cd00dea1a9e9ff600278fb2c41fa67a037c667`, exact 23-artifact manifest, artifact-source commit `4714c1da7af9324741996b94c6da036bf54c39a4` and artifact hash `0e1ec372429164acb94f9b9588beac75fbf984f5a41413af13715e28a4e94a36` are unchanged. The content-derived policy fingerprint changes normally with the source repair; no fingerprint bypass or source substitution.

Phase locks, private plan identity, one atomic SQL request, exact 22/23 ledger guards, actual response verification, UNKNOWN stop/no replay, readback-only phase and `economicActivation=false/schemaAdmitted=false` remain unchanged. No sender, credentials, arbitrary SQL parameter, publisher registration, database target or production permission is added.

## Actual bounded checks

Pinned Node 24.20.0; declared pnpm 12.3.4. Reused installed frozen dependencies, no install/lockfile change. Tests run with env -i and direct Node. Original 23 assertions/cases retained; new 37 counted Node tests consist of one parent, two exact positive URL cases and 34 negative URL cases.

| Check                                                                                | Result                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Direct focused test file, real Git and disposable PGlite                             | 60 PASS / 0 FAIL / 0 SKIP; exit 0; 8.904 seconds |
| Strict policy types: tsc -p tests/support/tsconfig.f-production-posting-release.json | PASS, exit 0                                     |
| Focused ESLint, both code/test files                                                 | PASS, exit 0                                     |
| Focused Prettier                                                                     | PASS, exit 0                                     |
| git diff --check                                                                     | PASS                                             |
| Protected paths versus exact base                                                    | Zero differences                                 |
| Original trusted CI                                                                  | FAIL retained; not superseded by local tests     |

Both accepted origin spellings prepare the same publish and readback requests using real immutable Git objects. Negative coverage includes scheme/host/owner/repo/path, lookalike host, extra slash/path, double suffix, query/fragment with and without `.git`, explicit default/custom port, userinfo, host/owner/repo case, percent encoding, path normalization, SSH/SCP, spaces and newline characters.

Original actual PGlite checks still exercise exact historical22→0023, preflight conflict, post-DDL/pre-commit rollback, once-only commit, duplicate refusal, separate held read-only readback, malformed/extra/missing/reordered provenance, unknown0024, Storage policies and public sentinel preservation. Lost acknowledgement remains a classifier test, not a real network-fault injection claim.

Protected database, artifacts, status, apps, packages, Supabase, workflows and migration/staging policies remain unchanged. Existing origin remains HTTPS with `.git`.

Retained actual command outputs, original CI and baseline failure:
`/Users/samuel/.codex/state/plugins/codex-security/scans/f-posting-remote-compat/artifacts-2bab138266086172aabf53df73c89e6925b92e84010854133744d3e873e4d87e/artifacts/F_POSTING_REMOTE_COMPAT_2026_10_08/`.

## Handoff and STOP

Only policy, direct test and this report are changed. Candidate commit/tree, diff hash and exact three-file hashes are recorded in an external fixed freeze after commit to avoid self-reference.

Independent review by G or B is PENDING, controlled by Root; no self-approval. Full CI/check, native PostgreSQL, production SQL publication, publisher registration, schema admission, role execution, engine/Clock/420/Gate B are NOT_RUN. This repair does not complete production permission or all six role constructions.

Commit/push the independent candidate, return fixed identities to Root for independent review, then STOP. No edits to Root worktree or another owner's files.
