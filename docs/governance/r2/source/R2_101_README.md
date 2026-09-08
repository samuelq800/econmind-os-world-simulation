# EconMind World V2 — R2 Authoritative Governance Correction

This package repairs one specific governance defect: the previously supplied pack did **not** actually contain the claimed 101 detailed step definitions. This correction is the authoritative definition of those 101 steps.

## Authority
- Work packages remain V00–V32 (33 total) and preserve the previously approved package scope/dependencies.
- Detailed step IDs and hard dependencies are newly frozen here as R2-101.1.
- This does **not** approve ADR-01..20, implement product code, or change Constitution scope.

## Primary files
- `planning/r2_steps.json`: machine-readable authority for IDs/dependencies.
- `planning/R2_33_WORK_PACKAGES_101_STEPS.md`: human-readable mirror.
- `PLANS.md`: execution governance.
- `prompts/steps/`: 101 step-level execution prompt shells.
- `status/*.template.json`: templates only; governance sync must derive current truth.
- `prompts/control/RESUME_GOVERNANCE_SYNC.md`: resume prompt for the existing governance branch.

## Count design
Most work packages contain 3 steps. V10 and V30 contain 4 steps because the first real economic vertical slice and final joint capacity/security/recovery acceptance require distinct end-to-end gates. Total = 101.
