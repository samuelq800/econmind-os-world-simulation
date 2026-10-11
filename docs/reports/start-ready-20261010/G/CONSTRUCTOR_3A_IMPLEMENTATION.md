# G constructor 3A implementation — SOURCE_ONLY / UNMOUNTED / HOLD

Status: **IMPLEMENTED_UNVERIFIED**. Implementation review is pending. This is the
Root-authorized 3A mechanical slice only. It does not authorize 3B, 4A, 4B or 5,
formal construction, admission, consumer startup, deployment or Gate B.

## Immutable candidate and authority

- Base: `eb033a4d9e717a9cb9149e450900b606c3457403`; tree `13a60f04c1a9c54eb8ffbaca8b469bf25b293dce`.
- Candidate: `a2d59abfc768cc93744a7a2b82af514a7f12c84b`; tree `23efaedff642e6b364f02151c347216c76c2e247`.
- Branch: `codex/g-constructor-3a-20261010`.
- Worktree: `/Users/samuel/Documents/econclub/.econmind-worktrees/g-constructor-3a-20261010`.
- Design: `243d534667006ce0daee28043ec2ff8e1b20b317`,
  `CONSTRUCTOR_SLICES_3_4_DESIGN.md`, SHA256
  `ab0de31b381eebb16ad4d0d2717e053e9fc21a5e905db221542c1492227a7405`.
- F design-only decision: **APPROVED_WITH_EXACT_BOUNDARIES / DESIGN_ONLY**.
  The full review path and SHA256 are in the evidence JSON. No implementation
  approval is claimed.

The 12 changed product/test/config files and their byte counts and SHA256 values
are frozen in [CONSTRUCTOR_3A_EVIDENCE.json](./CONSTRUCTOR_3A_EVIDENCE.json).
The code commit contains nine product/package files and three test/config files.
Only G evidence is added in the following evidence commit.

## Implemented behavior

The Worker owns a module-private production registry. The identity mechanism
checks exact host, World, route, intake pool, source pool, clock and generation;
copies, proxies, a different binding, retired requests and stopped generations
fail. Isolated registry instances can exercise this mechanism but cannot mint a
token accepted by the actual production binder. The package subpath does not
export the registry class or a positive issuer.

There is no actual source, clock or actor constructor in this slice.
`ServerCommandHostBinding = never`; the public factory defaults to null and
stays HOLD even when a JavaScript caller supplies a forged binding or getters.
It performs no environment discovery, pool allocation, SQL, clock work or
consumer startup. No production request token is issued. The API composition
uses the original null internal handler: the three exact internal routes return
503 NOT_CONNECTED before body/JWT/SQL work, while aliases reject. No entry or
configuration mounts this composition.

The existing manual-runtime return type and local/CI guards remain. A separate
production identity branch cannot become positive without a real private
issuer; production preflight remains false. The existing source-before-claim
promise now registers with the actual Worker completion observer when one is
active. No SQL/economic behavior was added.

A single request resource scope follows the real request budget signal and
stops new work on abort. Closing joins API work, then actual Worker/source
promises to a fixed point, retires the Worker completion frame, ends each owned
pool once, and verifies pending counts are zero. A pending connect is joined,
and its late client is discarded before pool end. Release/end failures preserve
cleanup uncertainty. There is no query replay. This is resource-frame retirement;
formal production-token retirement cannot be demonstrated while issuance is
unavailable.

The resource-only pool helper selects exact office, financial, recovery or
current-seat inventories. Office and financial intake kinds are distinct;
intake/source/reader maxima are 2+2+1 = 5. Recovery/current-seat allocate only a
reader. Selected connection strings and route pairing validate before any
allocation; each actual Pool is registered immediately, including partial
construction paths. Connect timeout respects the remaining server budget.
The existing two-pool helper remains available. The operation callback is
resource plumbing and provides no source or production authority.

## Build provenance and actual checks

Node **24.20.0**, pnpm **12.3.4**, pinned PATH
`/private/tmp/econmind-control-tower-toolchain.451x0O`. Offline frozen install
passed (161 reused, zero downloads; lockfile unchanged); its earlier raw install
transcript is not included. The app worktree helper first failed because it
resolved the surrounding repository; the World repository git worktree command
created this isolated branch without resetting other work.

Before the first build all three dist directories were absent. Build order was
Core → Worker → API, all exit 0. After the final application changes, all three
were rebuilt before candidate tests. The complete **432-file pre-test manifest**
is [pre-test-dist-manifest.json](./constructor-3a-checks/pre-test-dist-manifest.json).
Its aggregate is
`152f35a662161bf299e2d2a99d27349f5b6ef8c144d50a48793c98523f0154b1`
(SHA256 of compact UTF-8 JSON of the ordered file array, no trailing newline).
Every dist entry matched again after the candidate checks. The subsequent
test-only callback arity/formatting repair changed no application/package bytes.

| Actual check                                         | Result                  | Evidence scope                                             |
| ---------------------------------------------------- | ----------------------- | ---------------------------------------------------------- |
| Focused constructor/transport/completion/prior-delta | 61 tests, 4 files PASS  | Includes 29 constructor cases and 2 added completion cases |
| Existing local/CI manual/durable regressions         | 110 tests, 4 files PASS | Existing PGlite/local/CI authority only                    |
| Boundary/foundation suite                            | 40 tests, 3 files PASS  | Earlier in this WT; final static scans rerun               |
| New strict TypeScript and prior G config             | exit 0                  | New config has skipLibCheck=false                          |
| Scoped ESLint and Prettier on all 12 files           | exit 0                  | Final arity/formatting repair checked                      |
| Final authoritative and boundary scans               | exit 0                  | Core 91 / all 334; boundaries 339                          |
| Final repository secret check                        | exit 0                  | 2463 files at candidate phase                              |
| Safe environment                                     | exit 0                  | NOT_LINKED, databaseConfigured=false                       |
| Core → Worker → API builds                           | exit 0                  | Captured before candidate tests                            |

The selected distinct suites total **211 tests**; retries and intermediate runs
are not added to that total. Commands, actual exit codes and available raw output
for all attempts are retained in the evidence JSON and
[check-transcript.txt](./constructor-3a-checks/check-transcript.txt).

Initial failures are preserved: the negative missing-end cast needed an explicit
unknown cast; unused HOLD parameters failed lint; a root-test package import
could not resolve the new Worker subpath and was changed to its compiled relative
export; a new test supplied an argument to a zero-argument mock; its follow-up
formatting check failed and was corrected. The final applicable strict,
focused, lint and format checks passed. None was reclassified as a pass without
a real rerun. Intermediate 51/59 results are historical, not extra acceptance.

## Limits and handoff

Actual pg Pool instances in the inventory tests stayed at totalCount=0; no
connection or SQL was attempted. Controlled finite late-connect/resource ports
test join/release/end ordering. These do not establish native PostgreSQL
cancellation, hard finite closure of arbitrary never-settling drivers, or real
5s/10s timer acceptance. The supported contract still requires actual operations
to settle; no detached success is returned to evade that requirement.

Full/full-420, native SQL/driver, Linux topology, workerd, CI, formal source
admission/preflight, startup, real producer/clock/actor integration, E actual
authorization SQL, D lease/source/once-FINAL/projection and Gate B are **NOT_RUN**
or outside this slice. Six Office workflows are not thereby complete; Industry
still has no command family. E/D prerequisites and B source correction require
their separate review/integration. No grants, schema, migration, production,
deployment, status/gate, map, public/auth/storage, push or merge operation was
performed.

The previous native stall root cause remains **NOT_ESTABLISHED**. The older
packet's missing pre-run dist provenance remains unresolved; this new manifest
does not retroactively certify that packet.

Root receives these immutable pins for a non-implementer review. G stops here.
