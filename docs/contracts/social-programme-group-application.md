# Social programme group applications

`CORE_SOCIAL_LABOUR_PROGRAMME_APPLY_V1` records an application to an existing
relocation or return-to-work programme. It implements the `Applied` step of the
original U0549–U0554 pipeline for the U0933/U0934 programme records. It does not
advance to `Verified`, `Approved`, `Scheduled` or `Paid`.

The authorised Social actor selects an existing whole E03 labour aggregate by
country, location, skill and employment status. The server reads its current
positive count and the exact programme command fingerprint. The request cannot
supply a count, source authority, qualification or approval. The UI displays the
actual group count and stages the command in the existing review/confirmation
flow. This is a group application, not a record of individual signatures.

The existing intake, unique FIFO consumer, source commit guard, atomic receipt,
audit event and authorised current read routes carry the command. The application
changes only `programmeApplications`; labour, population, jobs, programme capacity,
funds and inventories remain unchanged. A group larger than the proposed programme
capacity can be recorded as an application; it has no capacity reservation or
approval. Later selection and eligibility rules must decide any admission.

An exact duplicate restores its recorded result. A second application for the same
programme and canonical group is rejected. After a labour-state change, another
group with the same programme/location/skill is rejected because aggregate data
cannot prove that its individuals do not overlap the prior group. Existing
applications remain readable, and an exact original request remains recoverable.
No individual mapping is invented.

## Installation and read contract

The append-only proposal `database/proposals/postwar-social-application-prefix.sql`
has an adjacent manifest with exact predecessor files, function bodies and ACLs.
It replaces six prefix/read functions while preserving their OIDs/owner/ACL, and
adds the application effect guard and version probe. The runtime requires version
`postwar-social-labour-application-v1` before APPLY intake, preparation or application
reads. An absent contract is unavailable, not an empty application list.

The existing Social runtime endpoint serves the bounded dataset
`social-labour-programme-applications` with current seat/JWT/head checks and the
same current-source binding. Row count, context and payload bytes are bounded.
Application rows include actual `personCount` and the classification
`APPLICATION_ONLY_NOT_ELIGIBILITY_APPROVAL_FUNDING_OR_SERVICE`.

The source is the already admitted world/population state plus the authenticated
Social command. No separate external application permit or fabricated individual
attestation is introduced. Scope adoption, install catalogue integration and native
same-version verification remain separate release steps.

## Targeted checks

- `tests/world-core/social-labour-programme-application.test.ts`: exact count,
  duplicate/conflict, changed membership, source/command integrity, replay.
- `tests/world-core/finance-budget-native-mixed-prefix.test.ts`: CREATE → PLAN →
  MATCH → APPLY replay, unchanged labour and no extra financial encumbrance.
- `tests/world-core/postwar-social-application-prefix.test.ts`: embedded PostgreSQL
  function upgrade, OID/ACL, predecessor drift/repeat rejection, effect guards.
- `tests/world-core/social-service-create-intake-contract.test.ts`: Social command
  shape and rejection of client count/approval/source additions.
- `tests/world-api/postwar-social-programmes.test.ts`: genuine read runtime and
  current JWT/seat required; unavailable is not empty.
- `tests/world-web/social-labour-programme.test.ts`: bounded current DTOs, foreign
  rejection, real-count request builder and staged group form.

These are targeted Core, embedded SQL and offline UI/transport checks. They are
not evidence of production installation or a full native Node/browser APPLY chain.
The eligibility, admission and payment steps still need their own implemented
contracts and acceptance; this slice does not declare U0933/U0934 complete.
