# V29.3 provenance tooling — scoped P2 acceptance

`OWNER_FAST_TRACK_ACCEPTED` applies only to the non-authoritative tool/test
commit `ce2e7d0`, cherry-picked from C's reviewed-scope candidate `e35d31a`
with its plan and evidence commits (`3304dec`, `b8c5260`). The owner requested
fast construction and safe direct mainline integration on 2026-09-24. This
does not approve actual parameter data, economic causal validity, V29.3,
Gate B, or production.

Changed code is confined to `tools/v29` and `tests/foundation`. It accepts
explicit caller-supplied source hashes, time ranges, parameter decimal/unit,
inert formula metadata and economic Event type labels. It does not read
source bytes, execute formulas, apply parameters or write World State. Missing
or malformed evidence fails closed; every output marks source-byte and causal
verification false, and never authorizes an Event. No P0 owner, runtime,
schema, migration, authorization, production data or original website changed.

On combined mainline, focused V29 evidence/provenance tests passed 10/10,
strict TypeScript, targeted ESLint/Prettier and repository secrets passed.
The originating evidence is preserved in `TEST_EVIDENCE.json` with its exact
original SHAs; these cherry-pick SHAs are the mainline mapping. Actual source
verification, parameter ingestion, dimensional checks, formula validation,
Worker replay and formal V29.3 review remain `NOT_RUN`.
