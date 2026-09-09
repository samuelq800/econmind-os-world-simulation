# R2 governance repository map

This directory records provenance for the repository-level R2 execution system.
The active entry point is `PLANS.md`; machine-readable current truth is under
`status/`.

- R2-101.1 step authority: `planning/r2_steps.json`.
- Active review/continuation authority: `docs/governance/FAST_MAINLINE_REVIEW_POLICY.json`.
- Step prompt renderer: `tools/render_step_prompts.py`.

The files under `docs/governance/r2/source/` preserve the original R2-101.1
delivery and hashes as historical evidence. They are not regenerated when the
active review policy or rendered prompts change.

- Human step navigation: `planning/R2_33_WORK_PACKAGES_101_STEPS.md`.
- Work-package plan and 30-day windows: `planning/`.
- Current progress and unresolved decisions: `status/`.
- Step and control prompts: `prompts/`.
- Evidence and review templates: `templates/`.
- Read-only repository validator: `tools/validate_r2_governance.py`.
- Source identity and exclusions: `docs/governance/r2/SOURCE_ATTRIBUTION.md`.

The copied planning and source files describe requirements and proposed
architecture. They do not prove that application work, database tests, or
deployment occurred.
