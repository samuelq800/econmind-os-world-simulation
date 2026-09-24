# V27→V28 shared-Core input — independently reviewed preparation merge

Review B issued `APPROVED_FOR_NONPRODUCTION_PREPARATION_MERGE` for immutable
P0 source candidate `4b675158c4cd9c516b8649faf5002c0b3db19ab0`, with
P0=0 and MAJOR=0 within the pure Core/Worker preparation scope. Earlier
ancestors `0cdace3`, `e906764` and `ec72b19` were also narrowly reviewed.
The source branch was conflict-free against main and merged at `f99e6e7`.
This is **not** formal V27/V28 verification, World initialization, Worker
dispatch, an ADR decision, Gate B, or production authorization.

The merged functions remain inert: `initializationAuthorized=false` and
`orchestratorSelected=false`; no second World state or runtime route is
created. Constitution R002's separate thin World/Season orchestrator duties
remain untouched. C's separately integrated manifest tool now calculates the
same structural World/country-set fingerprint for the same inputs, but both
its external source configuration hash and configuration-owner authority
remain unverified; a structural `MATCH` cannot authorize generation.

On merged mainline, the Core build and Worker build passed, seven related
focused files passed 67/67, and architecture/boundary checks passed 34/34.
The source review and original report remain bound to the source SHA; these
are additional post-merge checks. Real 70-country calibrated values, external
attestation, durable OpeningSeed↔configuration/numeric lineage, ADR-14,
formal prerequisites, live runtime and production are `MISSING` or `NOT_RUN`.
