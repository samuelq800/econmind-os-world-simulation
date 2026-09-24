# V29 native PostgreSQL Worker sequence — preparation only

Status: `PREPARATION_ONLY_NOT_V29_STARTED`.

Frozen baseline: `1dbfacd69672ab527ac6628d27c6403e9c7c0006`.
The existing two-delivery PGlite fixture entered main at code base `21d43ae`;
this candidate extracts that fixture into shared test support without changing
Core, Worker, API, migration, production data or the original main site.

The focused native-PG test uses the existing V09 disposable database adapter,
which requires the shared loopback PostgreSQL target guard before any
connection. It is registered in the existing PG16 CI workflow's recovery test
file. A test-only in-memory fixture prepares the opening 14 GCU, two transfer
reservations, two shipments and two claimed delivery queue rows. Those prior
economic steps are **not** executed by the PG Worker test and are not evidence
of a complete production transfer lifecycle.

Only Delivery A and B execute through `createAuthoritativeWorkerExecution`,
the existing narrow Treasury-GCU candidate factory and native PostgreSQL
transactions. The test requires each distinct Command to persist its own
Event, Inventory Posting, Financial Posting, COMMITTED Receipt and Outbox;
WorldVersion and event sequence advance from 4 to 5 to 6. It verifies each
Event's transfer binding, each Receipt's version edge, 2 tonne of goods and
6 GCU of buyer Treasury payment per delivery (4 tonne / 12 GCU total), plus
durable hashes for Event, Inventory, Financial, Receipt and WorldVersion.

After Delivery B's transaction commits, a wrapper loses one commit
acknowledgement. The repository must recover the committed receipt from PG.
A newly constructed Worker retries B and must return `EXISTING_FINAL`,
preserve the same durable hashes and leave exactly two rows of each fact type.
This tests one post-commit response-loss path, not a process crash, connection
kill, broad fault matrix or all recovery surfaces.

Native PostgreSQL CI is a separate evidence source; PGlite and type/lint
passes cannot substitute for it. This is not a 70-country, 600/1000-day run,
economic calibration, formal V29 acceptance, independent review or Gate B.
