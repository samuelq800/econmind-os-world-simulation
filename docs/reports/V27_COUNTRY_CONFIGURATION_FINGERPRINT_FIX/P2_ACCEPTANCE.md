# V27 structural fingerprint contract — scoped P2 acceptance

`OWNER_FAST_TRACK_ACCEPTED` applies only to C's non-authoritative manifest
tool/test delta `88dfc511ec494c53dc3c9f81b73e3df1ccb368ac`, integrated by a
conflict-free merge from exact branch tip `28215c36b4a7e05cea1742c7e069fb29384094bf`.
The owner requested fast, safe mainline construction. The integration changed
no P0 Core/Worker authority, database schema, API, runtime, production data or
original website.

The external unverified configuration source reference/hash are now separate
from the structural fingerprint calculated from World ID and sorted country
IDs. The latter uses A's V27.2 binding version/preimage and reports
`MATCH`/`MISMATCH`/`NOT_VERIFIED`; it never verifies source bytes, grants
configuration authority or authorizes World generation. The old ambiguous
field shape is rejected rather than silently interpreted as authority.

On merged mainline, focused tests passed 9/9; strict TypeScript and targeted
ESLint passed. C reported formatting, secret and diff checks on the exact
source candidate. Actual 70-country source values, owner attestation,
Core/Worker import of this tool, OpeningSeed authorization and formal V27/V28
review remain `MISSING` or `NOT_RUN`.
