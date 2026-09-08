#!/usr/bin/env python3
"""Existing promotion/history regressions migrated to signed authority (no legacy bypass)."""
import json
import unittest
from attestation_fixtures import SignedFixtureTests


class GovernancePromotionTests(SignedFixtureTests):
    def fixture(self, name):
        self.promote()
        self.save(self.root, "status/progress.json", self.data)
        return self.root

    def _update_progress(self, fixture, operation):
        operation(self.data)

    def assert_rejected(self, fixture, error):
        self.rejected(error)

    def test_accepts_historical_independent_approved_review_evidence(self):
        self.promote()
        result = self.accepted()
        self.assertFalse(result['metrics']['governance_merge_authorized'])

    def test_rejects_verified_without_verification_object(self):
        self.promote()
        self.data['governance_sync'].pop('verification')
        self.rejected('verification metadata')

    def test_rejects_changes_required_verification_decision(self):
        self.promote()
        self.replace_attestation(self.updated_record(decision='CHANGES_REQUIRED'), resign=True)
        self.rejected('decision must be APPROVED')

    def test_rejects_nonexistent_reviewed_commit(self):
        self.promote()['reviewed_commit'] = '0' * 40
        self.rejected('reviewed_commit does not exist')

    def test_rejects_nonexistent_evidence_commit(self):
        self.promote()['evidence_commit'] = '0' * 40
        self.rejected('evidence_commit does not exist')

    def test_rejects_evidence_commit_outside_current_head_ancestry(self):
        metadata = self.promote()
        tree = self.git(self.root, 'rev-parse', 'HEAD^{tree}')
        side = self.command(self.root, 'git', 'commit-tree', tree, '-p', self.target, input=b'Side evidence\n')
        metadata['evidence_commit'] = side
        self.rejected('Git evidence check failed')

    def test_rejects_reviewed_commit_outside_evidence_ancestry(self):
        metadata = self.promote()
        tree = self.git(self.root, 'rev-parse', 'HEAD^{tree}')
        unrelated = self.command(self.root, 'git', 'commit-tree', tree, input=b'Unrelated target\n')
        metadata['reviewed_commit'] = unrelated
        self.data['governance_sync']['implementation_commit'] = unrelated
        self.rejected('Git evidence check failed')

    def test_rejects_evidence_path_missing_at_evidence_commit(self):
        self.promote()['attestation_path'] = 'governance/attestations/missing.json'
        self.rejected('missing historical regular evidence')

    def test_rejects_review_artifact_with_different_reviewed_commit(self):
        self.promote()
        self.replace_attestation(self.updated_record(reviewed_commit=self.artifact), resign=True)
        self.rejected('attestation reviewed commit mismatch')

    def test_rejects_review_artifact_without_approved_final_decision(self):
        self.promote()
        self.replace_attestation(self.updated_record(decision='BLOCKED'), resign=True)
        self.rejected('decision must be APPROVED')

    def test_rejects_review_artifact_only_in_working_tree(self):
        metadata = self.promote()
        old = self.root / metadata['attestation_path']
        new = 'governance/attestations/current-only.json'
        (self.root / new).write_bytes(old.read_bytes())
        metadata['attestation_path'] = new
        self.rejected('missing historical regular evidence')

    def test_rejects_merge_authorization_before_v001_verification(self):
        self.promote()
        self.data['governance_sync'].update(merge_authorized=True, final_reconciliation={'status':'PASS'})
        self.rejected('governance merge requires V00.1 VERIFIED')

    def test_rejects_implementation_report_as_review_authority(self):
        self.promote()['attestation_path'] = 'docs/reports/V00.1/IMPLEMENTATION.md'
        self.rejected('Expecting value')

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
