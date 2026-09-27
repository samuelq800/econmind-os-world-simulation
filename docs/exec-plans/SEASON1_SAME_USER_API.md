# Season 1 same-user API — adjacent read-only preparation

Base `dec89b473a692f3252bc63d4b2d7df0e1e60e45d`, isolated branch
`codex/season1-same-user-api`. User/Control Tower explicitly authorized this
adjacent read-only connection slice while the recorded package gate remains
unchanged. This is not self-approved P0, a database release or gate promotion.

Own only the new API route, opt-in API runtime binding, dedicated tests and
runbook. Reuse the B-approved `season1-lobby-supabase-reader` unchanged. Do not
edit E's release files, schema, original main site, UI, Core/Worker, or the
local-nonproduction bridge. Preserve others' changes.

GET `/v1/season1/my-team` is off by default. Explicit enable plus all three
dedicated Supabase settings are required; partial/privileged configuration
fails before listen. Startup, health and readiness never probe the network.
The endpoint accepts only an ephemeral bearer session, no query/body arguments
or target IDs; forwards only that session to the fixed no-argument
`get_world_preseason_my_team` RPC. Supabase determines identity. No World,
country, Office or command authority can be inferred from lobby data.

Origin policy: server-to-server only, reject Origin and OPTIONS; no browser
CORS grant in this slice. Bounded timeout, global non-identity rate limit and
in-flight limit. No token persistence, token-keyed cache, shared response cache,
request logging or upstream error reflection. Successful authorized responses
retain the approved full team/membership/members DTO, per Control Tower's
explicit clarification. Privacy redaction applies to errors, logs and denied
responses; do not silently remove authorized member data.

Verification: HTTP against injected fetch only; default/partial configuration,
same-session forwarding for separate requests, no query/body/target overrides,
missing/invalid/duplicate bearer, origin/method denial, sanitized upstream
failure/contract error, timeout and resource bounds, healthy default runtime.
Reader/runtime compatibility tests, build/typecheck, lint/format and boundary
checks. Freeze SHA for B and Control Tower merge. Real session/network and
deployment are `LIVE_NOT_RUN`; tests must not be described as live database
connection evidence.

## Candidate verification evidence

- Core, Worker and API builds: PASS using Node 24.20.0 / pnpm 12.3.4.
- Route, approved reader and runtime lifecycle regressions: 25/25 PASS across
  three test files; upstream fetch is injected, with no live Supabase calls.
- Dedicated test typecheck, scoped ESLint, six-file Prettier check, repository
  boundaries, repository secret scan and `git diff --check`: PASS.
- Independent Review B: PENDING against the frozen candidate commit.
- CI, deployment and real authenticated session verification: NOT_RUN.
- `LIVE_NOT_RUN`; no package/gate promotion or database-release claim.
