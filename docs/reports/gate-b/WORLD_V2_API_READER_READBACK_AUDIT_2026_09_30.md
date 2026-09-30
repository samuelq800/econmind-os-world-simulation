# World V2 API reader readback audit — 2026-09-30

## Narrow result

**EVIDENCED — `SERVER_ONLY_INACTIVE_CANDIDATE_READ` boundary only.**

The previously cancelled 0020 publication run remains historically
`WORLD_V2_RELEASE_UNKNOWN`. This later, independently reviewed audit is a
separate, single read-only management query. It verified the already-applied
0020 reader boundary without replaying any migration or changing production
state.

It does **not** prove that a data API is deployed, that a server credential has
been provisioned, that an API/CORS route is enabled, that the 34-dataset
full-data reader is published, or that a World, OpeningSeed, worker, team,
office, or simulation is active.

## Reviewed and merged audit chain

| Component                     | Reviewed commit                            | Main merge                                 | CI evidence                                           |
| ----------------------------- | ------------------------------------------ | ------------------------------------------ | ----------------------------------------------------- |
| World read-only renderer      | `d3884d81435816cedd6f8a0a46510dfd49c1ba5e` | `cb026300267c3ce7a0c749c9ec4d9557c27ba870` | source `36657099187`; native PostgreSQL `36657099242` |
| Main-site dispatcher/verifier | `988dd279ce5fd0f90626094d2c77f3c5df86f9f9` | `4458712184363ef510e4d3a18f0e24141a34220e` | publisher `36657141899`; full CI `36657146738`        |

B independently approved this exact pair for merge and one read-only audit.
The renderer reads the production `world_v2.schema_release` row for 0020; it
does not echo the expected ledger fields as source literals. Its disposable
PostgreSQL test proves the audit output changes when the ledger row changes.

## Production audit evidence

- Workflow run: `36657427073` (successful); job `109704673747`.
- Immutable main-site workflow SHA: `4458712184363ef510e4d3a18f0e24141a34220e`.
- The one Management API request and strict verification both succeeded.
- The UNKNOWN-recording and fail-closed steps were skipped because complete
  evidence was available.

The verifier accepted exactly one ledger entry:

| Field                  | Verified value                                                     |
| ---------------------- | ------------------------------------------------------------------ |
| migration              | `0020_world_v2_official_country_reader`                            |
| artifact SHA-256       | `083e06aca86763e4bc32a34347c1a86b26aa910f3c6a191b9393021347211618` |
| source artifact commit | `f3413bae195b75e80d28d6afa314ca0e394bdfbc`                         |
| release order          | `20`                                                               |

It also verified both reader roles as NOLOGIN, NOINHERIT, NOBYPASSRLS, and
NOSUPERUSER; the exact two expected reader memberships (including the reviewed
PostgreSQL control-plane bootstrap tuple); `public` and `world_v2` schema
usage only; eight approved column-level SELECT grants; no table-level
privileges; and exactly two selected-source SELECT policies on the candidate
tables.

## Explicitly unchanged

- No 0020 retry, DDL, compensation, or membership revocation.
- No 0021 full-data reader publication.
- No server credential provisioning, API enablement, or CORS activation.
- No World/OpeningSeed/worker/simulation or user/team/office activation.
- No Gate B, full data API, or public-client readiness claim.
