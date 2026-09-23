# V09 disposable PostgreSQL evidence tool — mainline acceptance

**Date:** 2026-09-23
**Candidate:** E `1081eb2f13580eae4e442dd61dd302613e6d7897`.

B's independent reviews found and then closed two Major target-binding defects before integration. First, `pg-connection-string` could let URL `?host`/`?port` override an approved loopback authority; the tool now rejects query and fragment before constructing a client. Second, an omitted URL port could let process `PGPORT` override the policy's default-5432 fingerprint; the tool now requires an explicit numeric port in range 1–65535 and binds that same value to the target fingerprint. B verified the real `pg.Client.connectionParameters` parse without connecting, including malicious query, missing-port-with-`PGPORT=6432`, explicit IPv4 and IPv6 cases. The fixed tip's narrow conclusion was P0=0, Major=0 for nonproduction merge.

The candidate combined without conflict with `origin/main` `b495158`. On the combined tree, pinned Node 24.20.0/pnpm 12.3.4 focused guard tests (1 file, 7 tests), full workspace typecheck/Core build and staged diff check passed. E's fixed-tip evidence separately records targeted lint, architecture/pattern/boundary and policy checks.

This merge accepts an evidence **tool**, not an executed staging result. No database was connected here. The historical dedicated-staging TLS `CRASH_CONNECTION_LOSS` remains FAIL; dedicated staging, Supabase RLS/grant and real browser E2E are still not proven by this tool. Gate B remains PENDING. No production Supabase, original EconMind main-site, schema, migration or Gate/status file was changed.
