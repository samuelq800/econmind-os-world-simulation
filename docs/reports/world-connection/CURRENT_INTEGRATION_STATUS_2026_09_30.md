# World V2 data connections — current integration record

Snapshot: 2026-09-30. Repository: `samuelq800/econmind-os-world-simulation`.
Observed World main: `d32eb2a232415429ea95975ecbdc7afa159ec8cf`.
This is a factual delivery index, not a migration instruction or a replacement
for `status/progress.json`. No gate, ADR or economic rule is approved here.

## Scope and data identity

The owner requested **all information data**, not only country summaries.
The selected baseline remains `BALANCED_2026_09_28_V1`: 70 countries,
14,712,146,434 people, 87 source artifacts including `CHECKSUMS.json`, and
34 structured JSON datasets. The separate map package contains 203 files:
160 images (90 PNG + 70 SVG) and 43 supporting files, including 140
country-specific assets. These are different counts, not interchangeable.
Selection hashes remain in [`status/world-data-selection.json`](../../../status/world-data-selection.json).

Coverage includes climate/hazards, minerals/deposits, infrastructure/facilities,
geography, finance, stocks, production, water, power, population services,
employment, transport and proposed trade/licensing records. See
[C's complete source coverage](C_OFFICIAL_WORLD_COMPLETE_COVERAGE_REPORT.md).
Proposals, assumptions and validation metadata retain their source meanings;
they must not be displayed as executed contracts, active permits or simulation
events. Source decimal values and provenance are preserved, not fabricated.

## Separate delivery states

| Layer                     | Evidence at this snapshot                                                                                                     | Not established                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Source preservation       | Production readback: 87 balanced artifacts in 278 immutable rows, 70 profiles, matching population and integrity guard        | All map images stored as business-table rows                                          |
| Offline mapping           | PR #20 merged at `d019ea1`; deterministic formatting fix #23 at `833fc03`; all 34 datasets and 203 map identities covered     | All source fields adopted as authoritative opening state                              |
| Country / full-source API | #16 at `65bb72c`, #22 at `94b9e28`; fixed server whitelist, hash checks, lossless decimals and bounded pagination             | A deployed production host, usable server credential or successful live browser fetch |
| Full-source DB permission | #30 merged at `ede72d1`; main-site publisher #77/#78 merged and run `36672349466` verified 0021 production readback           | API process deployment, dedicated LOGIN credential, browser connection or Gate B      |
| Public CORS               | #26 at `e36bcd3`; exact-origin opt-in for approved public read routes only                                                    | Credentialed/private/Command route exposure                                           |
| Immersive page            | #17 at `0777505`, #28 at `ed0ad12`, status clarification #31 at `a5cc630`; country binding and 34-dataset Source intel drawer | Live economic state, prices, settlement or durable receipt execution                  |
| Map files                 | Separate pinned manifest and query catalogue; existing static page maps retained                                              | Catalogue `publicUrl` is still null; all 203 published URLs have not been evidenced   |
| Opening admission         | #21 at `ef2b785`; independent source/map/country checks and transactional readback code                                       | Valid official OpeningSeed: six semantic gaps remain in the reviewed handoff          |
| CI baseline               | #32 at `d8a1b4a`; exact candidate `d355bb6`, run `36661049743` SUCCESS and B APPROVED_FOR_MERGE                               | API staging/production deployment or Gate B approval                                  |

PR references above are in the World repository. Short merge IDs identify
integration points, not independent test targets. Older implementation reports
retain their original pending-review wording; this index records subsequent
bounded merge decisions without rewriting those historical reports.

## Database evidence and limits

The approved production target is project `vimksjrhaxdpnkvgsavz`, limited to
`world_v2`. The [balanced-package readback](../gate-b/WORLD_V2_BALANCED_CANDIDATE_PRODUCTION_READBACK_2026_09_30.md)
at `2026-09-30T00:24:15Z` recorded 19 migrations, 24 base tables, and zero
`world_head` / `opening_seed` rows. These are timestamped observations, not a
claim of a new live query by this documentation task.

The subsequent [0020 read-only audit](../gate-b/WORLD_V2_API_READER_READBACK_AUDIT_2026_09_30.md)
verified the applied reader roles, exact memberships, column privileges,
policies and real 0020 ledger row. Main-site run `36657427073` succeeded on
`4458712184363ef510e4d3a18f0e24141a34220e`; this run status was rechecked for
this update. It used a read-only query, not a migration retry. The earlier
cancelled publication run `36654533470` remains historically UNKNOWN.

PR #30 (0021 full-source reader) subsequently merged to World main at
`ede72d1adc97272c56ec0733227d72c2b8e89207`. The main-site controlled
publisher #77 and its strict preflight correction #78 merged to main at
`2470c5062d97ed2fb12a9db0e21a8651f58880f5` and
`4b58a28bfea93cdca33bd2e79782bf048376adfe`, respectively. Its first
authorized run `36668095506` stopped before writing 0021 because the
preflight incorrectly expected unchunked storage roots; that run remains
UNKNOWN for publication, not a failed migration. The separately authorized
single retry [run `36672349466`](https://github.com/samuelq800/econmind-os/actions/runs/36672349466)
on the exact #78 main head succeeded: read-only preflight, one atomic 0021
write, and post-write verifier all passed. The verifier reported
`WORLD_V2_API_FULL_READER_RELEASE_VERIFIED`, with the exact 20-to-21 ledger
transition, 2-to-3 policies, 142 preserved source-storage rows (23 roots and
119 chunks), 34 reconstructed dataset digests, and unchanged source/bundle
state. The non-secret [main-site release report](https://github.com/samuelq800/econmind-os/blob/31d37dc8f700bec4e4cbbd6f29e9cf52e74babdc/docs/WORLD_V2_0021_FULL_READER_RELEASE_2026_09_30.md)
holds the pinned run and artifact checksums. This is **database publication
evidence only**: the bundle remains `IMPLEMENTED_UNVERIFIED_CANDIDATE` with
`activation_allowed=false`; no production API process, dedicated LOGIN,
browser fetch, OpeningSeed, worker or Gate B is established. Legacy `public`,
`auth`, `storage` and the original website remain out of scope.

## Next connection sequence and ownership

1. **E / A:** select and authorize an actual server host and deploy the already
   merged `apps/world-api` process with a dedicated non-admin PostgreSQL LOGIN
   credential, granted only membership in `world_v2_api_reader`. Repository
   inspection found `apps/world-api` build/start scripts but no production API
   deployment workflow, host manifest or confirmed API base URL. The server
   needs `ECONMIND_ENV=production`, `WORLD_DATABASE_URL` (remote TLS),
   `WORLD_DATABASE_FINGERPRINT=world-v2-production`,
   `WORLD_API_DB_LOGIN_ROLE`, `WORLD_API_DB_READER_ROLE=world_v2_api_reader`,
   `WORLD_API_OFFICIAL_COUNTRY_DB_ENABLED=true`, and
   `WORLD_API_ALL_DATA_ENABLED=true`. Set
   `WORLD_API_OFFICIAL_PUBLIC_ORIGINS=https://samuelq800.github.io` for the
   verified Pages browser origin and an approved bind host/port. Keep the
   database credential server-only; no LOGIN creation or activation is
   authorized by this status record. Prove host identity, least privileges,
   `/readyz` and bounded dataset reads before assigning a browser API URL.
2. **D / E:** verify the actual page-to-API connection across all dataset
   categories, paging, country/region association, geography and empty/error
   states. Verify map publication URLs against their pinned identities.
   Merged frontend wiring is not a substitute for this deployed readback.
3. **F:** finish the separate scrolling/map-fit repair, PR #33 (OPEN at its
   earlier snapshot), preserving the authoritative UI and D's data wiring. Review and
   publish separately from database permissions; do not claim it is already live.
4. **C / F:** preserve the complete mapping and six opening-semantic gaps in
   [the opening handoff](F_OFFICIAL_OPENING_WORKER_HANDOFF.md). Resolve currency,
   Treasury/Central-Bank separation and ownership/authority semantics before
   any authoritative seed conversion. Do not invent missing values or start a
   simulation merely to demonstrate connected pages.

Lobby entry and user/team/office membership assignment are explicitly deferred
by the owner. They must not block public source-data integration and must not
be fabricated. Existing UI, maps and engines should be reused, not rebuilt.

## Checks and governance

This update changes documentation only. Its verification is changed-file
formatting, local link-target existence and `git diff --check`; it does not
rerun the economic suites or perform another production readback. The PR #32 CI
result is tied only to `d355bb6557492aa0d5a9edde3d408a115a85a99f`.
B's decision used manual exact-diff review plus exact-SHA CI; an incomplete
security-plugin scan is not recorded as PASS.

[Gate B remains PENDING](../gate-b/CURRENT_GATE_B_STATUS.md). The formal ledger's
older V09/ADR wording still needs separate governance reconciliation; this
documentation refresh does not silently promote V09–V30 or overwrite earlier
FAIL / NOT_RUN / UNKNOWN evidence.
