# Gate B real PostgreSQL CI candidate

**Recorded:** 2026-09-14  
**Scope:** disposable GitHub Actions PostgreSQL service only

The V09/V10 PostgreSQL workflow is enabled for the current immutable candidate
branch. Its runner starts `postgres:16-alpine` as a disposable CI service and
sets only `V09_TEST_DATABASE_URL` to a loopback connection. The test
environment guard rejects `DATABASE_URL` and `WORLD_DATABASE_URL`, requires a
disposable fingerprint, and reports production access as false.

The workflow validates migrations, runs the existing real-PostgreSQL recovery
and writer-lease/fencing suite, runs the V10.4 Treasury-GCU atomic delivery
acceptance suite against that same disposable target, and builds Core and
Worker. Each result must be recorded from its exact GitHub Actions run before
it can count as evidence.

## Observed disposable CI evidence

The preceding V09-only candidate was exercised by GitHub Actions run
[`34844035170`](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/34844035170)
against source commit `aef8138579571531d5b13186ba7e90f32ec2c42e`.
The run completed successfully on 2026-09-14. Its disposable PostgreSQL
service completed migration validation, `pnpm test:v09:postgres`, Core and
Worker builds, the V09 authorization-cutoff check, and the V09 atomic-recovery
real-PostgreSQL suite. Expected fail-closed lease, fencing, version, and
append-only violations were observed as rejected assertions.

The service was removed with the CI job. No Supabase, staging, or production
target was contacted.

## Boundary of this evidence

This run is partial V09 real-PostgreSQL evidence only. The current candidate
adds the V10.4 delivery suite, but its result is not yet recorded and must not
be inferred from the prior run. Even after that scoped run, it would not
demonstrate the remaining V10 delivery concurrency or controlled
crash-recovery campaign, and it supplies no browser E2E or RLS/grant negative
evidence. It does not authorize Gate B.
