# V29 Worker delivery driver — preparation only

Status: `PREPARATION_ONLY_NOT_V29_STARTED`.

Frozen baseline: `808fe2a99220de8d04f4aec0fbf894440dc64c6c`.

V29.1–V29.3 are `PLANNED`; this change does not start or close them. It adds a
test-only adapter around the existing authoritative Worker composition root
and an isolated PGlite test. The narrow action is a two-country Treasury-GCU
goods delivery. The production Core delivery candidate factory calculates its
inventory and financial effects; the Worker commits its Event, postings,
receipt, outbox and WorldVersion atomically through the existing repository.

This is not a production Worker service: the HTTP runtime still advertises
`simulationEnabled: false`, and the local test supplies a prepared two-country
source and disposable database. SQL-only preparation source, real country
initialization, NPC decisions, 70-country daily cycles, 600/1000-day Worker
long runs, crises, maturity, shortage, default and production PostgreSQL are
`NOT_RUN`. No API, Core, Worker runtime, schema, migration, status, Gate or
original website code is changed. The test tooling touches P0 evidence but
does not change P0 logic; independent review is required before any formal
V29 acceptance claim.

The focused local proof exercises one production `CORE_GOODS_DELIVERY_V1`
candidate: 2 tonnes of grain move into Buyer availability and an exact 6 GCU
bilateral financial posting is stored. The first Worker call commits the
delivery; a retry returns the identical durable receipt with no second Event
or posting. An unsubmitted command fails with zero persisted economic facts.
The local pre-delivery reserve/shipment lineage and claimed queue row are
explicitly test-prepared, not claims of completed live authorization or a
running scheduler.
