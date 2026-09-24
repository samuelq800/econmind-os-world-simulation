# V29.3 fixed-seed Worker replay evidence — preparation only

Status: `PREPARATION_ONLY_NOT_V29_STARTED`.

Frozen baseline: `22369f8cdfee80c6a2b8fb7c67761350b516b738`.

Scope is `tests/support` only. V29.2 is `PLANNED`, so this is not a formal
V29.3 start, implementation report, verification, or Gate change. It compares
two fresh disposable PGlite initializations executing the same test-namespaced
two-country narrow-delivery command sequence through the existing Worker
composition and production candidate factory. Each step reads durable Event,
inventory posting, financial posting, receipt, and WorldVersion facts back
from the database and hashes canonical evidence. On mismatch it emits only
the fixed test seed, command index, and minimal hash trace; no payload or
credentials are copied into the failure.

The seed namespaces test identities only. It is not authoritative World RNG,
calibration provenance, or an economic parameter. The fixed outcome remains
one 2-tonne grain / 6-GCU delivery followed by an idempotent retry. A full
multi-command simulation, 70-country Worker run, 600/1000 days, production
PostgreSQL, real SQL-only source preparation, crises, shortages, maturities,
defaults, and economic-reasonableness assessment remain `NOT_RUN`.

No Core, Worker runtime, API, schema, migration, production data, formal
status, Gate, or original main-site file is modified. Test tooling is P2
preparation touching P0 evidence but not changing P0 implementation; formal
V29 acceptance still requires independent review and its own real evidence.

Focused local evidence for seed `V29_REPLAY_SEED_1`: two fresh PGlite databases,
each executing command index 0 (commit) and 1 (same-command idempotent retry),
produce identical per-step durable hashes and the pinned sequence hash
`sha256:44214d63aefc1e78987f817b80f767c3ac1e582ab1046076cb706ecf683d7e2b`.
The sequence hash also binds the current replay version metadata. A different
test seed changes the hash; an intentionally mismatched run reports seed,
index 0 and only hash values. Empty sequences and indexed execution failures
use the same redacted reproduction envelope. This proves byte stability for
this narrow local path only, not economic calibration or full World replay.
