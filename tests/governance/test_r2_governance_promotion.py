#!/usr/bin/env python3
"""Regression tests for history-backed R2 Governance status promotion."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any, Callable


ROOT = Path(__file__).resolve().parents[2]
VALIDATOR = ROOT / "tools/validate_r2_governance.py"
REVIEWED_COMMIT = "e7f8576ed559bd9167b67cd7493112855f65ca7e"
EVIDENCE_COMMIT = "992c9486745288fdac2c9004e387669037c1b740"
OTHER_ANCESTOR = "5a2ff28a8111449446475da2e3acae16f8ad0b89"
REVIEW_PATH = "docs/reports/governance/R2_GOVERNANCE_REVIEW_RECHECK.md"
VALIDATION_PATH = (
    "docs/reports/governance/R2_GOVERNANCE_RECHECK_VALIDATION.json"
)


class GovernancePromotionTests(unittest.TestCase):
    temporary_directory: tempfile.TemporaryDirectory[str]
    verified_fixture: Path

    @classmethod
    def setUpClass(cls) -> None:
        cls.temporary_directory = tempfile.TemporaryDirectory(
            prefix="r2-governance-promotion-tests-"
        )
        cls.verified_fixture = Path(cls.temporary_directory.name) / "verified"
        cls._command(
            ROOT,
            "git",
            "clone",
            "--quiet",
            "--no-hardlinks",
            str(ROOT),
            str(cls.verified_fixture),
        )
        cls._git(cls.verified_fixture, "config", "user.name", "R2 Test Reviewer")
        cls._git(
            cls.verified_fixture,
            "config",
            "user.email",
            "r2-review@example.invalid",
        )
        cls._update_progress(
            cls.verified_fixture,
            lambda progress: progress["governance_sync"].update(
                {
                    "status": "VERIFIED",
                    "verification": {
                        "decision": "APPROVED",
                        "reviewed_commit": REVIEWED_COMMIT,
                        "evidence_commit": EVIDENCE_COMMIT,
                        "evidence_paths": [REVIEW_PATH, VALIDATION_PATH],
                    },
                }
            ),
        )
        cls._git(cls.verified_fixture, "add", "status/progress.json")
        cls._git(
            cls.verified_fixture,
            "commit",
            "--quiet",
            "-m",
            "test: apply evidence-backed governance promotion",
        )

    @classmethod
    def tearDownClass(cls) -> None:
        cls.temporary_directory.cleanup()

    @staticmethod
    def _command(cwd: Path, *arguments: str, input_text: str | None = None) -> str:
        result = subprocess.run(
            list(arguments),
            cwd=cwd,
            input=input_text,
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            raise AssertionError(
                f"command failed ({result.returncode}): {' '.join(arguments)}\n"
                f"{result.stdout}{result.stderr}"
            )
        return result.stdout.strip()

    @classmethod
    def _git(
        cls, cwd: Path, *arguments: str, input_text: str | None = None
    ) -> str:
        return cls._command(cwd, "git", *arguments, input_text=input_text)

    @staticmethod
    def _update_progress(
        fixture: Path, operation: Callable[[dict[str, Any]], None]
    ) -> None:
        path = fixture / "status/progress.json"
        progress = json.loads(path.read_text(encoding="utf-8"))
        operation(progress)
        path.write_text(
            json.dumps(progress, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    def fixture(self, name: str) -> Path:
        target = Path(self.temporary_directory.name) / name
        shutil.copytree(self.verified_fixture, target)
        return target

    def validator_result(self, fixture: Path) -> tuple[int, dict[str, Any]]:
        result = subprocess.run(
            [sys.executable, str(VALIDATOR), "--root", str(fixture), "--json"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertTrue(result.stdout, result.stderr)
        return result.returncode, json.loads(result.stdout)

    def assert_rejected(self, fixture: Path, expected: str) -> None:
        returncode, result = self.validator_result(fixture)
        self.assertNotEqual(returncode, 0)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn(expected, "\n".join(result["errors"]))

    def test_accepts_historical_independent_approved_review_evidence(self) -> None:
        fixture = self.fixture("positive")
        returncode, result = self.validator_result(fixture)
        self.assertEqual(returncode, 0, result["errors"])
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["metrics"]["governance_sync_status"], "VERIFIED")
        self.assertFalse(result["metrics"]["governance_merge_authorized"])

    def test_rejects_verified_without_verification_object(self) -> None:
        fixture = self.fixture("missing-verification")
        self._update_progress(
            fixture, lambda progress: progress["governance_sync"].pop("verification")
        )
        self.assert_rejected(fixture, "requires a verification object")

    def test_rejects_changes_required_verification_decision(self) -> None:
        fixture = self.fixture("changes-required")
        self._update_progress(
            fixture,
            lambda progress: progress["governance_sync"]["verification"].update(
                {"decision": "CHANGES_REQUIRED"}
            ),
        )
        self.assert_rejected(fixture, "requires verification decision APPROVED")

    def test_rejects_nonexistent_reviewed_commit(self) -> None:
        fixture = self.fixture("missing-reviewed-commit")
        self._update_progress(
            fixture,
            lambda progress: progress["governance_sync"]["verification"].update(
                {"reviewed_commit": "0" * 40}
            ),
        )
        self.assert_rejected(fixture, "reviewed_commit does not exist")

    def test_rejects_nonexistent_evidence_commit(self) -> None:
        fixture = self.fixture("missing-evidence-commit")
        self._update_progress(
            fixture,
            lambda progress: progress["governance_sync"]["verification"].update(
                {"evidence_commit": "0" * 40}
            ),
        )
        self.assert_rejected(fixture, "evidence_commit does not exist")

    def test_rejects_evidence_commit_outside_current_head_ancestry(self) -> None:
        fixture = self.fixture("evidence-outside-head")
        current_tree = self._git(fixture, "rev-parse", "HEAD^{tree}")
        side_evidence = self._git(
            fixture,
            "commit-tree",
            current_tree,
            "-p",
            REVIEWED_COMMIT,
            input_text="review evidence outside current branch\n",
        )
        self._update_progress(
            fixture,
            lambda progress: progress["governance_sync"]["verification"].update(
                {"evidence_commit": side_evidence}
            ),
        )
        self.assert_rejected(
            fixture,
            "evidence_commit is not an ancestor of the current governance HEAD",
        )

    def test_rejects_reviewed_commit_outside_evidence_ancestry(self) -> None:
        fixture = self.fixture("wrong-ancestry")
        empty_tree = self._git(fixture, "mktree", input_text="")
        unrelated = self._git(
            fixture, "commit-tree", empty_tree, input_text="unrelated review target\n"
        )
        self._update_progress(
            fixture,
            lambda progress: progress["governance_sync"]["verification"].update(
                {"reviewed_commit": unrelated}
            ),
        )
        self.assert_rejected(
            fixture, "reviewed_commit is not an ancestor of evidence_commit"
        )

    def test_rejects_evidence_path_missing_at_evidence_commit(self) -> None:
        fixture = self.fixture("missing-evidence-path")
        self._update_progress(
            fixture,
            lambda progress: progress["governance_sync"]["verification"].update(
                {
                    "evidence_paths": [
                        "docs/reports/governance/R2_GOVERNANCE_REVIEW_MISSING.md"
                    ]
                }
            ),
        )
        self.assert_rejected(fixture, "evidence path does not exist at evidence_commit")

    def test_rejects_review_artifact_with_different_reviewed_commit(self) -> None:
        fixture = self.fixture("different-reviewed-commit")
        self._update_progress(
            fixture,
            lambda progress: progress["governance_sync"]["verification"].update(
                {"reviewed_commit": OTHER_ANCESTOR}
            ),
        )
        self.assert_rejected(fixture, "review evidence names a different reviewed commit")

    def test_rejects_review_artifact_without_approved_final_decision(self) -> None:
        fixture = self.fixture("review-not-approved")
        markdown = fixture / REVIEW_PATH
        text = markdown.read_text(encoding="utf-8")
        self.assertIn("**APPROVED.", text)
        markdown.write_text(
            text.replace("**APPROVED.", "**CHANGES_REQUIRED.", 1),
            encoding="utf-8",
        )
        validation = fixture / VALIDATION_PATH
        record = json.loads(validation.read_text(encoding="utf-8"))
        record["decision"] = "CHANGES_REQUIRED"
        validation.write_text(
            json.dumps(record, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        self._git(fixture, "add", REVIEW_PATH, VALIDATION_PATH)
        self._git(
            fixture,
            "commit",
            "--quiet",
            "-m",
            "test: preserve non-approved review evidence",
        )
        nonapproved_evidence = self._git(fixture, "rev-parse", "HEAD")
        self._update_progress(
            fixture,
            lambda progress: progress["governance_sync"]["verification"].update(
                {"evidence_commit": nonapproved_evidence}
            ),
        )
        self.assert_rejected(fixture, "review evidence decision is not APPROVED")

    def test_rejects_review_artifact_only_in_working_tree(self) -> None:
        fixture = self.fixture("working-tree-only-evidence")
        relative = (
            "docs/reports/governance/R2_GOVERNANCE_REVIEW_CURRENT_ONLY.md"
        )
        (fixture / relative).write_text(
            "# R2 Governance Independent Re-Review\n",
            encoding="utf-8",
        )
        self._update_progress(
            fixture,
            lambda progress: progress["governance_sync"]["verification"].update(
                {"evidence_paths": [relative]}
            ),
        )
        self.assert_rejected(fixture, "evidence path does not exist at evidence_commit")

    def test_rejects_merge_authorization_before_v001_verification(self) -> None:
        fixture = self.fixture("premature-merge")
        self._update_progress(
            fixture,
            lambda progress: progress["governance_sync"].update(
                {
                    "merge_authorized": True,
                    "final_reconciliation_gate": "PASS",
                }
            ),
        )
        self.assert_rejected(fixture, "governance merge requires V00.1 VERIFIED")

    def test_rejects_implementation_report_as_review_authority(self) -> None:
        fixture = self.fixture("implementation-report")
        self._update_progress(
            fixture,
            lambda progress: progress["governance_sync"]["verification"].update(
                {"evidence_paths": ["docs/reports/V00.1/IMPLEMENTATION.md"]}
            ),
        )
        self.assert_rejected(fixture, "invalid or unsupported evidence path")

    def test_preserves_missing_step_prompt_rejection(self) -> None:
        fixture = self.fixture("missing-step-prompt")
        (fixture / "prompts/steps/V00.1.md").unlink()
        self.assert_rejected(fixture, "step prompt set differs from step manifest")

    def test_preserves_invalid_dependency_rejection(self) -> None:
        fixture = self.fixture("invalid-dependency")
        manifest_path = fixture / "planning/r2_steps.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["steps"][0]["hard_dependencies"] = ["V99.9"]
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        self.assert_rejected(fixture, "has missing dependency V99.9")

    def test_preserves_dependency_cycle_rejection(self) -> None:
        fixture = self.fixture("dependency-cycle")
        manifest_path = fixture / "planning/r2_steps.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["steps"][0]["hard_dependencies"] = ["V00.2"]
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        self.assert_rejected(fixture, "dependency cycle")

    def test_preserves_impossible_verified_dependency_rejection(self) -> None:
        fixture = self.fixture("impossible-verified-dependency")
        self._update_progress(
            fixture,
            lambda progress: progress["steps"].update({"V00.2": "VERIFIED"}),
        )
        self.assert_rejected(fixture, "impossible VERIFIED dependency claim")

    def test_preserves_adr_self_approval_rejection(self) -> None:
        fixture = self.fixture("adr-self-approval")
        decisions_path = fixture / "status/decisions.json"
        decisions = json.loads(decisions_path.read_text(encoding="utf-8"))
        decisions["decisions"][0].update(
            {
                "status": "APPROVED",
                "approval_record": {"approved_by": "IMPLEMENTATION_AGENT"},
            }
        )
        decisions_path.write_text(
            json.dumps(decisions, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        self.assert_rejected(fixture, "ADR-01 was self-approved")

    def test_preserves_partial_prompt_rejection(self) -> None:
        fixture = self.fixture("partial-prompt")
        prompt = fixture / "prompts/steps/V00.1.md"
        text = prompt.read_text(encoding="utf-8")
        self.assertIn("one of: `IN_PROGRESS`", text)
        prompt.write_text(
            text.replace("one of: `IN_PROGRESS`", "one of: `PARTIAL`", 1),
            encoding="utf-8",
        )
        self.assert_rejected(
            fixture, "prompt allowed statuses differ from implementation vocabulary"
        )

    def test_preserves_invalid_execution_mode_rejection(self) -> None:
        fixture = self.fixture("invalid-execution-mode")
        manifest_path = fixture / "planning/r2_steps.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["steps"][0]["execution_mode"] = "INVALID_MODE"
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        self.assert_rejected(fixture, "invalid execution mode V00.1")


if __name__ == "__main__":
    unittest.main()
