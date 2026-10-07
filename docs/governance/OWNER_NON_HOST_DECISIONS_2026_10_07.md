# Owner non-host decisions — 2026-10-07

This is a scoped record of actual human decisions, not a new proposal, a
production administrator credential, a seed admission or an activation receipt.
The human attached the original decision document and instructed **就此执行**.
Root read the whole original and verified its bytes. The later D02 implementation
request requires reuse of existing real approvals; it does not revoke these
choices or approve unknown financial values.

## Immutable inputs

- [Original Owner document](owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md):
  SHA256 `57bfdec38a9a400991cb26362a99d33d7a81c8e6258c03460185e51501fb5ac5`,
  36,506 bytes, identical to the human attachment.
- [Actual decision receipt](owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json):
  SHA256 `2c06c4bd1157a2d245143190c4d17b0499b5d09f42159a414846d0f9bcb8d99e`.
  It records the direct instruction, exact adopted subset and explicit exclusions.
- [D02 implementation attachment bytes](owner-inputs/2026-10-07/D02_IMPLEMENTATION_REQUEST.original-bytes.json):
  concatenate `source_bytes_base64_parts` and decode Base64 to recover exactly
  23,122 bytes with SHA256
  `5d07a94e087f545dc3c1948a321ccd74c16aecb4483f5266de59085186c7d29b`.
  The original has no terminal newline; this archive preserves that fact.
- Official source package remains `BALANCED_2026_09_28_V1`, 70 countries,
  population `14712146434`; CHECKSUMS SHA256
  `88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315`.
- The selected E proposal's original SHA256 is
  `15383e28d523bad7ff4fdbe14e141c7a46f21072c9bd4a81faa5a5acc378c7cb`.
  Approval covers only the explicitly adopted subset, not the whole proposal.

## Adopted scope and crosswalk

| ID       | Actual decision                                                                                                                                                                                                  | Still not supplied or authorized                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| D01      | All B is GOV Treasury Deposit at CB; equal CB liability, one claim, no T+C duplicate pools                                                                                                                       | Unknown currency/FX is not 1; B is not automatically spendable cash                                           |
| D02      | R is BANK asset and equal CB reserve liability; only source-supported CB assets; complete t0 net worth A−L, once only, negative allowed                                                                          | Complete actual CB holdings/positions/currencies/counterparties; missing is not approved zero                 |
| D03      | Scenario GCU→Core GCU exactly 1:1, five existing entities per country, 619 positive OP-title/risk stocks and 221 retained zero source cells, H HOUSEHOLDS/D OP, opening-only L=H+D and E=R+A−L                   | LC=GCU is not approved; raw L/E tokens stay unchanged; other E terms not blanket approved                     |
| D04      | Explicit genesis and operating constraints in original §5 for facilities, minerals, water, power, labour and social services                                                                                     | Unbuilt remains unbuilt; actual outputs, jobs, services, source/operating gaps cannot be fabricated           |
| D05      | OWNER_EXCLUDED / DEFERRED                                                                                                                                                                                        | Production host, paid resources, DNS/HTTPS binding, production migration/seed/startup                         |
| D06      | One isolated TEST_ONLY World, first two eligible canonical countries, six independent Offices each, real verified Owner/admin for an actual seat, 24-hour real TTL and revocation; all autonomous policy NPC OFF | Actual administrator identity and lawful grant publisher; no production test seats; SYSTEM cannot sign policy |
| TIME_360 | Existing 10× Clock unchanged; annual interest denominator is 360 simulation days                                                                                                                                 | No new clock; hydrologic months use the original §5.3 rule, not an assumed 30-day month                       |

Historical audit wording **D06 bank reconciliation** maps by content to current
**D03 §4.5**, not current D06 identity/seat/NPC permission. Historical audit
statuses and originals are retained; their numbering cannot transfer approval
between these two subjects.

For D04, the actual document controls details: nested mineral exclusivity,
source-backed ownership, constrained water priorities and Gregorian monthly
day counts, physical storage SOC genesis, constrained electricity priorities,
source-backed jobs/skills/wages and deterministic population conservation.
Capacity is not actual employment/enrolment/patients/occupied housing, and
source adoption is not proof of operational readiness.

## Evidence stages

The receipt's stage is **DECISION_ADOPTED** only. At recording time,
`source_reconciled`, `materialized`, `verified_in_isolation`, `production_bound`
and `production_verified` are false. No formal WorldId was certified by this
record. These are deliberate stage distinctions, not missing approval of the
already adopted rules.

A runtime loader must be server-owned, fix the actual source/receipt identity,
verify coverage and semantics, and reject client-supplied approval or TEST_ONLY
substitutes. A correctly hashed copy by itself cannot grant authority, complete
unknown positions, publish admission or remove the schema admission veto.
Executable loaders, economic posting and authorization changes remain P0 and
require independent review of their fixed candidates.

## Source-record verification and impact

Root verified all eight original DOCX files against
`requirements/source_manifest.json`; the seven Master/Office originals and
Constitution all matched, and `requirements.docx` matched Constitution. This
was a bounded hash check, not a repeated source audit or new rendered review.
Root also verified the portable Owner document and receipt byte-for-byte
against the supplied originals, and decoded the D02 archive byte-for-byte.

This source-record package adds documentation/data provenance only. It installs
no registry, schema, grant, financial state, routes or start mechanism; it does
not mutate old-site public/auth/storage or formal gate/status files. Its P2
metadata-only acceptance uses the human's explicit safe-reviewed-mainline
authorization after focused provenance, format and whitespace checks. That
acceptance does not approve a future P0 consumer.
