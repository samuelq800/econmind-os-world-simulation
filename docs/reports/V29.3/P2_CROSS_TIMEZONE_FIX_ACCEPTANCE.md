# V29 replay timestamp normalization — scoped P2 fix

`OWNER_FAST_TRACK_ACCEPTED` applies only to test-support commit `0c89324`,
cherry-picked from F's exact fix `3d6f655` on mainline base `9ddfa46`.
The owner authorized fast, safe mainline test-infrastructure work. No Core,
Worker, API, schema, migration, production or original website code changed.

The prior official check on branch SHA `9c6dbb1` in
[Actions run 35965419504](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/35965419504)
was `FAIL`: one V29 replay golden hash differed between the local Asia/Shanghai
environment and Linux UTC. Repeating the focused test locally with `TZ=UTC`
reproduced the **exact** CI hash. The durable receipt timestamp was read as
session-dependent `timestamptz::text`. The fix reads the same persisted instant
as a validated, fixed-precision UTC string before hashing; it neither changes
the economic transaction nor merely replaces the expected hash. A new test
proves the raw database sessions have different offsets while their durable
replay hashes agree.

On combined mainline, the focused Worker test passed 8/8 under both `TZ=UTC`
and `TZ=Asia/Shanghai`, and dedicated strict TypeScript passed. F reported
targeted lint, format, boundary, secret and diff checks on its source
candidate. The failed whole-workflow run remains failed in the record; an
unmodified official `pnpm check` on the fixed mainline SHA is required before
calling the later combined candidate green. Formal V29.3 remains `PLANNED`.
