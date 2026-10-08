# A — official opening admission publication entry candidate

Date: 2026-10-08 Asia/Shanghai. P0 / IMPLEMENTED_UNVERIFIED.
Independent review and production activation: PENDING / NOT_RUN.

## Fixed scope

- Main base: `bcfc66787631a13aa5093df42954070c2d7dd66b` (PR116).
- Base tree: `ff81dd455f32719e6383c96d5430e9c38fe9fa92`.
- Branch: `codex/a-official-opening-admission-entry`; separate owned checkout.
- Five new files only: two Worker admission modules, one direct test, one narrow
  typecheck config, this report. Final SHA/tree/diff hash are external to commit.
- No existing dispatcher, UI, API, SQL, grants, migration, manifest, source data,
  status/ADR, local preview or startup module changed. No other's work reverted.

## Real carrier finding

Existing official inspection returns `SOURCE_READY_NOT_APPROVAL` at most.
Bootstrap/readback checks source/seed identity, not Owner authorization.
The economic decision inspector returns an untrusted candidate and requires a
separately loaded Owner record; existing semantic/source-adoption receipts do
not issue a World/seed/model/replay-specific publication authorization.
No current signed admission-publication registry or production signing key was
found in the inspected Worker/API admission paths. None is invented or bundled.

The private authority verifies a domain-separated Ed25519 authorization from a
deployment-owned key/Owner registry. It does not read keys, sign approvals, infer
Owner identity from request JSON or accept an `approved`/`READY`/`ADMITTED` flag.
Module-private proof/issuer identity and captured genuine validation methods
reject structural proofs and replaced instance approval methods.

## Exact private parameter contract

Invocation has exactly `worldId` and `authorizationReference`. Source, authority,
database, real-time reader and narrowly named publisher role are server
composition dependencies, not invocation/request parameters.

The immutable signed authorization binds:

- schema `opening-publication-authorization-v1` and sole purpose
  `AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION`;
- authorization ID, trusted key ID, Owner identity, issue/expiry times;
- exact World, seed ID/fingerprint, model and canonical replay binding;
- SHA256 of the complete source bundle, including source datasets, selection,
  mapping/gaps/coverage, proposal, decision/assembly and independently retained
  Owner record bytes/references.

Signature preimage is `EconMindWorld/opening-admission-publication/v1\n` followed
by Core-canonical authorization bytes. The signature is canonical base64url.
Authorization is conditional permission to publish, never economic adoption or
an ADMITTED result. B must privately provision the genuine Owner-controlled
issuer/key registry and immutable evidence retention; CI/code approval is not a
substitute. This candidate provides no signing endpoint or production key.

## Publication behavior

The service re-inspects actual fixed source bytes, all declared source blockers
and deferred unexecuted records, then reuses existing decision reconciliation
and canonical seed preparation. A signed bundle alone cannot turn missing data
into zero, supply missing rights, execute proposal records or waive a blocker.
It accepts no caller READY result or replacement accounting algorithm.
Historical D05 status is not read or used as an implementation veto. Actual
unresolved source facts remain denied; a reviewed, complete source handoff must
replace stale diagnostic readiness through its normal versioned authority, not
by deleting gaps in this service or changing immutable source originals.

Where all prerequisites are genuinely satisfied, the implemented SQL path:

1. Checks a private, non-superuser/non-bypass/non-admin publisher session.
2. Holds the World head and reads the existing immutable opening seed in the
   same transaction; compares the full seed and exact signed bindings.
3. Rebuilds real V08 lineage, not a caller-provided balance/count snapshot.
4. Rechecks registry/expiry immediately before publication; a changed/revoked
   authorization fails. The future registry's atomic provisioning/revocation
   protocol remains B's independent-review responsibility.
5. Creates admission only at WorldVersion/EventSequence zero. Uses parameterized
   INSERT, deterministic `ADMISSION_<authorization SHA256>` reference, existing
   one-admission-per-World uniqueness and exact row readback. Same immutable
   authorization/seed retry is a no-op; mismatches conflict, never rewrite.
6. Returns ADMITTED only after transaction completion. The SQL veto remains a
   typed failure; acknowledgement-unknown commit is not reported as success.

No seed bootstrap, ledger mutation, simulation transition or Clock starts here.
The service is not imported by a default startup/HTTP composition.

## Actual bounded evidence

Node 24.20.0 / TypeScript 6.0.3 / Vitest 5.0.0. No install or lockfile rewrite;
third-party links only, Core/Worker compiled from this exact checkout.

| Check                                                                                   | Actual result                                                                   |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| New direct private-authority/source-blocked test + existing fixed-source reconciliation | 41 PASS / 0 FAIL / 0 SKIP, exit 0 (25 new, 16 existing)                         |
| Strict focused typecheck                                                                | PASS, exit 0                                                                    |
| Core and Worker builds                                                                  | PASS, exit 0                                                                    |
| Focused ESLint / Prettier / diff whitespace                                             | PASS, exit 0                                                                    |
| Repository boundary / authoritative-pattern scans                                       | PASS, exit 0                                                                    |
| Ready-source positive SQL publication, conflict/recovery/native RLS/concurrency         | NOT_RUN: no real complete source, approval registry or registered SQL publisher |
| Full check / new CI / production SQL / host / Clock / simulation                        | NOT_RUN                                                                         |

Tests use ephemeral TEST_ONLY signing keys and real fixed 70-country source
files. Source-blocked cases assert zero database queries/transactions, not a
fake successful admission. They reject wrong signature/Owner/key/purpose/time,
mutated World/seed/model/replay/source binding, caller flags, forged issuer/proof,
cross-World requests, absent/changed source and injected decision/assembly/Owner
bytes. Unchanged existing reconciliation controls preserve real source values.
Tests byte-compare the original read-only binding store and SQL veto to base.

Earlier failures are retained: initial ESLint `no-ex-assign` was fixed with a
separate cause-walk variable; initial boundary scan failed on missing generated
Worker dist and a missing third-party plugin link. After building this checkout's
Worker and completing that read-only dependency link, the scans passed. No
boundary policy, test skip or SQL veto was relaxed to pass them.

## Exact remaining release boundary / B handoff

This delivers an unactivated publication entry and private parameter contract,
not a published admission or formally enabled engine. Current fixed source
remains blocked. Its semantic adoption and exact complete seed/World readback
must be independently supplied and reviewed. Existing frozen mapping/source
pins cannot be silently changed to make a ready label pass.

B's separate SQL/publication package must register the candidate through the
sole release chain, review the dedicated role/RLS/function boundary, and bind
each INSERT to the immutable verified authorization evidence by admission hash.
Do not remove `ADMISSION_PUBLICATION_ENTRYPOINT_MISSING` merely because this
service exists; do not replace it with a caller GUC/boolean or a broad INSERT
grant. B must retain/audit canonical signed envelope, authorization reference,
source bundle and exact seed lineage, and test the real positive, duplicate,
conflict, rollback, acknowledgement-loss and concurrency paths before release.
The original `runtime-read-binding-store.ts` and proposed SQL are byte-unchanged.

No production credentials were read, no database/host changed and no actual
Owner approval was issued. Stop at fixed SHA/tree/hash handoff for Root/B.
