#!/usr/bin/env python3
"""Signed review verification. No signing keys or authorization from Markdown."""
from __future__ import annotations

import base64
from datetime import datetime, timezone, timedelta
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile
from typing import Any

SCHEMA = 'econmind.review-attestation.v1'
REPOSITORY_ID = 'econmind-os-world-simulation'
NAMESPACE = 'econmind-review-attestation-v1'
ALGORITHM = 'ssh-ed25519'
REGISTRY_PATH = 'governance/trust/reviewers.json'
DEFAULT_TRUST_POLICY = Path('/etc/econmind/review-trust.json')
POLICY_PATHS = (
    'tools/validate_r2_governance.py',
    'tools/review_attestation.py',
    'governance/attestation.schema.json',
    'governance/trust/reviewers.schema.json',
    'governance/SIGNED_REVIEW_ATTESTATIONS.md',
    'PLANS.md',
    'planning/r2_steps.json',
    'planning/work_packages.json',
    'requirements/source_manifest.json',
)
FIELDS = (
    'schema_version', 'repository_id', 'review_type', 'subject_id',
    'reviewed_commit', 'decision', 'artifact_commit', 'review_artifact_path',
    'review_artifact_sha256', 'reviewer_id', 'issued_at', 'nonce',
    'signature_algorithm',
)
DECISIONS = {'APPROVED', 'CHANGES_REQUIRED', 'BLOCKED'}
REVIEW_TYPES = {'GOVERNANCE', 'STEP'}
COMMIT = re.compile(r'(?:[0-9a-f]{40}|[0-9a-f]{64})\Z')
SHA256 = re.compile(r'[0-9a-f]{64}\Z')
IDENTITY = re.compile(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,63}\Z')


class AttestationError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AttestationError(message)


def strict_json(raw: bytes | str) -> Any:
    def pairs(items: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in items:
            require(key not in result, f'duplicate JSON field: {key}')
            result[key] = value
        return result

    def invalid(value: str) -> None:
        raise AttestationError(f'invalid JSON constant: {value}')

    return json.loads(raw, object_pairs_hook=pairs, parse_constant=invalid)


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def exact_fields(value: Any, fields: set[str], label: str) -> None:
    require(isinstance(value, dict) and set(value) == fields, f'invalid {label} fields')


def safe_path(value: Any) -> str:
    require(isinstance(value, str) and len(value) <= 512, 'invalid evidence path')
    require(re.fullmatch(r'[A-Za-z0-9_./-]+', value) is not None, 'invalid evidence path')
    path = PurePosixPath(value)
    require(not path.is_absolute() and '..' not in path.parts and str(path) == value,
            'unsafe evidence path')
    require(value.startswith(('docs/reports/', 'governance/attestations/')),
            'unsupported evidence path')
    return value


def canonicalize(record: Any) -> bytes:
    """Fixed-order, all-string ASCII schema; compact UTF-8 JSON, no final newline."""
    exact_fields(record, set(FIELDS), 'attestation')
    require(all(isinstance(v, str) and v.isascii() and v and len(v) <= 512
                and all(ord(c) >= 32 and ord(c) < 127 for c in v)
                for v in record.values()), 'attestation values must be printable ASCII strings')
    require(record['schema_version'] == SCHEMA, 'unsupported attestation schema')
    require(record['repository_id'] == REPOSITORY_ID, 'wrong repository_id')
    require(record['review_type'] in REVIEW_TYPES, 'wrong review_type')
    require(record['subject_id'] == 'Governance Sync' or
            re.fullmatch(r'V\d{2}\.\d+', record['subject_id']) is not None, 'invalid subject_id')
    require(record['decision'] in DECISIONS, 'invalid decision enum')
    for field in ('reviewed_commit', 'artifact_commit'):
        require(COMMIT.fullmatch(record[field]) is not None, f'invalid {field}')
    safe_path(record['review_artifact_path'])
    require(SHA256.fullmatch(record['review_artifact_sha256']) is not None, 'invalid artifact SHA-256')
    require(IDENTITY.fullmatch(record['reviewer_id']) is not None, 'invalid reviewer_id')
    require(re.fullmatch(r'[0-9a-f]{32}', record['nonce']) is not None, 'invalid nonce')
    require(re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z', record['issued_at']) is not None,
            'invalid issued_at')
    datetime.strptime(record['issued_at'], '%Y-%m-%dT%H:%M:%SZ')
    require(record['signature_algorithm'] == ALGORITHM, 'unknown signature algorithm')
    return json.dumps({key: record[key] for key in FIELDS}, ensure_ascii=True,
                      separators=(',', ':'), allow_nan=False).encode('utf-8')


def git(root: Path, *args: str) -> bytes:
    # Ignore caller-supplied Git object/config/index overrides and replacement objects.
    env = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
    env.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull, GIT_NO_REPLACE_OBJECTS='1')
    p = subprocess.run(['/usr/bin/git', '--no-replace-objects', '-c', 'core.fsmonitor=false',
                        '-C', str(root), *args], env=env, capture_output=True, timeout=15)
    require(p.returncode == 0, f'Git evidence check failed: {" ".join(args)}')
    return p.stdout


def commit_exists(root: Path, commit: Any, field: str) -> None:
    require(isinstance(commit, str) and COMMIT.fullmatch(commit) is not None, f'invalid {field}')
    try:
        git(root, 'cat-file', '-e', f'{commit}^{{commit}}')
    except AttestationError as error:
        raise AttestationError(f'{field} does not exist') from error


def ancestor(root: Path, older: str, newer: str) -> None:
    git(root, 'merge-base', '--is-ancestor', older, newer)


def regular_bytes(root: Path, relative: str) -> bytes:
    path = root / relative
    require(path.resolve().is_relative_to(root.resolve()), 'path escapes repository')
    require(not any(p.is_symlink() for p in (path, *path.parents) if p != root.parent),
            f'symlink evidence is not allowed: {relative}')
    require(path.is_file(), f'missing current evidence: {relative}')
    require(path.stat().st_size <= 4_000_000, 'evidence exceeds size limit')
    return path.read_bytes()


def historical_blob(root: Path, commit: str, relative: str) -> bytes:
    row = git(root, 'ls-tree', '-z', commit, '--', relative)
    require(row.startswith((b'100644 blob ', b'100755 blob ')) and row.count(b'\0') == 1,
            f'missing historical regular evidence: {relative}')
    require(row.split(b'\t', 1)[1] == relative.encode() + b'\0', 'historical evidence path mismatch')
    size = int(git(root, 'cat-file', '-s', f'{commit}:{relative}'))
    require(size <= 4_000_000, 'historical evidence exceeds size limit')
    return git(root, 'cat-file', 'blob', f'{commit}:{relative}')


def unchanged_evidence(root: Path, commit: str, relative: str) -> bytes:
    historical = historical_blob(root, commit, relative)
    require(historical_blob(root, 'HEAD', relative) == historical, f'HEAD evidence changed: {relative}')
    index = git(root, 'ls-files', '--stage', '-z', '--', relative)
    require(index.startswith((b'100644 ', b'100755 ')) and index.count(b'\0') == 1
            and index.split(b'\t', 1)[0].endswith(b' 0'), 'invalid index evidence')
    require(git(root, 'show', f':{relative}') == historical, f'index evidence changed: {relative}')
    require(regular_bytes(root, relative) == historical, f'current evidence changed: {relative}')
    return historical


def policy_hashes(root: Path) -> dict[str, str]:
    return {path: digest(regular_bytes(root, path)) for path in POLICY_PATHS}


def trusted_reviewers(root: Path, policy_path: Path | None) -> tuple[dict[str, Any], str]:
    raw = regular_bytes(root, REGISTRY_PATH)
    registry = strict_json(raw)
    exact_fields(registry, {'schema_version', 'reviewers'}, 'reviewer registry')
    require(registry['schema_version'] == 'econmind.reviewers.v1', 'wrong registry schema')
    require(isinstance(registry['reviewers'], list), 'reviewers must be a list')
    reviewers = {}
    for entry in registry['reviewers']:
        exact_fields(entry, {'reviewer_id', 'public_key', 'allowed_review_types', 'status'}, 'reviewer')
        rid = entry['reviewer_id']
        require(isinstance(rid, str) and IDENTITY.fullmatch(rid) is not None and rid not in reviewers,
                'invalid or duplicate reviewer_id')
        require(entry['status'] in ('ACTIVE', 'DISABLED'), 'invalid reviewer status')
        types = entry['allowed_review_types']
        require(isinstance(types, list) and types and all(isinstance(t, str) for t in types)
                and len(types) == len(set(types)) and set(types) <= REVIEW_TYPES,
                'invalid allowed_review_types')
        key = entry['public_key']
        require(isinstance(key, str) and re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/]+={0,2}', key) is not None,
                'only bare SSH Ed25519 public keys are supported')
        # Validate SSH wire encoding; signature verification itself is entirely OpenSSH.
        wire = base64.b64decode(key.split()[1], validate=True)
        require(len(wire) == 51 and wire[:19] == b'\x00\x00\x00\x0bssh-ed25519\x00\x00\x00\x20',
                'invalid Ed25519 public key encoding')
        reviewers[rid] = entry
    selected = policy_path if policy_path is not None else DEFAULT_TRUST_POLICY
    if not selected.exists():
        require(policy_path is None and not reviewers, 'TRUST_ROOT_PROVISIONING_REQUIRED')
        return {}, 'TRUST_ROOT_PROVISIONING_REQUIRED'
    require(not selected.resolve().is_relative_to(root.resolve()), 'trust policy must be outside repository')
    require(not selected.is_symlink(), 'trust policy must not be a symlink')
    anchor = strict_json(selected.read_bytes())
    exact_fields(anchor, {'schema_version', 'repository_id', 'registry_sha256', 'policy_sha256'}, 'external trust policy')
    require(anchor['schema_version'] == 'econmind.external-review-trust.v1'
            and anchor['repository_id'] == REPOSITORY_ID, 'invalid external trust policy identity')
    require(anchor['registry_sha256'] == digest(raw), 'GOVERNANCE_CRITICAL_CHANGE: registry pin mismatch')
    require(anchor['policy_sha256'] == policy_hashes(root), 'GOVERNANCE_CRITICAL_CHANGE: policy pin mismatch')
    # The executable verifier must also be the pinned implementation, not another checkout.
    for name in ('review_attestation.py', 'validate_r2_governance.py'):
        require(digest(Path(__file__).with_name(name).read_bytes()) == anchor['policy_sha256'][f'tools/{name}'],
                'executing verifier differs from trusted policy')
    return reviewers, 'PROVISIONED' if any(r['status'] == 'ACTIVE' for r in reviewers.values()) else 'TRUST_ROOT_PROVISIONING_REQUIRED'


def verify_subject(root: Path, subject: str, review_type: str, implementation_commit: Any,
                   verification: Any, reviewers: dict[str, Any], seen: set[tuple[str, str]],
                   expected_decision: str = "APPROVED") -> None:
    exact_fields(verification, {'reviewed_commit', 'evidence_commit', 'attestation_path', 'signature_path'},
                 f'{subject} verification metadata')
    target = verification['reviewed_commit']
    commit_exists(root, target, 'reviewed_commit')
    require(target == implementation_commit, f'{subject}: reviewed commit mismatch with implementation target')
    evidence = verification['evidence_commit']
    commit_exists(root, evidence, 'evidence_commit')
    ancestor(root, target, evidence)
    ancestor(root, evidence, 'HEAD')
    grafts = Path(git(root, 'rev-parse', '--git-path', 'info/grafts').decode().strip())
    if not grafts.is_absolute():
        grafts = root / grafts
    require(not grafts.exists() or grafts.stat().st_size == 0, 'Git grafts are not supported for review evidence')
    ap = safe_path(verification['attestation_path'])
    sp = safe_path(verification['signature_path'])
    require(ap != sp, 'attestation and signature paths must differ')
    raw = unchanged_evidence(root, evidence, ap)
    require(len(raw) <= 65536, 'attestation exceeds size limit')
    record = strict_json(raw)
    canonical = canonicalize(record)
    require(record['subject_id'] == subject, 'attestation subject mismatch')
    require(record['review_type'] == review_type, 'wrong review_type for subject')
    require(record['reviewed_commit'] == target, 'attestation reviewed commit mismatch')
    require(record['decision'] == expected_decision, f'attestation decision must be {expected_decision}')
    issued = datetime.strptime(record['issued_at'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)
    require(issued <= datetime.now(timezone.utc) + timedelta(minutes=5), 'attestation issued_at is in the future')
    reviewer = reviewers.get(record['reviewer_id'])
    require(reviewer is not None, 'unknown trusted reviewer; TRUST_ROOT_PROVISIONING_REQUIRED if unprovisioned')
    require(reviewer['status'] == 'ACTIVE', 'reviewer is disabled')
    require(review_type in reviewer['allowed_review_types'], 'reviewer not authorized for review type')
    signature = unchanged_evidence(root, evidence, sp)
    require(len(signature) <= 8192, 'signature exceeds size limit')
    with tempfile.TemporaryDirectory(prefix='econmind-verify-') as tmp:
        signers = Path(tmp) / 'allowed_signers'
        sig = Path(tmp) / 'review.sig'
        signers.write_text(f"{record['reviewer_id']} namespaces=\"{NAMESPACE}\" {reviewer['public_key']}\n", encoding='ascii')
        sig.write_bytes(signature)
        result = subprocess.run(['/usr/bin/ssh-keygen', '-Y', 'verify', '-f', str(signers),
                                 '-I', record['reviewer_id'], '-n', NAMESPACE, '-s', str(sig)],
                                input=canonical, capture_output=True, timeout=15)
        require(result.returncode == 0, 'invalid trusted-reviewer signature')
    artifact = record['artifact_commit']
    commit_exists(root, artifact, 'artifact_commit')
    require(target != artifact and artifact != evidence, 'review artifact and signature require subsequent commits')
    ancestor(root, target, artifact)
    ancestor(root, artifact, evidence)
    path = safe_path(record['review_artifact_path'])
    require(path not in (ap, sp), 'review artifact must be separate from attestation and signature')
    review = unchanged_evidence(root, artifact, path)
    require(historical_blob(root, evidence, path) == review, 'artifact changed at evidence commit')
    require(digest(review) == record['review_artifact_sha256'], 'review artifact hash mismatch')
    token = (record['reviewer_id'], record['nonce'])
    require(token not in seen, 'duplicate reviewer nonce')
    seen.add(token)


if __name__ == '__main__':
    import argparse
    import sys
    parser = argparse.ArgumentParser(description='Canonicalize an unsigned fixed-schema attestation; does not approve or sign.')
    parser.add_argument('attestation', type=Path)
    args = parser.parse_args()
    sys.stdout.buffer.write(canonicalize(strict_json(args.attestation.read_bytes())))
