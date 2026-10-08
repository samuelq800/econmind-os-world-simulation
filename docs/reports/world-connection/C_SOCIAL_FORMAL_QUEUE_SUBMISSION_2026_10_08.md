# C Social formal queue/submission SQL compatibility — narrow review package

Status: IMPLEMENTED_UNVERIFIED, independent P0 narrow review required. No merge or activation authority is claimed.

## Immutable starting point and ownership

- Repository: econmind-os-world-simulation.
- Base main commit: bcfc66787631a13aa5093df42954070c2d7dd66b.
- Dedicated checkout: /Users/samuel/Documents/econclub/.econmind-worktrees/c-social-formal-queue-submission.
- Branch: codex/c-social-formal-queue-submission.
- C owns the Social candidate source and its direct tests; G owns the dispatcher, which is unchanged.
- Fixed candidate head/tree/diff digest and complete check outputs are recorded after commit in the external C_SOCIAL_FORMAL_QUEUE_SUBMISSION_2026_10_08/FREEZE.json and CHECKS.json.

## Actual defect and bounded repair

The existing source selected command_type from world_v2.command_queue. Formal migration 0003 creates no such column; 0010 adds only claim_fencing_token, and 0012 tightens lease-bound claim transitions. The immutable type is on command_submission.

The queue query now selects s.command_type from an inner join on BOTH world_id and command_id. It filters the exact requested q world/command and uses FOR SHARE OF q. The current submission already holds FOR UPDATE; original-plan FOR SHARE remains before lease, head and queue reads. No new lock order, schema column, permission bypass, authority fallback or write path is introduced. The type comparison, authority kind, CLAIMED state, holder, fence and available SimTime guards are unchanged.

The existing SQL protocol test routes the joined query to its queue-result branch rather than mistakenly treating it as a submission-only query. All original 31 assertions remain. This fixture is not the proof of schema compatibility.

## Direct formal-migration evidence

14 new checks execute unmodified migrations 0001 through 0012 in a fresh owned PostgreSQL 16.15 cluster, with TCP disabled and a private Unix socket. Connection parameters are constructed from the owned temporary socket, not caller DSNs/environment credentials. The database is econmind_v09_c_social_schema. Existing PostgresSqlDatabase supplies real BEGIN/ROLLBACK, without retry.

- Schema introspection proves command_type only on submission, and claim_fencing_token on queue.
- PLAN and MATCH with same-world immutable original plan pass actual submission/lease/head/queue SQL and reach the reader exactly once.
- Exact lock query order and requested world/command parameters are asserted; queue is read once with FOR SHARE OF q.
- Wrong current world, ID and missing submission refuse before reader.
- A stored type inconsistent with the command fingerprint refuses; actual UPDATE of type is rejected by the immutable submission trigger.
- Automatic original-plan absence, wrong world, wrong ID, changed type, fingerprint, country and due day refuse before reader, with explicit domain causes and real ROLLED_BACK outcome.
- The reader deliberately returns MISSING_OPERATING_STATE. Successful SQL ends in genuine NOT_READY; no synthetic admitted genesis, operating state, official reader or automatic grant is supplied.
- Original current-authorization/revocation, fake-proof, missing automatic grant, fence, scope, Core conservation/replay and noncash draft tests remain unchanged.

Native checks are explicitly enabled with C_SOCIAL_FORMAL_SCHEMA_NATIVE=1. When disabled, their status is NOT_RUN, never PASS. This does not skip or weaken an old test. C_SOCIAL_TEST_POSTGRES_BIN may identify an installed local binary directory; default on this host is /opt/homebrew/bin. No server preview, application listener or production Clock is started.

## Verification and preserved failures

Toolchain: Node 24.20.0, frozen workspace dependencies (pnpm lock 12.3.4); no dependency or lockfile changes. Own compiled Core matches Worker module identity.

Final checks PASS:

- Native opt-in direct test selection: 45/45 (31 retained + 14 native formal-shape checks), zero skipped.
- Core build.
- Worker build.
- Focused strict source/test typecheck; skipLibCheck remains absent.
- Scoped lint and source/test formatting; diff whitespace check.

Historical evidence is retained, not rewritten:

1. Before production fix, embedded formal-schema regression: PLAN/MATCH fail with absent command_type; 12 new negatives pass, 31 old tests intentionally unselected by name filter.
2. Intermediate embedded run passes assertions but strict types fail: test storedType inferred branded type plus PGlite published declarations missing Emscripten. The final test uses native pg and an explicit string annotation; no library-check suppression or dependency addition.
3. Initial native run has six assertion failures because real PostgresSqlDatabase wraps the domain error in PostgresTransactionError. Assertions now inspect the preserved cause AND confirmed ROLLED_BACK outcome.
4. Next native run has one expected-message mismatch for the actual Core wrong-family refusal. Final assertions use the precise legitimate cause for each original-plan fault.
5. Final native run and final build/types/lint/format are clean; exact-head recheck is recorded externally.

The temporary clusters are stopped and their owned temporary directories removed after each native run. No existing database/data/schema is deleted. No production database, migration publication, data upload, admission, dispatcher, preview, Clock, 420, CI, push or merge was performed. Native concurrency, actual Social economic settlement/durable events, full integration and production activation remain NOT_RUN.

## Independent narrow-review focus and stop boundary

Review ONLY this new compatibility slice, not previously approved packages:

- Exact join identity on both keys; current submission locked first.
- Existing claim/current authority/fence/availability/once behavior unchanged.
- Automatic original-plan binding remains authoritative durable canonical submission.
- Actual formal migrations, no queue extension or disabled trigger; native negative causes cannot pass merely because of an unrelated SQL error.
- Missing operating state remains NOT_READY; SQL compatibility is not admission.
- Scope limited to source, direct tests and this report.

C implementation does not self-award VERIFIED. Root receives the immutable SHA and external evidence for independent review. STOP after handoff; G retains the sole dispatcher.
