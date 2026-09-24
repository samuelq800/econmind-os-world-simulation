# Local authenticated PostgreSQL bridge — reviewed preparation merge

B independently reviewed immutable E candidate
`a16c598610c6b148c379dd0b33bfedd7ec5127df` against base
`63e9d362ac6f3644939e40a712c16f362238f839` and returned
`APPROVED_FOR_NONPRODUCTION_PREPARATION_MERGE`, P0=0, MAJOR=0. Its single
commit was cherry-picked as `8e4e5dc`; the source and integrated commits have
the same stable patch ID `100668b18b180f9680e5f80922841bb7b8e1850e`.
No original EconMind site, Core, Worker, schema, migration, production or
shared Supabase target was changed.

The local/CI-only loopback bridge uses existing authenticated handlers to
verify a signed test JWT before a server-only subject is attached to exactly
two allowed PostgreSQL read/receipt queries. The executor checks subject
placement before connecting and sets `request.jwt.claim.sub` only inside a
short transaction for RLS. The native test uses a randomly keyed HMAC test
JWT, disposable PostgreSQL 16 and least-privilege synthetic API role. E's
[run 35972838463](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/35972838463)
passed the native vertical test at the exact source SHA. On the integrated
commit, focused local tests passed 2/2 with the native test correctly skipped
without a disposable URL; world-api build, targeted ESLint and Prettier passed.
A merged-main native CI run is separate evidence.

Buyer Finance approval reading and the Worker's durable command port remain
fixtures. Production JWT verification/key management, deployed API role
provisioning, trusted gateway wiring, real durable Command execution, two-
Country/two-Office browser Command→UNKNOWN→receipt→projection refresh and
final independent Gate B review remain `MISSING` or `NOT_RUN`. The new native
vertical does not separately test multi-active-scope and unknown-SQL denial;
the code rejects both, but those negative tests remain a focused follow-up.
This merge is not production RLS, V30.3 recovery acceptance or Gate B approval.
