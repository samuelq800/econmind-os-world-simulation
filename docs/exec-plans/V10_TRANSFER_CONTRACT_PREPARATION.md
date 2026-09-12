# V10 transfer contract preparation

Status: `PREPARATION_ONLY_NOT_V10_STARTED`.

User authority: the owner explicitly requested isolated advance construction
of step code, followed by independent review and fixes. Formal dependency
acceptance still follows the original V09/V10 order. Page design is paused.

Baseline: `c7f3c8044d4ef27b89873f6ec2b0d1ae0c594f71`.

## Scope

Add test-only builders and scenarios under `tests/preparation/v10-*` that reuse
the existing V05 approval and V07 canonical Command APIs. Bind a synthetic
GRAIN/Treasury-GCU intent to seller and buyer country-scoped proposals and
exercise country/Office separation, changed terms, revoked membership, and
idempotency. Values are synthetic, use the registered GRAIN unit, and do not
describe actual countries or calibrated economic parameters.

ADR-09 remains proposed. The recommended Seller Trade / Buyer Trade / Buyer
Finance signature set is a labelled test policy, not a production resolver
approval. An approved same-user fixture must still sign each Office separately.

The highest prospective boundary is P0 authorization/economic intent. No
runtime module, reservation, settlement, migration, database, UI, governance
status, or main-site file changes are permitted in this preparation. No test
claims to prove stock reservation, commit atomicity, or live authorization.

## Verification and handoff

Run only the new contract tests, strict TypeScript checking of the preparation
files, focused style checks, and diff checks. Record actual results and source
anchors in a preparation report. Push an isolated candidate for review and
handoff to A/C/F; integration awaits the original gates and approved ADR-09.
