# E — non-host source adoption handoff

Status: IMPLEMENTED_UNVERIFIED. Independent P0 review: PENDING.
Base: d0926f288dcb84559cfdef94c7d283ea7ac180e7 (main/PR95).
Branch: codex/e-owner-non-host-source-adoption.

## Delivered

The new worker-only loader consumes the real pinned Owner original and independent
Root receipt, verifies the existing official-source adapter, and returns a branded
subset-policy/source adoption. No approved flag, caller-provided hash or fabricated
legacy full-proposal record can substitute for the actual files.

D01/D02/D03 are used literally: full B Treasury asset/CB liability meaning, full R
BANK asset/CB liability meaning, GCU scenario-unit equivalence (not LC parity),
350 existing entities, 619 OP-owned/risk stocks and 221 retained zero cells,
opening-only exact bank L*=H+D / E*=R+A-L* with original values and deltas retained.
D05 remains OWNER_EXCLUDED_DEFERRED; D06 is seat/NPC authority, not bank reconciliation.
No policy NPC, seat, player/admin identity or authority is created.

Each of 70 countries exposes seven field-level raw/GCU/LC/FX denomination records
and a 10-asset/7-liability/4-equity CB input contract. Only the two source-supported
CB liabilities have known GCU amounts. Undeclared holdings are not declared
instruments with missing fields, and neither is a default zero. Initial CB net
worth remains null until complete holdings evidence exists.

TEST_ONLY FX is branded and cannot enter non-test scope. FX !=1 exact arithmetic
and 619 real Core inventory constructors are exercised in focused tests. The
actual A parser/inspection consumes the real source but remains BLOCKED, because
this new adopted subset is not an approval of the old entire decision intent.

## Reproduce

Use pinned Node 24.20.0 and pnpm 12.3.4. Build Core, then Worker. The readonly
generate-review-manifest.mjs prints the deterministic review projection to stdout;
it never writes a database or starts an API/host. REVIEW_MANIFEST.json is its exact
output using repository formatting. Full branded manifest fingerprint:
sha256:73c96665334557656836aa218108c85ad50b6b091a3fab722696bf7e0ae95ba9.
Review projection SHA256:
2704c61c4177917e9e3726d609b48742f4673f0cdc8bbd0790fce0b9592bdd8f.

CHECKS.json records actual commands/exits, prior failed attempts and NOT_RUN items.
31/31 focused tests, focused types/lint/format, Core/Worker builds and local
boundary/authority/secret/environment checks passed. No database was configured.
This is local implementation evidence, not source completeness, native-PG command
closure, production connectivity, API/Page verification, review or Gate B.

## Remaining exact gaps / handoff to A and Root

- 490 field-local-currency gaps and 490 field-FX gaps: missing actual 70-country
  LC/FX opening source. Never assume FX=1; fixtures are TEST_ONLY.
- 70 complete-CB-register gaps: reserved account names do not prove holdings or
  a complete asset/liability inventory. No manufactured backing/equity/net worth.
- One formal World binding gap: no official WorldId invented.
- A owns actual paired claim/carrier construction and canonical seed admission.
  Consume isOwnerNonHostSourceAdoption plus its ownerPolicy/trustedSource,
  denominations/bankOpening/treasury/reserve/cbInput. Do not fake legacy ownerRecords
  to clear legacyInspection. Typed financial consumption and full command closure
  are still unverified; no activation claim is made.
- Root owns independent P0 review and integration. No self-merge/deployment.
  Existing A modules, Core, governance status, sources and migrations are unchanged.

The fixed prior audit/proposal are not rewritten. Explicit policy decisions remain
adopted despite the listed source/consumer gaps. This package is not an opening seed.
