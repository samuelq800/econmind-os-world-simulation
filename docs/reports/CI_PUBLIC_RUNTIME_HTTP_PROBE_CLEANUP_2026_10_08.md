# CI ordinary lifecycle HTTP probe cleanup

Status: **IMPLEMENTED_UNVERIFIED**; independent E/F review **PENDING**.
This is a test-only forward fix, not a runtime release or a self-approval.

## Authority and scope

- Base: `9f7ed3547a4f04903a0c2108105d68edda65cc1b`.
- Base tree: `8a45ca2406bec7645b7b766181ee6e2568f48e65`.
- Branch: `codex/a-lifecycle-loopback-cleanup-20261008`.
- Owned checkout: `/Users/samuel/Documents/econclub/.econmind-worktrees/a-lifecycle-http-cleanup`.
- Changed scope: the original public lifecycle test, its dedicated HTTP helper,
  a focused helper test, a dedicated strict test tsconfig and this report only.
- Final commit/tree/diff/file hashes are fixed in external `HANDOFF.md` and
  `FREEZE.json` under
  `/Users/samuel/Documents/econclub/artifacts/a-lifecycle-http-cleanup-20261008.ZiReVN`.

Root supplied provider run `37772932185`, attempt 1: **FAIL**, 2698 PASS,
139 SKIP, zero assertion failures, one uncaught `EINVAL setTypeOfService`.
The supplied stack enters Node 24 `net:911` from builtin Undici `writeH1`;
Vitest attributed it to this suite's final unexpected-runtime-signal test.
That provider FAIL is retained. This local run neither rewrites it nor proves
that the entire vendor/kernel error mechanism has been diagnosed.

## Source mechanism and minimum fix

At the fixed base, `waitForHttp` and `endpointIsReachable` call `fetch` and return
from `response.ok` without consuming or cancelling the response body. Their
callers then terminate their owned runtime processes/groups, including SIGKILL
in the final test. Readiness had no per-request deadline; health used a 250 ms
abort. Thus these test probes can return before their body/transport lifecycle
finishes, with transport owned by the shared builtin fetch/Undici pool. This is
a source-visible cleanup defect and a plausible exposure path, not a reproduced
causal proof of the provider's exact `EINVAL`.

The dedicated test helper uses native `node:http`, hardcoded `127.0.0.1`, the
two existing endpoint paths, `agent:false`, `Connection:close` and no-store.
It resumes/drains every response, including non-2xx responses, and reports the
existing 2xx success condition only after body end. An absolute 250 ms deadline
covers connection, headers and body; errors, aborted bodies and timeouts reject
the operation. Every terminal path clears the deadline, destroys the owned
response/request and waits for its socket close before settling when allocated.
There is no shared Undici transport in these two test probes.

The readiness retry interval and overall 15-second deadline are unchanged.
Health connection failures still become false at its existing caller. No
uncaught exception/unhandled rejection is globally intercepted or ignored.
No vendor patch, production runtime/auth/economy change, global Vitest config,
toolchain/lockfile change, test deletion or new skip was introduced.

Strictly checking the previously unchecked original test exposed existing
unchecked-index/tuple-inference errors. The only extra original-test changes
are erased non-null assertions for fixed regex groups/the known first service
and a readonly tuple annotation. They do not change executable assertions,
status/exit-code expectations, process capture/cleanup or test cases.

## Actual focused checks

Environment: cleared `env -i`, local, no database URL/credentials; pinned Node
24.20.0 and pnpm 12.3.4. Third-party libraries reused read-only; Core, Worker
and API builds belong to this checkout. Only disposable owned loopback servers
and child processes were started. No production database, preview, old website,
Root/other-agent working tree, deployment, push or merge was touched.

| Check                                              | Actual result                                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Own Core/Worker/API builds                         | exit 0 each                                                                               |
| Initial focused strict tsc                         | exit 2: existing original-test indexed/tuple errors and test library DOM type requirement |
| Final focused strict tsc                           | exit 0, without skipLibCheck or relaxed strict options                                    |
| Focused ESLint                                     | exit 0                                                                                    |
| Final focused Prettier check                       | exit 0                                                                                    |
| Original complete lifecycle suite                  | 20 PASS / 0 FAIL / 0 SKIP                                                                 |
| Dedicated HTTP transport suite                     | 8 PASS / 0 FAIL / 0 SKIP                                                                  |
| Combined focused run                               | 28 PASS; exit 0; no unhandled error observed                                              |
| Original assertion/test-definition byte comparison | identical, exit 0                                                                         |
| Safe environment                                   | PASS, databaseConfigured=false, NOT_LINKED, mutation=false                                |
| git diff --check                                   | exit 0                                                                                    |

Original coverage retained: both signals for all three public services;
descendant/process-group and listener release; repeated/mixed signal shutdown
idempotency; delayed shutdown completion; parent loss before initialization;
failed compiler exit; unexpected runtime signal exit 137 and port rebind.

New controls: successful chunked body must finish before resolution; 302/503
rejection drains and closes; ordinary connection refusal rejects; absolute
timeouts before headers and during body reject and close; aborted 200 body
rejects rather than yielding success; sequential requests leave no connection
across owned server shutdown. Server-side socket closure is asserted before
fixture cleanup, not merely produced by cleanup.

The external TypeScript AST comparison extracts original `expect` call source
bytes and test-definition title/explicit-timeout source bytes from the fixed
base and candidate. Both contain 44 expectation call nodes and five parameterized
test definitions, with identical SHA256:
`26eee93754ace381dd3eb61a842e3481bc4ea64bd049dc41e1090bf513165586`.
That evidence preserves the assertions literally; it is not a claim that the
entire edited file is byte-identical.

Retained actual evidence under the external artifact directory:

- `focused-tests.json`, SHA256
  `c5a4e398b803043a4594c1c102ae8cb34892ba86762b1385f13827c4928d0ed3`.
- `original-assertions-comparison.json`, SHA256
  `e9407b3c524bf0a1cd0ea44f84f740d8857c64a248e185d221b33289c71f298c`.
- `compare-original-assertions.mjs`, reproducible source for the byte comparison.

No 13-minute/full-suite rerun was performed. Final provider CI, Linux/kernel
behavior and independent E/F review remain **NOT_RUN/PENDING**. The local green
run does not prove that the provider failure is closed. Root may arrange the
independent narrow review and one final CI run against its integrated candidate.

STOP after frozen handoff. No P0 VERIFIED, owner acceptance or next-package
continuation is awarded here.
