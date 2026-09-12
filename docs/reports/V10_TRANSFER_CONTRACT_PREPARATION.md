# Transfer command and approval preparation

Status: `PREPARATION_ONLY_NOT_V10_STARTED`.

- Baseline: `c7f3c8044d4ef27b89873f6ec2b0d1ae0c594f71`.
- Code candidate: `85575b9f8b9b4fbe6b4433e488a6e459cbf5bfc9`.
- Branch: `codex/o-v10-contract-preparation`.

## Reusable code

`tests/preparation/v10-transfer-contract.ts` constructs a labelled test command
using the existing canonical Command parser, registered GRAIN unit (`tonne`),
Quantity and Price values, and country-scoped V05 proposals. Both sides bind
the same complete command fingerprint. Seller Trade and Buyer Trade remain
distinct required signatures because country is part of the signature scope.

The 18 scenario assertions cover changed quantity, price, buyer, payment source,
policy and required signatures; audit-only retry; changed expected version;
dual-Office signatures by one person; duplicate Office signature; cross-country
signing; inactive/suspended/reassigned/revised membership; and altered proposal
scope. They exercise the existing V05/V07 implementations, not a mock validator.

## Actual verification

Pinned Node 24.20.0 / pnpm 12.3.4; frozen offline installation succeeded.

- `vitest run tests/preparation/v10-transfer-contract.test.ts`: 18/18 PASS.
- `tsc -p tests/tsconfig.v10-preparation.json`: PASS.
- ESLint on the two new TypeScript files: PASS.
- Focused Prettier check and `git diff --check`: PASS.

The first strict TypeScript invocation failed on the Vitest dependency's
`DOMHighResTimeStamp` declaration. The test-only tsconfig now supplies the DOM
ambient library, and strict checking passes; production tsconfigs are unchanged.
No full suite, staging, database, browser or network test was run.

## Integration limits

These builders are synthetic test assets, not an untrusted-input parser or a
production trade resolver. ADR-09's recommended Office set remains labelled
`TEST_ONLY_UNAPPROVED_V10_TREASURY_V1`. Formal ADR approval, runtime dispatch,
stock checks/reservation, transaction-time signer re-resolution, real receipt
recovery, and V09/V10 gates remain separate implementation and evidence work.
No national calibration values, country generation, page design, runtime
exports, database migration, main-site files, or governance status changed.

Source anchors: `docs/exec-plans/V10.2.md`, the ADR-09 section of
`docs/architecture/WORLD_CORE_JIT_ADR_PACK.md`, existing V05 approval/Office
contracts, V07 Command schema, and `COMMODITY_ENTRIES` in the Core registry.
