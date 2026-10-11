# A — Authorization publication preparation candidate

Date: 2026-10-11 (Asia/Shanghai).

Disposition: IMPLEMENTED_UNVERIFIED / PREPARATION_ONLY.
Real-source publication: HOLD. E-I01: OPEN. No promotion requested.

## Frozen candidate and authority

We completed only the separable mechanical preparation authorized after C's
fixed design review. We did not implement or register a real-source positive
writer. The registered-source/current-admin/cutoff evidence is still absent
from the bounded inputs; this is not proof of deployed absence.

| Pin                                       | Exact value                                                        |
| ----------------------------------------- | ------------------------------------------------------------------ |
| Base main                                 | `eb033a4d9e717a9cb9149e450900b606c3457403`                         |
| Base tree                                 | `13a60f04c1a9c54eb8ffbaca8b469bf25b293dce`                         |
| Frontier commit                           | `fc68881a96267d030c6c7366f7e58e23fbaa81b5`                         |
| Implementation commit                     | `cb4465e103cdbde139292e3d183a0690c86c8fb1`                         |
| Implementation tree                       | `e6e7618e3a1800451b631ac80db5cfbc9f4e079d`                         |
| Base-to-implementation binary diff SHA256 | `2d7485ba55ade928d4ce0986436793cd3f12aeece6551ce10cc268e551001fe8` |
| Branch                                    | `codex/a-current-authz-mechanical-prep-20261010`                   |

The final documentation-only tip and its tree are recorded separately in the
managed FROZEN_HANDOFF.json, avoiding a report/self-commit hash cycle. The final
native run pins the implementation commit, tree and all eight candidate files
before and after execution. It also records current Core source/dist Office and
Worker preparation dist digests; it does not rely on another checkout's build.

The selected 259-line design remains unchanged at
`01f06329c2a4aaf892cefea865bc8f5fe332d7e8`, SHA256
`12569bf8a523e5e22f01505ff92fa41bd53b50beb5b461e35775fc70b0dbbcb3`.
C's complete review, SHA256
`3555d9102ef51428645f798990e816de6391c78aa09012f1c13448e9713e6550`,
concludes MECHANISM_ACCEPTABLE / IMPLEMENTATION_READINESS_HOLD_FOR_EVIDENCE.
Neither that result nor the tests below close the real-source gate.

## Implemented boundary

The [frozen frontier](AUTHORIZATION_PREPARATION_FRONTIER.md) was committed before
source changes. H means existing World head; A means current authorization rows;
C means the derived publication checkpoint.

- `apps/world-worker/src/preparation/current-authorization-source-contract.ts`:
  bounded canonical UTF-8/JSON parser with exact fields, byte digest, revision /
  predecessor / operation / identity validation, explicit Core Office-capability
  subset, expiry and empty-revoke rules. Its proposed envelope is
  `authorization-publication-preparation.v1`, not a registered producer schema.
  The output is UNTRUSTED_PARSED_DATA_NOT_AUTHORITY; hashes and actor fields do
  not establish a real actor, current administrator or source approval.
- `apps/world-worker/src/preparation/current-authorization-publication-preparation.ts`:
  pure complete-subject replacement and CAS/checkpoint plans. All active and
  inactive rows are validated. Omitted rows become inactive; country/team/Office
  changes, empty revoke and predecessor mismatch are explicit. Stable semantic
  fingerprints exclude refreshed timestamps. The planner cannot perform SQL or
  grant authority. Exact operation/bytes/original arguments plus full A/C match
  produce read-only EXISTING metadata even after an economic head advance.
- The same module distinguishes confirmed rollback from UNKNOWN. It never
  automatically retries UNKNOWN or substitutes newer expected arguments.
  Readback comparison is metadata-only, not source-currentness or original
  acknowledgement proof. The unregistered product factory holds no database,
  configuration or resolver; apply/readback always return
  AUTHORIZATION_SOURCE_NOT_REGISTERED, with zero queries and writes.
- `database/proposals/current-authorization-writer-preparation.sql`: unnumbered,
  unregistered C metadata table plus exact four-argument refusal function.
  It requires READ COMMITTED, locks existing H first, then always raises
  AUTHORIZATION_SOURCE_NOT_REGISTERED before source/A/C mutation. Missing H
  refuses without creating H. SECURITY INVOKER, fixed search_path, PUBLIC execute
  revoked; C uses FORCE RLS without policies or public grants. No role, caller,
  positive source stub, mutation body, migration or manifest registration.
- Owned tests and fixture are confined to
  `tests/world-core/current-authorization-publication-{preparation,postgres}.test.ts`
  and `tests/support/current-authorization-preparation-fixture.ts` plus its
  focused strict tsconfig. They are not exported product adapters.

The future positive path must preserve
H → real source/current-admin → C → complete A. The native positive fixture tests
only H → C → complete A, with TEST_ONLY inputs. We deliberately do not describe
that reduced oracle as proof of the real source or cutoff lock closure.

## Verification actually executed

Node 24.20.0 was used, with the frozen dependency lockfile. Current-checkout Core
and Worker were rebuilt. Native PostgreSQL was Homebrew 16.15, a task-owned
private Unix-socket cluster, no TCP listener, sanitized environment and no
production credentials. Its marker, directories, UID/modes and server identity
were checked before SQL. Binary/version hashes and exact commands are retained.

| Check                                        | Actual result                      |
| -------------------------------------------- | ---------------------------------- |
| Focused pure Vitest file                     | 15 PASS, 0 fail, 0 skipped         |
| Fixed-code native Vitest file                | 9 PASS, 0 fail, 0 pending, total 9 |
| Core and Worker current-source builds        | exit 0 each                        |
| Focused tsc, strict, skipLibCheck=false      | exit 0                             |
| ESLint, five owned TS files                  | exit 0                             |
| Prettier, seven supported owned files        | exit 0; SQL parsed by native PG    |
| Repository boundaries                        | PASS, 336 files                    |
| Authoritative patterns                       | PASS, Core 91 / total 331 files    |
| Unchanged migration provenance               | PASS, 23 manifest artifacts        |
| Repository secrets                           | PASS, 2464 files                   |
| Diff whitespace / protected source unchanged | exit 0                             |

Commands use the pinned Node executable to invoke `node_modules/vitest/vitest.mjs`,
`node_modules/typescript/bin/tsc`, `node_modules/eslint/bin/eslint.js`,
`node_modules/prettier/bin/prettier.cjs`, `scripts/check-boundaries.mjs`,
`scripts/check-authoritative-patterns.mjs`, `scripts/validate-migrations.mjs` and
`scripts/check-repository-secrets.mjs`. Complete argument lists, exit codes and
actual output are retained in the managed checks evidence, not reconstructed
from this summary. Final report formatting and tip checks are recorded in the
handoff manifest.

The native bootstrap uses the original bounded storage fixture, the frozen
22-artifact renewal fixture and the unchanged admission-veto proposal. The
repository manifest's 23-artifact provenance is a separate check. No synthetic
formal admission is created; admission count stays zero and its veto remains
enabled. The task-owned server stopped successfully after the nine-case run.

### Native oracle scope and cases

The nonadmin probe is NOBYPASSRLS/NOSUPERUSER/NOCREATEROLE/NOINHERIT. Its
TEST_ONLY grants permit only H locking and the exact denial function, not A/C
DML. A distinct nonadmin TEST_ONLY oracle identity applies pure plans via scoped
transaction SQL inside the test file. That identity's direct DML grants are not
an execute-only publisher ACL or a proposed generic grant entrance.

The nine cases cover:

1. Product SQL source/head/isolation refusal with no write footprint.
2. H wait before any inactive A lock, independently checked with
   pg_blocking_pids and A NOWAIT.
3. All six Offices and complete country/team/Office replacement; nonauth
   economic tables unchanged.
4. Exact read-only retry after economic H advances; stale predecessor, CAS and
   altered-byte conflicts roll back.
5. Same-before contenders serialize with one winner; concurrent exact duplicate
   does not refresh rows.
6. Mid-row and actual C digest-constraint errors roll back all A/C changes.
7. Empty revoke checkpoint, supersession and no old-source resurrection.
8. Actual commit followed by TEST_ONLY lost-ack exception: UNKNOWN, no automatic
   retry; fresh metadata comparison and exact retry remain read-only.
9. Probe A/C INSERT/UPDATE/DELETE/TRUNCATE and SET ROLE denied; no PUBLIC execute;
   original veto and zero admission intact.

The time inputs are fixed TEST_ONLY fixtures, not evidence of a live source's
current TTL or revocation state.

## Failure history, preserved

The first native attempt failed during setup because role `anon` was absent;
zero tests passed and eight skipped. The correction reused the unchanged
original bounded storage precondition; it did not weaken migration 0022 or the
admission veto. That failure, an intermediate eight-pass run and a later
unbound nine-pass run remain separate from the final fixed-code nine-pass run.

An initial repository boundary run failed because this worktree's dependency
symlink resolved workspace packages to another checkout's dist. We corrected
only this task's dependency topology, used current-checkout workspace links and
rebuilt Core/Worker; the final boundary run passed. The initial tool output was
truncated, and is retained as truncated failure output, not a complete raw log.
The initial strict optional-getuid guard and unused-parameter lint errors were
also fixed before the definitive checks.

## Explicit HOLD / NOT_RUN and ownership

We have not implemented or verified real source ownership/registration,
immutable/current-pointer lookup, issuer/audience/actor/current-admin evidence,
TTL/revocation/cutoff participation, or the real-source positive transaction.
The complete NOLOGIN non-assumable, non-table-owner/NOBYPASSRLS definer,
execute-only live publisher and catalog/ACL/RLS bypass inventory remain HOLD.
No TEST_ONLY fixture, digest, DTO or positive Boolean can activate this entry.

B still owns narrow-approval consumer compatibility; D owns zero-effect
repository compatibility and its E guard; E owns the actual source. G's manual
runtime is untouched. No B/D compatibility, actual source integration or E-I01
closure is claimed. The selected design, existing admission veto, Core Office
definitions, SqlDatabase/Postgres contract, protected consumer files, migration
manifest/artifacts and status authority are unchanged from base.

Outside isolated TEST_ONLY fixtures, no Command/Event/Posting/receipt/outbox/
economic-version or admission mutation,
product route/export/caller registration, production access, CI dispatch,
full/420 suite, push, merge, deployment or activation occurred. Independent
review remains required. Performance/memory/latency are UNMEASURED; no benchmark
claim is made.

Rollback is removal of the unregistered candidate; it requires no production
data migration. A future source binding or positive writer needs separate
evidence-backed review and schema publication authority. Keeping the product
unavailable is the current safety boundary, not an invitation to add raw DML
grants or treat the fixture as a real publisher.

## Retained evidence

The target-bound managed collection is
`a-current-authz-mechanical-prep-20261010` /
`artifacts-3a5f1928e91c2f702d47f1bc133ce934a2d8b8e0a119271987ab2fa534f6a963`.
Its `artifacts/A_AUTHZ_PREPARATION/bound-final-native/` contains the actual
runner, marker, native JSON/log, server/command logs and source-pinned evidence.
The runner evidence SHA256 is
`93d62af49b3685f7e6dd11e0cbb844a4a0923f340d62320f761161141d5872e8`.
`checks/` retains check records and prior failures; `FROZEN_HANDOFF.json`
identifies the final documentation-only tip, file hashes and explicit limits.

Stop point: frozen local candidate for independent review, not live readiness.
