# Exact historical proposal upgrades (unapproved candidates)

These four function-upgrade transactions and the separately supplied water-grant
scope upgrade cover the five modified proposals between
`0cf65bc0e6cbf1b117ca625bb16ec7280938e239` and
`4b6d400c2620303bfdc167d6645adfbfed3f3e04`. They have not run against a retained
World, native PostgreSQL or production. They do not adopt sources or create
securities, quotes, rights, accounts, payments or execution facts.

The manifest records the exact old/new proposal bytes and affected function-body
hashes. The old proposal fixtures are verbatim Git bytes, not reconstructed table
schemas. SQL preconditions check the actual installed body, signature, parameter
names/defaults, result, owner, language, volatility, security/search-path settings,
reader EXEC ACL, existing owner role and forced-RLS tables. A source-file hash in
this review package is not proof that a database installed that entire file.

Apply only in a separately reviewed release window with affected callers drained
and a freshly isolated clone of the sealed predecessor. Do not initialize or
rehydrate the World or its raw opening seed. Use the existing schema-delta review
and fixed-source execution process; these files add no executor or generic DDL
exception. No runtime role enrollment, secret or membership is supplied here.

1. `postwar-captain-allocation-options-upgrade.sql`: installs the private bounded
   allocation-options helper and replaces the final H0 reader in place. The
   predecessor installation order is derived reader → paged dispatcher → H0
   wrapper. The derived reader's original body was overwritten by the paged
   dispatcher; the H0 wrapper renamed that dispatcher to
   `read_postwar_captain_current_page_before_h0_v1`. Its exact unchanged body is
   checked. The separate legacy-array reader remains exactly as in target 4b.
2. `postwar-industry-first-day-refinery-upgrade.sql`: replaces only the publisher
   function with target 4b's own-country/existing-refinery scope. Existing policy,
   source-byte, admission, country/facility, route and revocation guards remain
   target bytes. No existing first-day original is changed or reissued.
3. `postwar-paged-current-options-upgrade.sql`: after the exact Captain helper is
   present, replaces only the private paged reader with target 4b's metadata
   addition. Existing function OIDs/ACLs and all documents/pages remain intact.

Each file is one transaction. There is no cross-file atomicity or automatic
rollback of an earlier commit. Repeated execution deliberately fails with
`PROPOSAL_UPGRADE_EXACT_OLD_FUNCTION_REQUIRED`; it is not a fresh installer. Any
unexpected definition, ACL, owner or RLS state also rejects. If COMMIT outcome is
unknown, stop, inspect the exact catalog/data on a new connection and reconcile
it; do not automatically rerun. These four function-only transactions perform no
DROP/CASCADE, RLS/trigger disabling, table DML, new role or runtime privilege grant.
The separate GRANT scope transaction replaces one precisely checked primary-key
constraint and adds the scoped recovery overload under the existing publisher
role; its fixed SQL hash is the only matching classifier exception.

4. `postwar-industry-utility-source-functions-upgrade.sql`: replaces only the
   utility-source publisher and water-command historical-evidence getter with
   their exact target 4b bodies. The source publisher selects the real registered
   country/facility; evidence derives the region from that immutable source. It
   does not change the GRANT table or its publisher.

## Companion scope upgrade and two fresh files

`postwar-industry-water-grant-scope-upgrade.sql` is supplied separately by its
owner. It upgrades the exact predecessor GRANT key from `(world_id,run_id)` to
`(world_id,schedule_command_id)`, recovery RPCs and publisher,
including the target 4b country/facility source guards. Its exact hash and
function coverage must match the common manifest before use. Do not reinstall
`postwar-industry-utility-custody.sql`; the two function changes in item 4 above
and this scope upgrade together cover its target changes. No combined retained
World upgrade is claimed by the individual embedded tests.

The two newly added files use the existing fixed-source fresh-file path after
catalog/dependency review, not these function upgrades:

- `postwar-industry-power-service-source.sql` requires utility custody (including
  the reviewed scope upgrade where applicable), first-day source, RUN history and
  WORK publication. It uses the existing Industry owner/publisher/reader chain.
  It also contains target 4b's fixed replacements for first-day read and WORK
  publication; review those existing definitions before fresh execution.
- `postwar-industry-power-service-current.sql` requires that service source and
  `postwar-mixed-industry-current-effects.sql`. Its fixed extension replaces the
  Industry current-original verifier under the existing owner/EXEC chain.

Neither file supplies actual independent service WORK, wages or delivery. Fresh
installation and function availability do not prove that POWER is executable.

## Verification boundary

The isolated PGlite test installs real baseline artifacts and old fixed proposal
SQL, retains explicitly TEST_ONLY derived document/page sentinel bytes, and checks
all four function-upgrade transactions. It checks definition drift, PUBLIC ACL drift, disabled RLS,
injected post-replacement rollback and repeat rejection; compares rows, function
OIDs/ACLs, roles/memberships, table ACL/RLS, policies and triggers; and checks the
new helper has no reader EXEC permission. This is small embedded schema-upgrade
verification, not native concurrency, economic settlement or production approval.
