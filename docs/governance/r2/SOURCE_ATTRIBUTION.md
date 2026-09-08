# R2 governance source attribution

## Authoritative correction

The 101-step authority comes from the user-supplied archive
`EconMind_World_V2_R2_Authoritative_Governance.zip`, designated R2-101.1. The
archive SHA-256 is
`1a8beeff19a9e43cfc4a51f5ac0a2bca681b0b5e149cc34fb77d6047ea23cfbe`.
Its 110 manifest entries passed byte-count and SHA-256 verification before
sync. Its validator reported 33 work packages, 101 unique steps, an acyclic
dependency graph, and 101 step prompts.

The following files were promoted without changing their authoritative step
content:

- `planning/r2_steps.json`;
- `planning/R2_33_WORK_PACKAGES_101_STEPS.md`;
- `prompts/steps/*.md`;
- `prompts/control/RESUME_GOVERNANCE_SYNC.md`.

The supplied `PLANS.md` was merged with repository-specific navigation and the
current V00.1/V00.2 gate. Pack manifests and validation records are preserved
under `docs/governance/r2/source/` for provenance.

## Earlier R2 execution pack

Planning, work-package, source-index, extracted-specification, original DOCX,
ADR, fixed-catalog, and acceptance material comes from the user-supplied
`EconMind_World_V2_Execution_Pack`, version 2026-09-07, Execution Plan 1.0. Its
own read-only integrity validator passed before synchronization. The exact
delivery manifest and validation records are preserved under
`docs/governance/r2/source/`.

`requirements.docx` is byte-identical to the pack's Constitution. Both have
SHA-256
`960a7745a8e18b8f1cb10c754ce6681d46bdfc5933a979c4a989bd3a07ff5d49`.
The planning route retains its scope and gates; its superseded round-prompt
links were reconciled to the R2-101.1 state inspection and per-step workflow.

## Material intentionally not promoted

- The earlier pack's `reference/01_代码审查与证据.md` and
  `reference/prior_runtime_probe_results.json` describe a historical old-repo
  snapshot and are not current governance authority.
- Its three round-level prompts were superseded by the R2-101.1 per-step prompts
  and current control prompts; copying them into the active prompt tree could
  reintroduce stale repository assumptions.
- Template progress and decision files from the correction archive were not
  used as current truth. `status/progress.json` was derived from repository
  evidence and the active review gate; `status/decisions.json` preserves all
  proposals as unapproved.
- Pack-local validators were not used unchanged as the repository validator.
  `tools/validate_r2_governance.py` extends their read-only structural checks to
  the live status, decisions, prompts, templates, source hashes, and title
  agreement required by this repository.
