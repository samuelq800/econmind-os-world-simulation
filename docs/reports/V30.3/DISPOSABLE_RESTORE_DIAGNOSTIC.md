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

After strengthening the comparison from selected columns to complete sorted
World-head and immutable Command-submission rows, the branch-push
[Actions run 35968646448](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/35968646448)
was `SUCCESS` at exact SHA `9bc9c9cd32ca4a48515c97e5c14a86b9673d1be8`.
The full-row pre-backup and restored snapshot SHA-256 both equalled
`55097844361254b28957790e2c15a2254e5a4f6c0163bf1b1e06b4852af751af`;
the later source hash was different. The custom-format backup SHA-256 was
`fc3efa3475059ff1c7191c10d61649466915c01f7527d1a7f482af3672e3e5ec`.
Diagnostic RPO/RTO were 142/249 ms. It still did not replay an Event or
Posting or establish a production capacity target.

The first combined workflow run `35965419504` was **FAIL**, not PASS: its separate official
`pnpm check` job failed one V29 Worker replay pinned-hash assertion
(`tests/support/v29-worker-delivery-driver.test.ts:566`, expected local hash
`44214d63…`, received Linux hash `d43d7e1f…`). The V09/V10 disposable
PostgreSQL job passed. F owns the targeted replay fix; no failed check is
waived or silently relabeled. At the time of that run, this branch was not
merged to main and the new standalone workflow was branch-only; it could not
be manually dispatched until registered on the default branch. The existing
registered V09 workflow was extended **on this isolated branch only** to
obtain the diagnostic run; that temporary V09 workflow change was excluded
from the mainline integration.
The cross-timezone V29 pinned-hash defect was subsequently fixed on main,
and the unmodified official check plus disposable V09/V10 jobs both passed on
main SHA `2b086a2` in
[run 35968394633](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/35968394633).
That green run is a different SHA from these V30 restore probes and does not
itself validate V30.3.

After selective mainline integration, the manual standalone workflow
[run 35969859719](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/35969859719)
was `SUCCESS` on exact main SHA
`5def465b92fef733867b207e42ad9ed0cdd343b9`. It applied the 16
checked-in migrations and restored one complete World-head row and one
immutable Command-submission row. The backup-point and restored complete-row
SHA-256 were both
`4fd62beac8c3e218774e51e10783283cfa64950fc4a8fc643c2093ce6c2ad904`;
the later source-only state differed. The custom backup SHA-256 was
`7a130d7440a11f19ad639afd4dbd56073d3779972f65f1dbc457ac4e8d84b411`.
Diagnostic RPO/RTO were 170/285 ms for this tiny CI fixture only. The run
uploaded its redacted evidence artifact. It did not run the candidate-wide
official check or the missing staging/Worker recovery scenarios.
