# World API Supabase Minimum-Privilege Probe

## Scope

```text
date = 2026-09-12
target project ref = vimksjrhaxdpnkvgsavz
credential source = one-time user input through non-echoing process stdin
publishable key present for zero-row probe = true
service-role/password read = false
DDL/DML = false
user rows requested = false
```

This is a connectivity observation, not V09.1 staging evidence, a live schema
inventory, a deployment approval, or proof of an RLS policy.

## Observations

Three HTTPS GET requests were made, each exactly once and with no retry:

| Endpoint                                                   | HTTP | TLS verification | Interpretation                                                                    |
| ---------------------------------------------------------- | ---: | ---------------: | --------------------------------------------------------------------------------- |
| `/auth/v1/health`                                          |  401 |             PASS | Project gateway was reachable and required an API key.                            |
| `/rest/v1/`                                                |  401 |             PASS | REST gateway was reachable and required an API key.                               |
| `/rest/v1/profiles?select=account_status&limit=0`           |  200 |             PASS | The publishable role addressed `public.profiles.account_status` for zero-row read. |

The authenticated response reported `application/json` and
`Content-Range: */*`. Its body was not read. No response body, key, JWT,
database URL, or user data was recorded.

The approved process environment contained none of
`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, or `VITE_SUPABASE_ANON_KEY`. The workspace
contained only `.env.example` files, so no local runtime key was available.
The user subsequently supplied a publishable key directly. It was passed once
through a waiting process's non-echoing standard input, used only in memory for
the zero-row request, cleared after the request, and never written to a command
line, environment file, source file, report, or commit. Per the authorized
boundary, no key was recovered from a front-end bundle, history, credential
store, or unrelated configuration.

## Capability result

```text
unauthenticated gateway reachability = OBSERVED
publishable REST authentication = OBSERVED
profiles select account_status limit=0 = HTTP_200_ZERO_ROW
other live tables/RPCs/schemas = NOT_PROBED
live RLS/grant behavior = NOT_ESTABLISHED
```

The HTTP 200 result establishes only that PostgREST accepted the named table,
column, and zero-row SELECT under the publishable role. It does not establish
that any user row is visible, which RLS predicate would apply to a row-bearing
request, or that another table or RPC is accessible. No broader live capability
claim is permitted.
