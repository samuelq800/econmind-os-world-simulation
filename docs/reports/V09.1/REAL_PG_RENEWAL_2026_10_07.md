# V09.1 — scoped native PostgreSQL renewal evidence

Date: 2026-10-07 Asia/Shanghai. Result: **4 PASS / 0 FAIL / 0 SKIP**,
one file, one invocation, exit 0, no timeout or retry. This is renewal/fencing
supplement evidence, not full V09 verification, populated economic conservation,
production RLS, formal World startup, deployment or Gate B approval.

## Exact tested source

Candidate `b72c4260d402ff1822b686984ebb30dd9f8d1d67`, tree
`efbc16619a954f870ba419c1eef0252bf6684264`, parent
`811b96fa7087ef4cd031be6044f55fb67f65916b`, main source lineage
`e3a3b98527090203b5f9241a4d652aa024b394b3`.

Test: `tests/world-core/world-writer-lease-renewal-postgres.test.ts`, SHA-256
`3cb596fe8a9371130ddfd497d4ec00b7e2c38258da47e347fed7b15ef30ca2ff`.
The source and its execution plan are byte-identical in the integration
candidate; integrating them does not mean a new native run occurred.

## Scope and actual target

Root scope `O_F_RENEWAL_FIXED_NATIVE_20261007_ONCE` permitted one exclusively
owned fresh local generation. PostgreSQL 16.15; Node 24.20.0; pnpm 12.3.4;
cleared environment with `LC_ALL=C`. Exact loopback `127.0.0.1:61210`, no Unix
sockets; database `econmind_v09_f_renewal_fixed_20261007`, system identifier
`7693855908061445004`. Pre-mutation READ ONLY evidence records empty application
relations/roles and sole observer. Post-readback verifies the same generation
and exact installed 22-artifact migration provenance. No shared Supabase,
old failed cluster, S02, production or user/team configuration was accessed.

Command:

```text
node node_modules/vitest/vitest.mjs run tests/world-core/world-writer-lease-renewal-postgres.test.ts
```

Four completed cases verify active renewal with unchanged holder/fence/acquired
time, renewed-lease competitor rejection, backward/equal/shorter expiry
rejection and expired-holder takeovers with stale-fence rejection. Assertions
retain exact SQL errors, timestamps, raw rows and non-lease fact equality.

Final observed leases retain microsecond SQL strings: CURRENT A fence 1,
renewed 0.500000s and expiry 3.500000s; COMPETITOR and INVALID A fence 1,
renewed 0.250000s and expiry 2.250000s; TAKEOVER B fence 3, acquired/renewed
2.000000s and expiry 3.000000s. All are relative to 2026-09-11T00:00:00Z.
Four synthetic heads remain WorldVersion/event sequence 0; command/event/
inventory/financial/receipt/outbox facts remain empty. This is not evidence
about populated financial/material conservation.

Owned PG/test processes were closed, pid/listener absence and retained 0700
directories recorded; no drop/reset/delete after execution. Source remained
clean and all 37 source/artifact/dependency pins unchanged.

## Evidence identity and preserved failure

Frozen producer package: `artifacts/f-renewal-fixed-native-once-20261007.cpVRK0`
under the Control Tower workspace, not a file copied into this repository.

| Artifact                 | SHA-256                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| HANDOFF.md               | d32461504af8b0fa9d1df52416db91bb9d2082bcc85459433efbc43d420a052c |
| CHECKS.json              | f6d1446b7264b3f95911c2177c52888ceeea698e1e8707f1641ee59da4f739d1 |
| TEST_RAW_OUTPUT.txt      | f1ef8b1f074f804339f00d23fd9f691a1b0d149fcf44d4b52e0f0b0e0a954a18 |
| POST_READONLY_FACTS.json | 224c5c59ee6335bc1cd9a283176da3ee1d4a9e85120b76c4612bcaba7c16b9e8 |

Root matched these four hashes and read the handoff, raw runner output and
read-only facts. B previously independently accepted the original test
preparation and the one-line observer SQL correction; the latter report hash
is `2cfab459bb167bef58117704e079a1397bb8a97e081250f737c25847accef9e2`.
Those preparation reviews alone were not execution or merge permission.

The original native invocation at 811 remains **0 PASS / 4 FAIL / 0 SKIP**,
caused by `ORDER BY row_text COLLATE "C"` alias lookup in the raw-facts observer.
Its files and failed stopped generation are preserved. The corrected expression
is `ORDER BY to_jsonb(fact)::text COLLATE "C"`; other assertions are unchanged.
This successful fresh generation does not overwrite or relabel that failure.

## Remaining boundaries

No real player session, HTTP/UI command loop, populated settlement, process
kill/server restart, acknowledgement-unknown, official 70-country opening or
Worker/Clock startup is established. Six-role live workflow acceptance remains
separate. `status/progress.json` and formal gates are untouched.
