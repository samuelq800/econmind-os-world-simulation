# Gate B real PostgreSQL CI candidate

**Recorded:** 2026-09-14  
**Scope:** disposable GitHub Actions PostgreSQL service only

The V09 PostgreSQL workflow is enabled for the current immutable candidate
branch. Its runner starts `postgres:16-alpine` as a disposable CI service and
sets only `V09_TEST_DATABASE_URL` to a loopback connection. The test
environment guard rejects `DATABASE_URL` and `WORLD_DATABASE_URL`, requires a
disposable fingerprint, and reports production access as false.

The workflow validates migrations, runs the existing real-PostgreSQL recovery
and writer-lease/fencing suite, and builds Core and Worker. Its result must be
recorded from the exact GitHub Actions run before it can count as evidence.

This candidate does not contact Supabase, staging, or production. It does not
by itself provide the remaining V10 delivery concurrency/crash campaign or
browser/RLS/grant negatives, and it does not authorize Gate B.
