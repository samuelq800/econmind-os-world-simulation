"""Ephemeral signing support. No production keys, registries, or statuses are used."""
import copy
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import review_attestation as att


class SignedFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='econmind-test-attestations-')
        cls.area = Path(cls.temp.name).resolve()
        cls.base = cls.area / 'base'
        cls.command(ROOT, 'git', 'clone', '--quiet', '--no-hardlinks', str(ROOT), str(cls.base))
        cls.git(cls.base, 'config', 'user.name', 'Implementation Agent')
        cls.git(cls.base, 'config', 'user.email', 'implementation@example.invalid')
        cls.git(cls.base, 'config', 'commit.gpgsign', 'false')
        for path in (*att.POLICY_PATHS, att.REGISTRY_PATH):
            dest = cls.base / path
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / path, dest)
        cls.key = cls.area / 'TEST_ONLY_PRIVATE_KEY'
        cls.other_key = cls.area / 'ATTACKER_TEST_ONLY_KEY'
        for key in (cls.key, cls.other_key):
            cls.command(cls.area, '/usr/bin/ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-C', 'ephemeral-test-only', '-f', str(key))
        cls.public = ' '.join(cls.key.with_suffix('.pub').read_text().split()[:2])
        cls.registry = {'schema_version': 'econmind.reviewers.v1', 'reviewers': [{
            'reviewer_id': 'trusted-test-reviewer', 'public_key': cls.public,
            'allowed_review_types': ['GOVERNANCE', 'STEP'], 'status': 'ACTIVE'}]}
        cls.save(cls.base, att.REGISTRY_PATH, cls.registry)
        cls.git(cls.base, 'add', *att.POLICY_PATHS, att.REGISTRY_PATH)
        cls.git(cls.base, 'commit', '--quiet', '-m', 'Test candidate policy and ephemeral public trust')
        cls.target = cls.git(cls.base, 'rev-parse', 'HEAD')
        cls.subjects = ('Governance Sync', 'V00.1', 'V00.2', 'V00.3')
        cls.paths = {}
        for subject in cls.subjects:
            stem = subject.replace(' ', '_')
            review = f'docs/reports/governance/TEST_{stem}.md'
            (cls.base / review).write_text(f'# Independent test review of {subject}\n\nHuman-readable findings.\n')
            cls.paths[subject] = (review, f'governance/attestations/{stem}.json', f'governance/attestations/{stem}.json.sig')
        cls.git(cls.base, 'add', 'docs/reports/governance')
        cls.git(cls.base, 'commit', '--quiet', '-m', 'Test review artifacts')
        cls.artifact = cls.git(cls.base, 'rev-parse', 'HEAD')
        cls.records = {}
        for subject in cls.subjects:
            review, ap, sp = cls.paths[subject]
            record = dict(schema_version=att.SCHEMA, repository_id=att.REPOSITORY_ID,
                          review_type='GOVERNANCE' if subject == 'Governance Sync' else 'STEP',
                          subject_id=subject, reviewed_commit=cls.target, decision='APPROVED',
                          artifact_commit=cls.artifact, review_artifact_path=review,
                          review_artifact_sha256=att.digest((cls.base / review).read_bytes()),
                          reviewer_id='trusted-test-reviewer', issued_at=datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                          nonce=uuid.uuid4().hex, signature_algorithm='ssh-ed25519')
            cls.records[subject] = record
            cls.sign(cls.base, subject, record)
        cls.git(cls.base, 'add', 'governance/attestations')
        cls.git(cls.base, 'commit', '--quiet', '-m', 'Test trusted reviewer attestations and signatures')
        cls.evidence = cls.git(cls.base, 'rev-parse', 'HEAD')
        cls.progress = json.loads((cls.base / 'status/progress.json').read_text())

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    @staticmethod
    def command(root, *args, input=None):
        p = subprocess.run(args, cwd=root, input=input, capture_output=True, check=True)
        return p.stdout.decode().strip()

    @classmethod
    def git(cls, root, *args):
        return cls.command(root, '/usr/bin/git', *args)

    @staticmethod
    def save(root, path, obj):
        dest = root / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(obj, indent=2) + '\n')

    @classmethod
    def sign(cls, root, subject, record, key=None):
        _, ap, sp = cls.paths[subject]
        cls.save(root, ap, record)
        canonical = cls.area / ('canonical-' + uuid.uuid4().hex)
        canonical.write_bytes(att.canonicalize(record))
        cls.command(cls.area, '/usr/bin/ssh-keygen', '-Y', 'sign', '-f', str(key or cls.key), '-n', att.NAMESPACE, str(canonical))
        shutil.copyfile(str(canonical) + '.sig', root / sp)
        canonical.unlink()
        Path(str(canonical) + '.sig').unlink()

    def setUp(self):
        self.root = self.area / self._testMethodName
        shutil.copytree(self.base, self.root)
        self.data = copy.deepcopy(self.progress)
        self.policy = self.area / (self._testMethodName + '.external-policy.json')
        self.pin()

    def tearDown(self):
        shutil.rmtree(self.root)
        self.policy.unlink(missing_ok=True)

    def pin(self):
        # Simulated trusted operator in TEST fixtures only; never used by production code.
        self.policy.write_text(json.dumps({'schema_version': 'econmind.external-review-trust.v1',
            'repository_id': att.REPOSITORY_ID, 'registry_sha256': att.digest((self.root / att.REGISTRY_PATH).read_bytes()),
            'policy_sha256': att.policy_hashes(self.root)}))

    def promote(self, subject='Governance Sync'):
        _, ap, sp = self.paths[subject]
        metadata = dict(reviewed_commit=self.target, evidence_commit=self.evidence,
                        attestation_path=ap, signature_path=sp)
        if subject == 'Governance Sync':
            self.data['governance_sync'].update(status='VERIFIED', implementation_commit=self.target, verification=metadata)
        else:
            self.data['steps'][subject] = 'VERIFIED'
            self.data.setdefault('implementation_commits', {})[subject] = self.target
            self.data.setdefault('step_verifications', {})[subject] = metadata
            if self.data['current_gate']['step_id'] == subject:
                self.data['current_gate']['status'] = 'VERIFIED'
        return metadata

    def commit_files(self, *paths):
        self.git(self.root, 'add', '--', *paths)
        self.git(self.root, 'commit', '--quiet', '-m', 'Test changed evidence')
        return self.git(self.root, 'rev-parse', 'HEAD')

    def updated_record(self, **changes):
        record = copy.deepcopy(self.records['Governance Sync'])
        record.update(changes)
        return record

    def replace_attestation(self, record, resign=False, key=None):
        _, ap, sp = self.paths['Governance Sync']
        if resign:
            self.sign(self.root, 'Governance Sync', record, key)
        else:
            self.save(self.root, ap, record)
        head = self.commit_files(ap, sp)
        self.data['governance_sync']['verification']['evidence_commit'] = head

    def result(self, production=False):
        self.save(self.root, 'status/progress.json', self.data)
        args = [sys.executable, '-B', str(ROOT / 'tools/validate_r2_governance.py'), '--root', str(self.root), '--json']
        if not production:
            args += ['--trust-policy', str(self.policy)]
        p = subprocess.run(args, capture_output=True, text=True)
        self.assertTrue(p.stdout, p.stderr)
        return p.returncode, json.loads(p.stdout)

    def accepted(self):
        code, result = self.result()
        self.assertEqual(code, 0, result['errors'])
        self.assertEqual(result['status'], 'PASS')
        return result

    def rejected(self, error='', production=False):
        code, result = self.result(production)
        self.assertEqual(code, 1, result)
        self.assertEqual(result['status'], 'FAIL')
        self.assertIn(error, '\n'.join(result['errors']))
