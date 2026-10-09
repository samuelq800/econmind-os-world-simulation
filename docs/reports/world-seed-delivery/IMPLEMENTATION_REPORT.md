# Implementation report: World Seed delivery preparation

## Status

- Source implementation: `2041e18643fb5fb09105d8471d609b1fc937e2d6`.
- Branch: `codex/world-seed-delivery`; base `f4384167cc26aec693f9e40c7ed5caf30da06f43`.
- Status: `IMPLEMENTED_UNVERIFIED`, P2 read-only diagnostic tooling. No independent review or Owner fast-track is claimed.
- Official activation: `BLOCKED`. V09.1 and Gate B are not closed; no P0 VERIFIED claim.

## Implemented scope

- A reproducible offline CLI composes existing pinned source adoption, canonical Seed bridge, physical, water and labour/social constructors without modifying their economic logic.
- Reports contain real current validator results and original exact financial tokens; worksheets separate known facts from unfilled evidence fields.
- `seed:report` exports diagnostics; `seed:check` fails closed with exit 2. No approval, application route, database, writer, clock or production startup input exists.
- Byte-preserving Git attributes cover immutable source bundles, Owner originals, C mapping reports and migration SQL.
- Existing OpeningSeed/bootstrap/replay mechanisms are reused unchanged. No new authoritative state, random economic defaults or seed publication mechanism is added.

## Safety and compatibility

- Changes affect repository-local tooling and documentation. No economic owner, Command/Event/Receipt/Posting schema or permission changes.
- The read-only diagnostic never connects to a database. Verification separately used PGlite and two owned local PostgreSQL 18.4 clusters bound to 127.0.0.1:55487, with disposable database names.
- Linked production Supabase, legacy public/auth/storage, runtime secrets, formal World identity and seat state were not changed.
- `pnpm-lock.yaml`, `status/`, `database/`, `apps/` and `packages/` have no Git content delta from the base. Local CRLF conversions were restored only after comparing normalized contents against Git originals; fixed hashes remain unchanged.
- Both owned PostgreSQL processes stopped successfully. Automatic approval rejected recursive cleanup with the reason "blocked by policy"; stopped data directories remain ignored under `.seed-validation`. No deletion workaround was attempted.

## Actual validation

The accompanying TEST_EVIDENCE.json records commands, actual exit codes and limitations.
The five successful test groups total 154 PASS / 0 FAIL / 0 SKIP, not a complete repository check.
Focused new-test types, Core/Worker/API build, Worker/API types, full lint, changed-file format,
architecture/boundary/pattern checks, safe local environment, secret scan and migration validation/rehearsal passed.

First source/migration probes failed due to local CRLF byte drift. Exact Git-byte restoration and checkout protection resolved those failures without modifying the pins or migration logic.
The first direct new-test typecheck and new README formatting check failed; both were corrected and rerun successfully.

The complete V09 disposable runner was attempted three times:

1. Existing migration bytes failed manifest verification; durable failure evidence also could not be persisted.
2. Restored bytes passed manifest verification, but pristine-role checking correctly refused a cluster previously used by other native fixtures. No guard was bypassed.
3. A new isolated cluster passed all execution steps, commit-acknowledgement-loss/rollback checks and cleanup; final durable evidence writing failed. The result remains FAIL_CLOSED / exit 1.

A direct filesystem probe reproduced Windows directory fsync EPERM. The durability requirement was not removed, and console output is retained only as a failed run log. PostgreSQL 18.4 evidence does not claim PostgreSQL 16 or staging/production equivalence.

## Incomplete and deferred work

- Complete source-supported CB holdings, original denomination/FX, political-capital genesis and actual operating inputs.
- Formal World/admission/Seed lineage, genuine administrator and lawful current seats.
- Successful complete V09 durable evidence and policy-valid gate acceptance.
- Formal API/Worker/clock target, approved publication, deployment readback and full gameplay acceptance.
- Full `pnpm check`, PostgreSQL 16 revalidation, remote CI, independent review, staging, production seed/admission/activation and online economic E2E: NOT_RUN in this package.

## Next action

Deliver the fixed local source, regenerated diagnostic artifacts and actual evidence as a preparation package.
Provide the missing evidence through the existing source/admission chain; obtain required independent review and gate acceptance.
Re-run complete V09 evidence in an approved environment supporting the existing durability contract, or after independently reviewed Windows durability support. Do not start dependent formal implementation or production cutover based on this package.
