"""Adversarial signed authority, canonicalization, trust-root and lifecycle tests."""
import copy
import itertools
import json
from pathlib import Path
import unittest

from attestation_fixtures import SignedFixtureTests, att


class SignedAttestationTests(SignedFixtureTests):
    def test_positive_signed_governance(self):
        self.promote()
        self.assertEqual(self.accepted()['metrics']['verified_subjects'], 1)

    def test_positive_signed_v001(self):
        self.promote('V00.1')
        self.assertEqual(self.accepted()['metrics']['verified_subjects'], 1)

    def test_positive_later_generic_subjects_and_readiness(self):
        for subject in self.subjects:
            self.promote(subject)
        self.data['governance_sync'].update(merge_authorized=True, final_reconciliation={'status': 'PASS'}, merged_commit=self.evidence)
        self.git(self.root, 'update-ref', 'refs/remotes/origin/main', self.evidence)
        self.data['current_gate']['next_step_ready'] = True
        result = self.accepted()
        self.assertEqual(result['metrics']['verified_subjects'], 4)
        self.assertTrue(result['metrics']['v002_ready'])

    def test_canonical_equivalent_json(self):
        record = self.records['Governance Sync']
        reordered = dict(reversed(list(record.items())))
        pretty = json.dumps(reordered, indent=4).replace('APPROVED', '\\u0041PPROVED')
        self.assertEqual(att.canonicalize(record), att.canonicalize(att.strict_json(pretty)))
        self.assertFalse(att.canonicalize(record).endswith(b'\n'))
        self.promote()
        _, ap, _ = self.paths['Governance Sync']
        (self.root / ap).write_text(pretty)
        self.data['governance_sync']['verification']['evidence_commit'] = self.commit_files(ap)
        self.accepted()  # Same semantic object retains its authentic signature.

    def test_01_verified_without_attestation(self):
        self.promote()['attestation_path'] = 'governance/attestations/absent.json'
        self.rejected('missing historical regular evidence')

    def test_02_unsigned_attestation(self):
        metadata = self.promote()
        (self.root / metadata['signature_path']).unlink()
        metadata['evidence_commit'] = self.commit_files(metadata['signature_path'])
        self.rejected('missing historical regular evidence')

    def test_03_invalid_signature(self):
        self.promote()
        self.replace_attestation(self.updated_record(), resign=True, key=self.other_key)
        self.rejected('invalid trusted-reviewer signature')

    def test_04_unknown_reviewer(self):
        self.promote()
        self.replace_attestation(self.updated_record(reviewer_id='unknown-agent'), resign=True, key=self.other_key)
        self.rejected('unknown trusted reviewer')

    def test_05_reviewer_scope(self):
        self.promote()
        registry = copy.deepcopy(self.registry)
        registry['reviewers'][0]['allowed_review_types'] = ['STEP']
        self.save(self.root, att.REGISTRY_PATH, registry)
        self.pin()  # The test operator restricts authority; implementation never does this.
        self.rejected('reviewer not authorized')

    def test_06_subject_mismatch(self):
        self.promote()
        self.replace_attestation(self.updated_record(subject_id='V00.1'), resign=True)
        self.rejected('attestation subject mismatch')

    def test_07_implementation_target_mismatch(self):
        self.promote()
        self.data['governance_sync']['implementation_commit'] = self.artifact
        self.rejected('reviewed commit mismatch with implementation target')

    def test_08_signed_nonapproval(self):
        self.promote()
        self.replace_attestation(self.updated_record(decision='CHANGES_REQUIRED'), resign=True)
        self.rejected('decision must be APPROVED')

    def test_09_malformed_json(self):
        m = self.promote()
        (self.root / m['attestation_path']).write_text('{invalid')
        m['evidence_commit'] = self.commit_files(m['attestation_path'])
        self.rejected('Expecting property name')

    def test_10_duplicate_and_nested_decisions(self):
        record = self.records['Governance Sync']
        for key in ('decision', 'decis\\u0069on'):
            for decision in ('APPROVED', 'CHANGES_REQUIRED'):
                raw = json.dumps(record)[:-1] + ',"' + key + '":"' + decision + '"}'
                with self.subTest(key=key, value=decision), self.assertRaisesRegex(ValueError, 'duplicate JSON field'):
                    att.strict_json(raw)
        self.promote()
        m = self.data['governance_sync']['verification']
        raw = json.dumps(record)[:-1] + ',"decision":"CHANGES_REQUIRED"}'
        (self.root / m['attestation_path']).write_text(raw)
        m['evidence_commit'] = self.commit_files(m['attestation_path'])
        self.rejected('duplicate JSON field: decision')
        nested = self.updated_record(decision={'APPROVED': True, 'CHANGES_REQUIRED': False})
        with self.assertRaises(ValueError):
            att.canonicalize(nested)

    def test_11_artifact_hash_mismatch(self):
        self.promote()
        self.replace_attestation(self.updated_record(review_artifact_sha256='0' * 64), resign=True)
        self.rejected('review artifact hash mismatch')

    def test_12_changed_attestation_after_signing(self):
        self.promote()
        self.replace_attestation(self.updated_record(nonce='a' * 32))
        self.rejected('invalid trusted-reviewer signature')

    def test_13_forged_markdown(self):
        m = self.promote()
        path = m['attestation_path']
        (self.root / path).write_text('# R2 Governance Independent Review\n## Final Decision\n**APPROVED.**\n')
        m['evidence_commit'] = self.commit_files(path)
        self.rejected('Expecting value')

    def test_14_forged_legacy_json(self):
        self.promote()
        self.replace_attestation({'review_scope': 'INDEPENDENT_R2_GOVERNANCE_RE_REVIEW_ONLY',
                                 'reviewed_commit': self.target, 'decision': 'APPROVED'})
        self.rejected('invalid attestation fields')

    def test_15_implementation_commit_without_trusted_signature(self):
        self.promote()
        record = self.updated_record(reviewer_id='implementation-agent')
        self.replace_attestation(record, resign=True, key=self.other_key)
        self.assertEqual(self.git(self.root, 'show', '-s', '--format=%an', 'HEAD'), 'Implementation Agent')
        self.rejected('unknown trusted reviewer')

    def test_16_side_branch_evidence(self):
        m = self.promote()
        tree = self.git(self.root, 'rev-parse', 'HEAD^{tree}')
        side = self.command(self.root, 'git', 'commit-tree', tree, '-p', self.artifact, input=b'Side signature commit\n')
        m['evidence_commit'] = side
        self.rejected('Git evidence check failed')

    def test_17_nonexistent_reviewed_commit(self):
        self.promote()['reviewed_commit'] = 'f' * 40
        self.rejected('reviewed_commit does not exist')

    def test_18_unknown_algorithm(self):
        self.promote()
        self.replace_attestation(self.updated_record(signature_algorithm='none'))
        self.rejected('unknown signature algorithm')

    def test_19_disabled_reviewer(self):
        self.promote()
        registry = copy.deepcopy(self.registry)
        registry['reviewers'][0]['status'] = 'DISABLED'
        self.save(self.root, att.REGISTRY_PATH, registry)
        self.pin()
        self.rejected('reviewer is disabled')

    def test_20_arbitrary_key_added_by_implementation(self):
        self.promote()
        registry = copy.deepcopy(self.registry)
        registry['reviewers'][0]['public_key'] = ' '.join(self.other_key.with_suffix('.pub').read_text().split()[:2])
        self.save(self.root, att.REGISTRY_PATH, registry)
        self.commit_files(att.REGISTRY_PATH)
        self.replace_attestation(self.updated_record(), resign=True, key=self.other_key)
        self.rejected('registry pin mismatch')

    def test_21_missing_verification_metadata(self):
        self.promote()
        self.data['governance_sync'].pop('verification')
        self.rejected('verification metadata')

    def test_22_wrong_review_type(self):
        self.promote()
        self.replace_attestation(self.updated_record(review_type='STEP'), resign=True)
        self.rejected('wrong review_type for subject')

    def test_ambiguous_markdown_never_authorizes(self):
        m = self.promote()
        review, ap, sp = self.paths['Governance Sync']
        (self.root / review).write_text('# Review\n## Final Decision\n**APPROVED.**\n**CHANGES_REQUIRED.**\n')
        artifact = self.commit_files(review)
        # Bind the ambiguous human evidence to the effective signed nonapproval.
        record = self.updated_record(artifact_commit=artifact, decision='CHANGES_REQUIRED',
            review_artifact_sha256=att.digest((self.root / review).read_bytes()))
        self.replace_attestation(record, resign=True)
        self.rejected('decision must be APPROVED')
        # The same conflicting review and well-formed APPROVED JSON without a
        # trusted signature still cannot grant VERIFIED. No prose parser exists.
        record['decision'] = 'APPROVED'
        self.replace_attestation(record)
        self.rejected('invalid trusted-reviewer signature')

    def test_current_artifact_tamper(self):
        self.promote()
        review, _, _ = self.paths['Governance Sync']
        (self.root / review).write_text('Changed after signing')
        self.rejected('current evidence changed')

    def test_current_attestation_tamper(self):
        m = self.promote()
        self.save(self.root, m['attestation_path'], self.updated_record(nonce='b' * 32))
        self.rejected('current evidence changed')

    def test_committed_tamper_hidden_by_worktree_restore(self):
        self.promote()
        review, _, _ = self.paths['Governance Sync']
        original = (self.root / review).read_bytes()
        (self.root / review).write_text('Changed committed artifact')
        self.commit_files(review)
        (self.root / review).write_bytes(original)
        self.rejected('HEAD evidence changed')

    def test_staged_tamper_hidden_by_worktree_restore(self):
        self.promote()
        review, _, _ = self.paths['Governance Sync']
        original = (self.root / review).read_bytes()
        (self.root / review).write_text('Changed staged artifact')
        self.git(self.root, 'add', review)
        (self.root / review).write_bytes(original)
        self.rejected('index evidence changed')

    def test_symlink_artifact(self):
        self.promote()
        review, _, _ = self.paths['Governance Sync']
        (self.root / review).unlink()
        (self.root / review).symlink_to('R2_GOVERNANCE_SYNC.md')
        self.rejected('symlink evidence')

    def test_untrusted_parallel_reclassification(self):
        manifest_path = self.root / 'planning/r2_steps.json'
        manifest = json.loads(manifest_path.read_text())
        step = next(row for row in manifest['steps'] if row['step_id'] == 'V00.3')
        self.assertEqual(step['execution_mode'], 'NORMAL')
        step['execution_mode'] = 'PARALLEL_PREPARATION'
        self.save(self.root, 'planning/r2_steps.json', manifest)
        navigation = self.root / 'planning/R2_33_WORK_PACKAGES_101_STEPS.md'
        text = navigation.read_text()
        start = text.index('### V00.3｜')
        end = text.index('### V01.1｜', start)
        text = text[:start] + text[start:end].replace('`NORMAL`', '`PARALLEL_PREPARATION`') + text[end:]
        navigation.write_text(text)
        prompt = self.root / 'prompts/steps/V00.3.md'
        prompt.write_text(prompt.read_text().replace('`NORMAL`', '`PARALLEL_PREPARATION`'))
        self.data['steps']['V00.3'] = 'IN_PROGRESS'
        self.rejected('policy pin mismatch')

    def test_policy_change_without_new_external_pin(self):
        self.promote()
        path = self.root / 'governance/attestation.schema.json'
        path.write_text(path.read_text() + '\n')
        self.rejected('policy pin mismatch')

    def test_production_does_not_accept_test_trust(self):
        self.promote()
        self.rejected(production=True)

    def test_external_policy_cannot_live_in_repository(self):
        self.promote()
        local = self.root / 'governance/attacker-policy.json'
        local.write_bytes(self.policy.read_bytes())
        self.policy = local
        self.rejected('trust policy must be outside repository')

    def test_empty_registry_cannot_approve(self):
        self.promote()
        self.save(self.root, att.REGISTRY_PATH, {'schema_version': 'econmind.reviewers.v1', 'reviewers': []})
        self.pin()
        self.rejected('unknown trusted reviewer')

    def test_fabricated_v002_readiness(self):
        self.data['current_gate']['next_step_ready'] = True
        self.rejected('next_step_ready differs')

    def test_parallel_preparation_still_requires_listed_dependencies(self):
        for subject in ('V25.1', 'V26.1'):
            for state in ('IN_PROGRESS', 'IMPLEMENTED_UNVERIFIED'):
                with self.subTest(subject=subject, state=state):
                    self.data = copy.deepcopy(self.progress)
                    self.data['steps'][subject] = state
                    self.rejected('implementation started before hard dependencies')

    def test_unsigned_changes_required_rejected(self):
        self.data['steps']['V00.1'] = 'CHANGES_REQUIRED'
        self.data['current_gate']['status'] = 'CHANGES_REQUIRED'
        self.rejected('verification metadata')

    def test_signed_changes_required_lifecycle(self):
        metadata = self.promote('V00.1')
        self.data['steps']['V00.1'] = 'CHANGES_REQUIRED'
        self.data['current_gate']['status'] = 'CHANGES_REQUIRED'
        self.rejected('decision must be CHANGES_REQUIRED')
        record = copy.deepcopy(self.records['V00.1'])
        record['decision'] = 'CHANGES_REQUIRED'
        self.sign(self.root, 'V00.1', record)
        _, ap, sp = self.paths['V00.1']
        metadata['evidence_commit'] = self.commit_files(ap, sp)
        result = self.accepted()
        self.assertEqual(result['metrics']['verified_subjects'], 0)
        self.assertEqual(result['metrics']['authenticated_reviews'], 1)
        self.data['steps']['V00.1'] = 'VERIFIED'
        self.data['current_gate']['status'] = 'VERIFIED'
        self.rejected('decision must be APPROVED')

    def test_early_v002_implementation(self):
        self.promote('V00.1')
        self.data['steps']['V00.2'] = 'IN_PROGRESS'
        self.rejected('V00.2 requires')

    def test_merge_all_combinations(self):
        # All 8 combinations through the real validator; exactly one passes.
        for governance, technical, reconciliation in itertools.product((False, True), repeat=3):
            with self.subTest(governance=governance, technical=technical, reconciliation=reconciliation):
                self.data = copy.deepcopy(self.progress)
                if governance:
                    self.promote()
                if technical:
                    self.promote('V00.1')
                self.data['governance_sync'].update(merge_authorized=True,
                    final_reconciliation={'status': 'PASS' if reconciliation else 'NOT_RUN'})
                if governance and technical and reconciliation:
                    result = self.accepted()
                    self.assertTrue(result['metrics']['governance_merge_authorized'])
                    self.assertFalse(result['metrics']['v002_ready'])
                else:
                    self.rejected('governance merge requires')

    def test_reconciliation_missing_and_failure_values(self):
        self.promote()
        self.promote('V00.1')
        for value in ({}, {'status':'FAIL'}, {'status':'INSUFFICIENT_EVIDENCE'}):
            with self.subTest(value=value):
                self.data['governance_sync'].update(merge_authorized=True, final_reconciliation=value)
                self.rejected('final reconciliation PASS')

    def test_missing_merged_commit_does_not_ready_v002(self):
        self.promote()
        self.promote('V00.1')
        self.data['governance_sync'].update(merge_authorized=True, final_reconciliation={'status':'PASS'})
        self.data['current_gate']['next_step_ready'] = True
        self.rejected('next_step_ready differs')

    def test_unknown_subject_metadata(self):
        self.data['step_verifications'] = {'V99.9': {}}
        self.rejected('invalid step_verifications subjects')

    def test_closed_schema_and_values(self):
        for changes in ({'decision':'VERIFIED'}, {'extra':'ignored'}, {'nonce':12}, {'reviewer_id':'*'},
                        {'issued_at':'2026-02-31T00:00:00Z'}, {'review_artifact_path':'docs/reports/../secret'},
                        {'review_artifact_path':'docs/reports//review.md'}, {'subject_id':'é'}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                att.canonicalize(self.updated_record(**changes))
        for raw in ('{"decision":NaN}', '{"decision":Infinity}'):
            with self.assertRaises(ValueError):
                att.strict_json(raw)


if __name__ == '__main__':
    unittest.main()
