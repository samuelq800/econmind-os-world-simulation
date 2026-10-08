# F 0023 exact source-side release policy

Scope: SOURCE_ONLY, IMPLEMENTED_UNVERIFIED until fixed-candidate independent
review. Production caller is NOT_REGISTERED / CALLER_NOT_READY.

Fixed World base: bcfc66787631a13aa5093df42954070c2d7dd66b.
Fixed PR114 source: 7461a053a74131fcc8273a8ac981e28b510ca03c.
Only 0023, artifact source 4714c1da7af9324741996b94c6da036bf54c39a4,
SHA256 0e1ec372429164acb94f9b9588beac75fbf984f5a41413af13715e28a4e94a36.

F owns only the new source policy, focused local test, its strict JS typecheck
config and F report/plan. Do not change existing A rehearsal/policy/fixtures,
C/G/D/E source, migration bytes/manifest, status or old-site files.

Implementation: exact immutable Git-object loader; separate fingerprint-bound
publish/readback locks; one atomic request for existing main-site publisher;
actual ledger response verification; UNKNOWN stop without automatic retry.
No network/credentials/target selector/client construction/execution entrypoint.
No generalized migration or staging allowlist. Unknown 0024 is denied.

Verification: actual PGlite request with reviewed historical artifacts in an
ephemeral TEST_ONLY database, once/idempotent metadata readback, changed
provenance/ledger conflicts and pre-commit rollback; strict scoped checkJs,
lint/format and git diff --check. Do not repeat original 0023 economic audit,
native/full suite or contact production.

Release registration belongs to the existing main-site chain owner. Its fixed
workflow/target/concurrency/phase-lock/evidence/UNKNOWN handling must be reviewed
before using this interface. A source policy and local PASS cannot authorize
publication, SchemaAdmitted, seed/grants, Clock or economic activation.
