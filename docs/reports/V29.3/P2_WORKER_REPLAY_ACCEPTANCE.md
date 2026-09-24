# V29 Worker replay evidence — scoped P2 acceptance

`OWNER_FAST_TRACK_ACCEPTED` applies only to test-support commit `0824ea9`,
cherry-picked from F's exact candidate `51d9d22` onto mainline base
`c17672d`. This accepts a local regression/evidence harness, not V29.3
verification, a real 70-country long run, or a production replay claim.

All changed code is under `tests/support`; it reads disposable-PGlite durable
Worker effects after a single prepared two-country 2-tonne/6-GCU delivery and
its idempotent retry. A same-sequence replay compares each durable Event,
posting, receipt and WorldVersion hash. The seed is a test identity label,
not an authoritative random economic input. No Core/Worker/API runtime,
schema, migration, authorization, production data or original website changed.

On combined mainline, focused Worker replay tests passed 7/7 as part of a
10/10 two-file run with E's V30.2 test; dedicated strict TypeScript, targeted
ESLint and Prettier passed. F reported boundary and secret checks on its
original candidate. Real country setup, multi-command daily scheduler,
70-country 600/1000-day non-idle run, crises, native PostgreSQL, full
repository check and formal V29.3 review are `NOT_RUN`.
