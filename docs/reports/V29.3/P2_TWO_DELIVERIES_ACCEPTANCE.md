# V29 two-command Worker test — scoped P2 acceptance

`OWNER_FAST_TRACK_ACCEPTED` applies only to test-support commit `7f94266`,
cherry-picked from F's immutable candidate `83e8db9` on mainline base
`3725f2f`. It extends local evidence, not V29.3 verification or a production
economic World claim. No authoritative Core/Worker/API logic, schema,
migration, production data or original website changed.

Two distinct delivery Commands run sequentially through the existing
authoritative Worker and production narrow-delivery candidate factory in one
disposable PGlite World. Durable facts show WorldVersion 4→5→6, each Command
with one Event, Inventory Posting, Financial Posting, final Receipt and
Outbox. Each transfers 2 tonnes and settles 6 GCU, for 4 tonnes and 12 GCU
total; a retry adds no facts. Per-step durable hashes and a fresh-database
fixed-sequence replay are checked. The reserve/ship lineage and queue claim
are still local preparation fixtures, not an end-to-end live scheduler.

On merged mainline the focused file passed 10/10 under both UTC and
Asia/Shanghai, and dedicated strict TypeScript passed. F reported lint,
format, boundary, secret and diff checks on the source candidate. Actual
70-country 600/1000-day Worker cycles, crisis/default paths, native
PostgreSQL execution, empirical calibration and formal V29.3 review remain
`NOT_RUN`.
