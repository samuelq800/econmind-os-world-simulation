# World API Supabase Minimum-Privilege Probe

## Scope

```text
date = 2026-09-12
target project ref = vimksjrhaxdpnkvgsavz
credential source = approved runtime environment only
publishable/anon key present = false
service-role/password read = false
DDL/DML = false
user rows requested = false
```

This is a connectivity observation, not V09.1 staging evidence, a live schema
inventory, a deployment approval, or proof of an RLS policy.

## Observations

Exactly two unauthenticated HTTPS GET requests were made, with no retry:

| Endpoint          | HTTP | TLS verification | Interpretation                                         |
| ----------------- | ---: | ---------------: | ------------------------------------------------------ |
| `/auth/v1/health` |  401 |             PASS | Project gateway was reachable and required an API key. |
| `/rest/v1/`       |  401 |             PASS | REST gateway was reachable and required an API key.    |

No response body, key, JWT, database URL, or user data was recorded.

The approved process environment contained none of
`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, or `VITE_SUPABASE_ANON_KEY`. The workspace
contained only `.env.example` files, so no local runtime key was available.
Per the authorized boundary, no key was recovered from a front-end bundle,
history, credential store, or unrelated configuration.

## Capability result

```text
unauthenticated gateway reachability = OBSERVED
publishable/anon REST authentication = NOT_RUN
profiles select account_status limit=0 = NOT_RUN
live table/RPC/schema inventory = NOT_ESTABLISHED
live RLS/grant behavior = NOT_ESTABLISHED
```

The sole blocker for the authorized zero-row schema request is runtime injection
of an approved publishable/anon key. Until that exists, no live table, RPC,
schema, grant, or RLS capability claim is permitted.
