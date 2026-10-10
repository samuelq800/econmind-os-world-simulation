# PR132 — runner-owned PostgreSQL loopback topology repair

Date: 2026-10-10. Status: `IMPLEMENTED_UNVERIFIED`, independent review pending.
This is a nondeployable supplemental-CI source repair, not a native PASS, full
check, gate, admission, activation, or production approval.

## Immutable scope

| Identity            | Value                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------- |
| Isolated branch     | `codex/c-pr132-pg-loopback-fix-20261010`                                                |
| Checkout            | `/Users/samuel/Documents/econclub/.econmind-worktrees/c-pr132-pg-loopback-fix-20261010` |
| Base SHA            | `261983dc053f2522b6627864dc7025cdca8a27dc`                                              |
| Base tree           | `cabe6cbb861a2913ddee87a827ade78703bb0305`                                              |
| Implementation SHA  | `7b848c9f23ef6e63e0c8223536e42233b006cb13`                                              |
| Implementation tree | `35be6935827637bee360a004182d79a3c98cbfe0`                                              |

The implementation changes only the supplemental workflow, its receipt helper,
and a new cluster helper/pure test. This report is a separate documentation
commit; the enclosing tip/tree and report digest are supplied in the handoff.
Root's current integration checkout was not edited. No push, PR update, workflow
dispatch/rerun, merge, global database operation, production access or gate
promotion was performed. Existing risk/gate classifications are not downgraded.

## Failed execution retained, not relabeled

[Run 38055193920](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/38055193920)
ran the PR merge checkout `fd454b14cd74692e046f5e049df9ec7be0db855c`, tree
`cabe6cbb861a2913ddee87a827ade78703bb0305`. That tree equals the base tree above;
the actual checkout SHA is not the metadata head SHA.

Inputs, install, the original 11 pure tests, both builds, and all four strict
configs succeeded on that old checkout. The unchanged D environment guard
succeeded, but native `beforeAll` failed: `inet_server_addr()` yielded
`172.18.0.2`, while the existing assertion requires `127.0.0.1`. All seven D
tests were skipped (JSON: success false, passed 0, failed 0, pending 7, total 7).
The final receipt correctly says `FAIL_OR_NOT_RUN`. Published Docker ports did
not make the server's own interface a loopback interface.

Original artifact `start-ready-candidate-38055193920-1`, ID `11670199310`, was
downloaded once, without rerunning the workflow. Exact bytes are retained at:

`/Users/samuel/Documents/econclub/artifacts/c-pr132-pg-loopback-repair-20261010.r5GxBV/failed-run-38055193920/`

| Original evidence                | SHA-256                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| `receipt.json`                   | `4e87edf14c37f44302eb58be464f8fa3a2e4678c7eb43025fd8f0bf5a683679d` |
| `native-d.log`                   | `fc2f5ef68ee90b26072592e97fbb3476f724e92ccbe70fd99e428f529c7272bd` |
| `native-d-results.json`          | `25eddb4066402381a67cc077b8fd37b8246235dda7745524f01c533631a587f1` |
| `native-d-environment-guard.log` | `ebe03926c913355d3ff57e2582962ef66ce92a6e38ec2b55102796f7767a917f` |

The external verification manifest records every downloaded file digest,
including the original build/strict logs. Those original successful checks are
historical evidence only, not rerun results for this new candidate.

## Repair and ownership controls

- Replace the Docker service with `runs-on: ubuntu-24.04` and the preinstalled
  `/usr/lib/postgresql/16/bin` tools, requiring exactly PostgreSQL `16.15`.
  Check Ubuntu version, non-root execution, root-owned non-writable binaries and
  their parent directories; no package install, PATH fallback or global service
  startup. Capture exact tool versions plus actual runner image metadata.
- Require canonical, current-UID-owned, non-group/other-writable `RUNNER_TEMP`
  and its exact `start-ready-candidate` evidence directory. Create a fresh
  random direct child `start-ready-d-pg16-*` with root/data mode `0700`; never
  chmod the shared temp directory or reuse a data directory.
- Reserve a mode-`0600`, exclusive ownership marker before `initdb` or startup.
  Run `initdb` with the disposable postgres role, UTF8 and trust auth, then
  `pg_ctl` with only `listen_addresses=127.0.0.1`, port `5432`, and no Unix
  socket. `createdb` uses explicit fixed loopback/port/role/database arguments.
  PostgreSQL child processes receive only fixed PATH/locale variables, not
  inherited connection/service/credential overrides or caller-supplied DSNs.
- Run all four strict configs before the startup attempt. Native D runs only
  after startup success, with the existing exact canonical DSN and fingerprint.
  Its environment guard, server-address assertion, freshness/schema checks,
  frozen six-migration prefix and all seven assertions remain byte-identical.
- Always invoke cleanup after successful input initialization, including native
  or startup failure. Before stopping, validate marker, canonical root/data,
  owner/mode, and the owned postmaster PID file's data directory/port. Only
  `pg_ctl -D <validated own data> -m fast -w -t 30 stop` is permitted. Missing
  marker/PID records no owned running server; invalid identity refuses control.
  A stop failure propagates. No process search, arbitrary PID kill, database
  drop, directory deletion or shared-cluster mutation is used.
- Keep startup, server and shutdown logs plus ownership metadata in the artifact.
  Final receipt hashes them and requires BOTH startup and stop step outcomes to
  succeed in addition to the original six outcomes and exact seven native PASS
  counts. A native success cannot override cleanup failure/skipping.

The fixed tools source is the
[runner inventory at 8197087](https://github.com/actions/runner-images/blob/8197087fc536320d1441203fdb5da9ae1b44b863/images/ubuntu/Ubuntu2404-Readme.md)
(image `20261004.327.1`, PG `16.15`), whose
[installer](https://github.com/actions/runner-images/blob/8197087fc536320d1441203fdb5da9ae1b44b863/images/ubuntu/scripts/build/install-postgresql.sh)
uses the PGDG packages. The hosted image patch is NOT immutable merely because
the OS label is fixed: actual image metadata is retained, tool-version drift
fails closed, and availability still requires real CI validation. No arbitrary
newer PG version is accepted. Configuration/control semantics follow the
[PG16 connection documentation](https://www.postgresql.org/docs/16/runtime-config-connection.html)
and [pg_ctl documentation](https://www.postgresql.org/docs/16/app-pg-ctl.html).

## Verification on the exact implementation bytes

Environment: Darwin/arm64, Node `24.20.0` from
`/Users/samuel/.cache/npm/_npx/460b723c8ad28bd7/node_modules/node/bin/node`.
Dependency tools were read through a node_modules symlink to the existing
`a-start-ready-audit-20261010` checkout; no install or lockfile update.

| Check                                                           | Result                                             |
| --------------------------------------------------------------- | -------------------------------------------------- |
| Node pure tests: original CI file + new PG controls             | exit 0; 20 PASS, 0 fail, 0 skipped                 |
| Focused ESLint, three helper/test files                         | exit 0                                             |
| Prettier, four implementation files                             | exit 0                                             |
| actionlint `1.7.12 -shellcheck= -pyflakes=`                     | exit 0; optional external analyzers disabled       |
| Node syntax, three helper/test files                            | exit 0                                             |
| YAML parse + `bash -n` on all 10 run scripts                    | exit 0                                             |
| `git diff --check`                                              | exit 0                                             |
| Original guard, native D test, original 11-test CI file vs base | byte-identical (`git diff --exit-code`, exit 0)    |
| New runner-owned PG startup/stop and native D seven cases       | `NOT_RUN`                                          |
| New-candidate build/four strict checks                          | `NOT_RUN`; prior checkout PASS retained separately |
| Full check, F native, production/deploy/activation/Gate B       | `NOT_RUN`                                          |

Pure controls cover fixed command arguments, environment isolation, canonical
ownership and symlink/foreign rejection, private directories, partial-init and
post-start failure cleanup identity, retry refusal, stop failure propagation,
and fail-closed final outcomes. Injected pure command/PID fixtures do not run a
database, spoof a server address or count as native evidence.

This host has neither the required Linux PG16 binary path nor Docker. No
macOS/global PG substitute was started. A first local YAML validation command
used Ruby `filter_map`, unavailable in the installed Ruby 2.6, and failed before
validation; the compatible `map.compact` command then checked all scripts
successfully. That tooling correction did not change workflow source.

Raw local logs, commands, exit codes, source-file hashes and all original
artifact hashes are bound by:

`/Users/samuel/Documents/econclub/artifacts/c-pr132-pg-loopback-repair-20261010.r5GxBV/VERIFICATION.json`

SHA-256: `ba1eff98cce9456437b3519eaf9f2ac4a3979660bf50b26d3fd8a54ac3ef6f24`.

## Stop boundary

Freeze this delta for non-implementer review before any PR update. The next
authorized integration/CI run must establish actual runner/tool availability,
real loopback server identity, seven executed native PASS cases, and successful
owned cleanup on its actual checkout SHA/tree. No such result is claimed here.
Independent approval, PR mutation, rerun/dispatch, merge and gate promotion are
not performed by this implementation handoff.
