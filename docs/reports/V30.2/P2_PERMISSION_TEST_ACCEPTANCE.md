# V30.2 permission-negative tests — scoped P2 acceptance

`OWNER_FAST_TRACK_ACCEPTED` applies only to test/preparation commit `c17672d`,
cherry-picked from E's exact candidate `b79240b` onto mainline base
`c9fe246`. This integrates reusable disposable-PGlite negative tests, not
formal V30.2 security/RLS acceptance, Gate B, or production database access.

The added paths are one test and one preparation document. No identity,
authorization, SQL runtime, schema, migration, RLS policy, service role,
production data or original website changed. The tests exercise existing
application/query guards against wrong subject, inactive entitlement and
cross World/Country/Office visibility, plus Worker transaction-cutoff denial.
They do **not** prove native PostgreSQL role/grant/RLS behavior.

On combined mainline, the focused V30.2 test passed 3/3 as part of a 10/10
two-file run with F's Worker replay test; targeted ESLint and Prettier passed.
E reported API/Worker typecheck, architecture boundaries 34/34, secret scan
and diff check on the original candidate. Native PostgreSQL, real roles,
isolated staging, browser E2E, full repository check, independent formal
V30.2 review and Gate B are `NOT_RUN`.
