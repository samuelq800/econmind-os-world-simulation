# Fixed Social creation source-review package

The schema-delta CLI now additionally accepts the exact final argument pair
`--forward-manifest database/upgrades/postwar-social-employment-creation.manifest.json`.
The artifact README at Tx commit `6746081e` describes its earlier loader-only delivery;
this later CLI connection leaves those SQL/manifest pins and review boundaries intact.

Use the existing source-root, immutable candidate SHA, companion-root and fresh
output-directory arguments. The fixed read-only loader validates all pins first.
Output contains one increment (13 exact old bodies plus the declared 1-table,
3-function supplement), zero fresh proposals, `installationAllowed=false` and
zero database operations. Fresh installation and this retained-schema path are
mutually exclusive; logistics and opening-repair receipts stay independent.

Stop/drain consumers and source-publication transactions before any separately
authorized installation. Source licence initialization remains a separate
controlled transaction after a confirmed schema receipt; packaging performs none.
Unknown COMMIT means stop and inspect catalog/receipts, never blind retry.
No migration registration, permission, source authority or production approval
is created by this tool. Default fresh and the fixed logistics path are unchanged.
