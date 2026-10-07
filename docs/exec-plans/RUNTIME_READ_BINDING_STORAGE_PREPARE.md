# Durable seat / immutable opening admission storage — source-only proposal

## Frozen design before implementation

Base: `a1a84656ce51da584d119f71270cf0234025dccc` (PR91 main). Branch: `codex/a-runtime-read-binding-storage`. P0; source-only parallel preparation, no formal dependency-gate change. Gate B remains PENDING.

Owned new paths only:

- `database/proposals/runtime-read-binding-storage.sql`
- `apps/world-worker/src/persistence/runtime-read-binding-store.ts`
- `tests/world-core/runtime-read-binding-store.test.ts`
- `tests/support/tsconfig.runtime-read-binding-store.json`
- this plan.

No other producer's source, shared export, migration artifact, manifest, Core algorithm, authorization source or status changes. This SQL is not a migration/publication path. Manifest remains `WORLD_V2_MIGRATIONS-1`, 22 artifacts, publisher `main-site-release-chain`, repository production mutation false. A future candidate might be `database/migrations/artifacts/0023_world_v2_runtime_read_binding.sql` only after Root allocates the current next number and approves exact bytes/provenance; neither that file nor a manifest entry is created here.

## Exact existing authorities inspected

- Constitution U0364–U0371 / R091–R094: many-to-many six Offices, Office-based independent approval, repeated server authorization; U0379–U0395 / R098–R099: RLS and exact current identity/world/country/Office/version/approval checks.
- Core `authorization/offices.ts`: genuine opaque AuthorizedOfficeContext, `reauthorizeOfficeCapability`, current team/country/Office/revision. Do not copy this authorization logic or make a new role assignment authority.
- `0011` current_commit_authorization: current per-capability facts; durable seat identity absent. Multiple capability rows do not create multiple seats. Many Offices remain supported.
- `0016` opening_seed + existing WorldOpeningSeedStore: immutable canonical seed/replay lineage, not admission.
- official-world-opening-admission: SOURCE_READY_NOT_APPROVAL inspector; bootstrap returns BOOTSTRAPPED/ALREADY_BOOTSTRAPPED and readback, not a independently approved ADMITTED decision.
- ServerVerifiedReadBinding / ServerReadBindingPort: current active seat ref/revision and admitted seed ref required; missing/revoked/ambiguous denies. This storage does not implement that full provider or entitlement/JWT/HTTP.
- G `G_POSTGRES_SERVER_READ_BINDING_PLAN.md`: seatRef/admissionRef are genuine remaining persisted-authority gaps; runtime role must be separate from official-source roles. Other semantics remain G-owned.

## Minimal proposed records

`runtime_read_seat`: DB-minted canonical seat_ref, existing world/verified subject/country/Office/team/authorization revision, created timestamp. Immutable. The unique `(world_id, auth_subject, office_id, authorization_revision)` key rejects same-revision country/team reuse. Revision-scoped ref is stable on duplicate retries, different on reassignment/revision. There is no stored active/capability/grant bit: current authorization determines whether a historical reference is usable. No backfill or user assignment is performed.

Trusted seat publication reuses a genuine Core context, reauthorizes it, verifies the actual configured non-bypass/non-superuser publisher session, then derives current SQL facts inside a transaction. It inserts only the exact current tuple; capabilities collapse, Offices do not. No caller seat ID, team/revision assertion, approval flag, role creation or SET ROLE. Publisher privileges must later come from the existing trusted authorization service via reviewed release/provisioning; this code grants nothing.

`runtime_opening_admission`: immutable DB-minted admission_ref with exact world/seed ID/fingerprint, model/replay binding and admission timestamp. FK/trigger bind the stored opening lineage. No generic approval boolean, code-review hash, source-selection ref or user-invented evidence field.

There is no existing independent ADMITTED-result publication entrypoint. **All admission inserts are vetoed** with `ADMISSION_PUBLICATION_ENTRYPOINT_MISSING`; no publisher method or factory mints one. The repository may read a genuinely published immutable record in future, reusing WorldOpeningSeedStore's Core validation, but absence denies today. Enabling insertion requires a separately reviewed forward migration wired to a real, independently trusted admission result/publisher; source ready, bootstrap, bridge or Root code approval is insufficient.

## RLS / permissions / deployment holds for Root

Both new tables FORCE RLS, revoke PUBLIC/browser/official-source-reader access, and reject UPDATE/DELETE/TRUNCATE. Subject-scoped SELECT joins current exact seat authorization; revoked/conflicting team/country/revision cannot be restored by an old ref. Runtime reader and authorization publisher are separate configured actual non-privileged roles, never the existing `world_v2_api_reader` / `world_v2_api_login`. No role or grant is created.

Candidate seat INSERT policy checks existing current tuple; it confers no INSERT privilege. Only the existing trusted authorization publisher may later receive narrow INSERT/SELECT rights on the new seat record and its existing authorization-source access. A separately provisioned runtime reader gets only SELECT for fixed facts, no record publication or economic DML. Opening seed SELECT policy/grants and full G provider remain deployment/integration holds, not changed here.

Human/authority decisions still needed, once: identify which existing trusted authorization publisher/session publishes derived seats; define who issues the actual independent opening ADMITTED result and which existing gate/approval constitutes it; bind that result to a reviewed admission publication entrypoint/privilege. No new hash/value is requested from the owner. Engineering preparation is not economic adoption or admission.

## Verification plan / endpoint

- [x] Governance/contract/manifest/G gap investigation and minimal design.
- [x] Implement candidate SQL and parameterized repository, no DB connector/startup.
- [x] Focused isolated in-memory PGlite fixtures only: seat retry, capability collapse, multi-Office identity, revocation/team/revision conflicts, forged context, actual role/subject isolation, immutable records and admission veto despite valid seed/bootstrap/source.
- [x] Dedicated type/lint/format/build/import/secret checks; no whole-suite scan or live DB.
- [x] Prepare external evidence/freeze handoff; commit identity is recorded outside the immutable candidate. Independent review remains PENDING; STOP after freeze.

## Actual implementation checks

Node `24.20.0`, pnpm `12.3.4`; offline frozen install, Core build, dedicated TypeScript check/emit, owned-source ESLint, four supported-file Prettier checks, owned-module repository boundary analysis, five-file secret policy scan and local environment safety check PASS. Environment reports databaseConfigured=false, NOT_LINKED, databaseMutationAllowed=false. The emitted-module import uses only this checkout's built Core and makes no connection. Exact commands/results and frozen identity are in the external handoff.

`vitest run tests/world-core/runtime-read-binding-store.test.ts`: **11/11 PASS**, no skipped tests. Nine tests use actual proposal SQL and unchanged existing migrations in fresh isolated in-memory PGlite databases. Two future-row consistency tests use synthetic query results only: no admission veto is disabled and no ADMITTED record is created. This is not native PostgreSQL, concurrency, or production proof.

Initial run: 9/11 PASS. Fixed preservation of the repository's typed fail-closed error across rollback wrappers, and corrected a read-only assertion to inspect SQL statement prefixes rather than privilege-name string literals. Dedicated config follows existing isolated fixture configurations: skip third-party declarations and allow imported existing unchecked `.mjs`; owned TypeScript remains strict. No existing test/config/source was weakened or changed. An initial emitted-import smoke used the wrong relative output path and failed; corrected absolute output path and exact-checkout Core resolution PASS.

G facts reader is reused, not recreated: source pin `b74c88daa5a56a7e9c803188d728c5815bc98e72`, now integrated by Root with C/E into main `278c9c98527bcda4f3942f3b6b47e8e926a14ca0`. This candidate deliberately remains on the authorized PR91 base. It supplies new-record lookups only, not G's current authorization/entitlement/FINAL/projection/head reader, a full binding provider, or a JWT/HTTP route. Integration and rebase are held for Root after narrow independent review.

Migration manifest SHA-256 remains `39efbcfdb28b0a5302fc2d8b7a6c55c8543539e265daaa272b065284d2d839bf`. Formal manifest/artifacts, status, Core and API have no diff from base. Formal migration validation/publication/rehearsal of this unregistered proposal is NOT_RUN; its parsing and behavior are exercised only in the isolated fixture matrix. SQL proposal SHA-256 is `8bb715881ebbe78336d11460306421b136f215f451c0253817b14d3916e7c0fe`.

P0 risks: ref mistaken for authority, stale authorization, ambiguous assignment, admission inferred from seed, RLS/grant bypass. P1 risks: retry uniqueness, role setup, canonical reference/replay/timestamp parsing. Real PostgreSQL/concurrency/RLS deployment, credentials, production DDL/data, actual role provisioning/records, JWT network/HTTP, World/seed/economics/Worker/Clock and Gate B are NOT_RUN. A may report IMPLEMENTED_UNVERIFIED only.
