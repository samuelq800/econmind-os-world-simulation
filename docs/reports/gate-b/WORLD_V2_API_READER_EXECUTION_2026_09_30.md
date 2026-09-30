# World V2 API reader execution and readback — 2026-09-30

## Status

**APPLIED_BUT_UNVERIFIED.**

This record does not classify the reader release as PASS, EVIDENCED, or safe
to extend. It preserves the database fact after a cancellation race and blocks
retry, compensation, full-data policy publication, server credential
provisioning, API enablement, World/OpeningSeed creation, worker start, and
simulation activation.

## Immutable inputs

- World source reviewed by B: 701784a3d9c3c8add16baf9c59b51c54182671fe;
  PR #18 merged as b9433abcf56a78873676ee37cacfc2b5435a353e.
- Main-site publisher reviewed by B: e2ecc9d8c0fd328c451c70cb8cfce6539098ffcc;
  PR #75 merged as b84c4e7a620dfdc81f01118643b77468600d96cd.
- Controlled workflow run: 36654533470.

The run's request and evidence-verification steps completed successfully, but
a cancellation request landed during final artifact handling. GitHub therefore
reports the run as cancelled and the uploaded terminal artifact as
WORLD_V2_RELEASE_UNKNOWN. Neither result means that the management request was
not dispatched. No retry was made.

## Production readback

A subsequent read-only management query found ledger row 20:

| Field | Value |
| --- | --- |
| migration | 0020_world_v2_official_country_reader |
| artifact SHA-256 | 083e06aca86763e4bc32a34347c1a86b26aa910f3c6a191b9393021347211618 |
| source artifact commit | f3413bae195b75e80d28d6afa314ca0e394bdfbc |
| release order | 20 |

Both reader roles are NOLOGIN, NOINHERIT, NOBYPASSRLS, and NOSUPERUSER. The
two candidate tables have exactly the two expected SELECT policies, scoped to
BALANCED_2026_09_28_V1; no table-level privileges were observed and exactly
eight approved column-level SELECT privileges were observed.

The strict initial verifier expected only the credentialless API-login role to
belong to world_v2_api_reader. Actual membership also contains the PostgreSQL
control-plane role postgres:

| member | grantor | admin | inherit | set |
| --- | --- | --- | --- | --- |
| postgres | supabase_admin | true | false | false |
| world_v2_api_login | postgres | false | false | true |

postgres is not a superuser, but it can log in, has BYPASSRLS, can create
roles, and inherits privileges. This record does not treat it as harmless or
as a browser/API path. B must explicitly evaluate whether this precise
PostgreSQL 16 bootstrap/control-plane membership is an admissible exception.

## Required recovery path

Only a new immutable **read-only** audit candidate may change this status. It
must model the exact two allowed memberships above, reject any other member or
option change, and recheck ledger, role attributes, schema/table/column ACLs,
and every policy on the two candidate tables. It must not replay migration
0020, revoke the control-plane membership, or issue compensating DDL.
