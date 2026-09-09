#!/usr/bin/env python3
"""Render all R2 step prompts from the manifest and centralized review policy."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "planning/r2_steps.json"
POLICY_PATH = "docs/governance/FAST_MAINLINE_REVIEW_POLICY.json"


def render(step: dict[str, object]) -> str:
    dependencies = ", ".join(step["hard_dependencies"]) or "none"
    return f"""# {step['step_id']} — {step['title']}

## Authority
Treat `requirements.docx` / Constitution as non-negotiable P0/P1 law. Follow `AGENTS.md`, `PLANS.md`, `planning/r2_steps.json`, relevant Master/Office specifications, approved ADRs, and `{POLICY_PATH}`.

## Gate
- Work package: {step['work_package']} — {step['work_package_title']}
- Stage: {step['stage']}
- Execution mode: `{step['execution_mode']}`
- Hard dependencies: {dependencies}

Before implementation, validate dependency readiness under the central policy. A P0 dependency is ready only after blocking independent review; a lower-risk dependency may use only a policy-valid continuation or verification record.

## Goal
{step['purpose']}

## Exit gate
{step['acceptance']}

## Required workflow
1. Read only the relevant specs/ADRs and inspect current code.
2. Write `docs/exec-plans/{step['step_id']}.md` before product code changes.
3. Classify the actual change by its highest affected boundary; uncertainty resolves upward and classification may never be lowered to bypass review.
4. Declare affected authoritative owners, reads/writes/events/commands, DB/RLS/time implications, and legacy impact.
5. Implement only this step and run real unit/integration/invariant/security/governance checks appropriate to scope. Preserve `FAIL` and `NOT_RUN` honestly.
6. Create `docs/reports/{step['step_id']}/IMPLEMENTATION.md` and `TEST_EVIDENCE.json`.
7. Apply `{POLICY_PATH}` to status, review timing, merge, and continuation. P0 always stops for independent review. P1 review may be deferred only to its named Work Package gate. P2/P3 fast-track requires the policy evidence record.
8. Never proceed past an unresolved blocker or a failed mandatory check.

## Universal prohibitions
- No second Source of Truth.
- UI cannot mutate authoritative state.
- No direct macro outcome or hidden buff.
- No production Supabase mutation outside an authorized release.
- No weakening/skipping P0 tests or Constitution requirements.
"""


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    prompt_directory = ROOT / "prompts/steps"
    prompt_directory.mkdir(parents=True, exist_ok=True)
    for step in manifest["steps"]:
        (prompt_directory / f"{step['step_id']}.md").write_text(
            render(step), encoding="utf-8"
        )


if __name__ == "__main__":
    main()
