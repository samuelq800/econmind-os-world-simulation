# Registered Node resource plan

This sizes the existing fixed Node composition. It does not select a hosting
provider, provision a service, activate consumption or establish production
capacity. Cloudflare remains the edge boundary and Supabase the database.

| Requirement          | Initial deployment target                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Process              | Persistent Linux Node process, using the repository-pinned Node 24.20.0 and pnpm 12.3.4                                    |
| CPU                  | 2 vCPU; the current complete opening proof is largely single-threaded                                                      |
| Memory               | 4 GiB for a controlled initial trial; 8 GiB recommended until final-host cold-start and mixed-chain peaks are measured     |
| Disk                 | 20 GiB system/artifact space, with immutable opening files mounted read-only; authoritative state stays in PostgreSQL      |
| Network              | TLS inbound behind the existing edge; verified TLS to the configured PostgreSQL endpoints and Supabase JWKS                |
| Database connections | Five distinct principals, plus a sixth when Industry task publication is installed; at most two pooled connections each    |
| Startup              | Allow at least 10 minutes for initial full child-proof validation; readiness must remain false until preparation completes |
| Shutdown             | Deliver SIGTERM and allow request/consumer/publication draining; never kill and blindly resubmit an unknown commit         |

The 70-country child validation on 2026-11-01 took 422.108 seconds and peaked at
2,368,396 KiB RSS (about 2.26 GiB). This was an offline complete-proof and
Finance/FX derivation run, not HTTP load or a production Node process. It reused
the saved parent/child artifacts, preserved all parent country facts, and did
not initialize a World or advance the Clock. A manifest alone cannot recreate
the process-private verified source, so a cold process currently repeats the
complete verifier. Online requests use bounded readers; they do not perform
this full proof per request.

The separate 2026-11-01 Industry original-registration probe used an admitted
124,268,887-byte seed in an owned PostgreSQL 16.15 clone. Registration and its
idempotent repeat took 7.584 and 7.553 seconds. Resource observations belong to
different processes and must not be combined into a Node sizing result:

| Registration measurement                   | Observation                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| PostgreSQL backend RSS                     | Maximum observed sample 1,303,720 KiB, about 1.24 GiB                                        |
| PostgreSQL container memory                | Maximum observed sample 1,760,878,592 bytes, about 1.64 GiB; includes more than that backend |
| Node RSS after source-context construction | 702,267,392 bytes, about 670 MiB; a point observation, not a measured lifetime peak          |
| Node RSS after registration                | 296,189,952 bytes, about 282 MiB                                                             |

Database samples were taken approximately every 250 ms, so these are observed
maxima, not hard upper bounds. The probe did not run the complete 70-country
Core proof and did not measure the later child-world registration. The existing
3-GiB isolated database configuration provided headroom for this run; the
production Supabase compute specification has not been verified. Do not assume
that a Micro instance can execute this offline registration. Its database
budget must be evaluated separately from the Node process and bounded online
reads. No production instance was resized or purchased.

Low-memory termination, rollback and reconnect readback during this large
registration remain **NOT_RUN**. Successful ordinary registration, idempotent
repeat and unrelated transaction-rollback tests do not establish that failure
case. Before applying the publication procedure on a smaller database, verify
it on an isolated equivalent or provide a validated bounded publication path;
an unknown transaction outcome must be inspected before retrying. Evidence:
`industry-original-registration-native-20261101-a2/report.json`.

For planning, allow approximately USD 20–60/month for a self-managed 2-vCPU,
4–8-GiB VM, or USD 40–100+/month for managed persistent compute of similar size.
These are budget estimates, not checked provider quotes. Region, backups,
outbound traffic, tax and existing Cloudflare/Supabase charges are additional.
The owner selects the platform and configures credentials there; no purchase or
credential provisioning is performed by this code.

Before selecting the smallest instance, measure the complete final-host cold
start, actual registered mixed command/restart chain, simultaneous bounded
reads, pool saturation and graceful shutdown. The new complete-history paged
path has focused tests beyond 256 transitions; it still needs final-host memory
and latency measurements with the complete office mix. Unavailable-page states
must remain distinct from empty data. This document does not certify an
indefinitely running world's capacity.
