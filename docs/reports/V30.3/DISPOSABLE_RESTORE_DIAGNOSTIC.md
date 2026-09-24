# V30.3 disposable PostgreSQL restore diagnostic

Status: `PREPARATION_ONLY_NOT_V30_3_ACCEPTANCE`.

The isolated branch `codex/v30-disposable-restore-preparation` ran at exact
SHA `9c6dbb10c7996bf606ce3b831d7e0b58a82a28c2` in
[Actions run 35965419504](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/35965419504).
Its disposable `postgres:16-alpine` restore job **passed**. The job applied
all 16 checked-in migrations to a fresh CI-only database, inserted one World
head and immutable Command submission, took a real PostgreSQL custom-format
backup, committed a later source-only World/Command, and restored the backup
into a second fresh database. The restored durable snapshot hash was exactly
the pre-backup hash `c499b2bf03ac491a6ec65dfdf600a8ca521bdbf27420ed1a23f90e8beccce9a5`;
the later source hash differed. One World and one Command row were recovered.
The backup SHA-256 was
`95ddb2f512893b1b9f369d2e6d657e666fc3c14af0c0b214d6d0bf3ff6b1d443`.
The redacted JSON artifact was uploaded under the exact run/SHA.

The reported diagnostic windows were RPO 174 ms, RTO 283 ms and restore
operation 273 ms. These are **only timings of this tiny disposable fixture**,
not capacity targets or production/staging RPO/RTO evidence. Event/posting
replay, Worker crash/fencing, real-world backup retention and shared-main-site
impact were `NOT_RUN`.

A second, single-purpose isolated workflow ran after adding a branch-push
trigger: [Actions run 35968057913](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/35968057913)
at exact branch SHA `7c8a97fd34e1297540ca7ad6ba7ad99d2001039b` was
`SUCCESS`. The disposable restore job again applied 16 migrations and matched
the same pre-backup/restored snapshot hash while the later source hash
differed. Its backup SHA was
`07a80a009e9aca1c21f5e220570011ff93ed0aeb793820f6c8e338f1f4f630ab`;
diagnostic RPO/RTO were 163/275 ms. This workflow did **not** run the
repository-wide `pnpm check` and therefore does not change the separate
failure below.

The overall workflow run was **FAIL**, not PASS: its separate official
`pnpm check` job failed one V29 Worker replay pinned-hash assertion
(`tests/support/v29-worker-delivery-driver.test.ts:566`, expected local hash
`44214d63…`, received Linux hash `d43d7e1f…`). The V09/V10 disposable
PostgreSQL job passed. F owns the targeted replay fix; no failed check is
waived or silently relabeled. This branch is not merged to main. The new
standalone workflow is branch-only and cannot be manually dispatched until
registered on the default branch; the existing registered V09 workflow was
extended **on this isolated branch only** to obtain the diagnostic run.
