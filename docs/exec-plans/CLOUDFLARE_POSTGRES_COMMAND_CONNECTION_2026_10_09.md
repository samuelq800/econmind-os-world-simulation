# Cloudflare PostgreSQL / economic command connection

Owner request: finish the formal Supabase connection and economic command path.
Preparation base: `95ca908` (PR125/126 merged into the existing delivery branch).
Status: IN_PROGRESS; P0 independent review required before publication.

The authoritative `status/progress.json` gate is V09.1 PLANNED. Its hard
dependencies V02.3/V07.3/V08.3 are VERIFIED. ADR-18 permits disposable local/CI
preparation, not production startup. This work leaves gate and decisions intact.

## Bounded implementation

1. Supply request-scoped real pg pools from server-held Hyperdrive connections;
   preserve original pool identity, transaction/authentication/authorization
   checks and UNKNOWN handling. Use the frozen pg 8.16.3 dependency.
2. Supply Workers-compatible JWKS transport to the actual existing read and
   financial compositions, retaining the original cryptographic verifier.
3. Run an actual workerd + owned native PostgreSQL mechanism roundtrip: real
   JWT, persisted seat, intake/approval/enqueue, Worker fenced Reserve/Ship/
   Deliver, durable FINAL, authorized read and revoked-seat refusal.
4. Record exact validation and unmet production prerequisites in the handoff.

No production migration, grant, seed, Clock, lease, automatic scheduler or
economic producer is introduced. Never widen the existing local/CI guards or
replace private runtime constructor identity with a remote READY declaration.

## Production prerequisites observed

- Account Hyperdrive inventory was empty (Wrangler list, exit 0).
- Shared production project is `vimksjrhaxdpnkvgsavz`; no known least-privilege
  runtime connection file or binding was provided. Credential question pending.
- Main-site publisher `origin/main` observed at `dc7c75e`: exact 0023 caller is
  not registered. World source policy expressly remains CALLER_NOT_READY.
- PR125/126 source closeout says LC/FX and complete central-bank producer
  contracts are absent; real opening preflight is blocked. Official seed,
  admission/current seats and an approved production execution host are absent.

The native mechanism fixture includes a narrowly scoped TEST_ONLY admission
trigger override, restored immediately. Its synthetic balances, seats, source
and automatic scheduling are never production readiness or lawful disclosure.

## Required evidence

Strict source/test typechecks; source formatting/lint; existing JWT/read/intake/
Office regressions; boundaries, environment, secret, migration checks and build;
real workerd/PostgreSQL end-to-end run. NOT_RUN is never PASS. Commit, tree,
provider checkout and exit codes are recorded after commands actually finish.

Cloudflare Free remains the selected plan. Hyperdrive supports it; cache must
be disabled for current authorization, receipts and economic state. No cloud
database is created for development and no production credentials are used in CI.
