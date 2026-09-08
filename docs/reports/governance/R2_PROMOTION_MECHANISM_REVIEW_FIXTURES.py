"""Independent review fixtures. Run with repository root; writes JSON to stdout only."""
import copy
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(sys.argv[1]).resolve()
TARGET = '40e882dc27d0fb41c4d72635cbd029af3ddc79ef'
REVIEWED = 'e7f8576ed559bd9167b67cd7493112855f65ca7e'
EVIDENCE = '992c9486745288fdac2c9004e387669037c1b740'
MD = 'docs/reports/governance/R2_GOVERNANCE_REVIEW_RECHECK.md'
JS = 'docs/reports/governance/R2_GOVERNANCE_RECHECK_VALIDATION.json'
VALIDATOR = ROOT / 'tools/validate_r2_governance.py'

def git(root, *args, input=None):
    return subprocess.run(['git', '-C', str(root), *args], input=input, text=True,
                          capture_output=True, check=True).stdout.strip()

def save(root, path, value):
    (root / path).write_text(json.dumps(value, indent=2) + '\n')

def run(root):
    p = subprocess.run([sys.executable, '-B', str(VALIDATOR), '--root', str(root), '--json'],
                       text=True, capture_output=True)
    return {'exit_code': p.returncode, 'result': json.loads(p.stdout), 'stderr': p.stderr}

assert git(ROOT, 'rev-parse', 'HEAD') == TARGET
original_status = (ROOT / 'status/progress.json').read_bytes()
original_validator = VALIDATOR.read_bytes()
output = {'reviewed_commit': TARGET, 'python': sys.version, 'baseline': run(ROOT), 'cases': []}
with tempfile.TemporaryDirectory(prefix='r2-independent-promotion-') as td:
    base = pathlib.Path(td) / 'base'
    git(ROOT, 'clone', '--quiet', '--no-hardlinks', str(ROOT), str(base))
    git(base, 'checkout', '--quiet', '--detach', TARGET)
    git(base, 'config', 'user.name', 'Implementation Agent')
    git(base, 'config', 'user.email', 'implementation@example.invalid')
    initial = json.loads((base / 'status/progress.json').read_text())
    initial['governance_sync'].update(status='VERIFIED', merge_authorized=False, verification={
        'decision': 'APPROVED', 'reviewed_commit': REVIEWED, 'evidence_commit': EVIDENCE,
        'evidence_paths': [MD, JS]})
    save(base, 'status/progress.json', initial)

    def case(name, expected, mutate=lambda f, p: None):
        f = pathlib.Path(td) / name
        shutil.copytree(base, f)
        p = copy.deepcopy(initial)
        extra = mutate(f, p)
        save(f, 'status/progress.json', p)
        actual = run(f)
        record = {'name': name, 'expected_status': expected, **actual,
                  'expectation_met': actual['result']['status'] == expected}
        if extra:
            record['fixture_details'] = extra
        output['cases'].append(record)
        shutil.rmtree(f)

    def vset(key, value):
        return lambda f, p: p['governance_sync']['verification'].__setitem__(key, value)

    case('positive_authentic', 'PASS')
    case('01_no_evidence', 'FAIL', lambda f, p: p['governance_sync'].__delitem__('verification'))
    case('02_changes_required', 'FAIL', vset('decision', 'CHANGES_REQUIRED'))
    case('03_missing_reviewed', 'FAIL', vset('reviewed_commit', '0' * 40))
    case('04_missing_evidence', 'FAIL', vset('evidence_commit', '0' * 40))
    def unrelated(f, p):
        tree = git(f, 'mktree', input='')
        vset('reviewed_commit', git(f, 'commit-tree', tree, input='Unrelated\n'))(f, p)
    case('05_wrong_ancestry', 'FAIL', unrelated)
    case('06_missing_path', 'FAIL', vset('evidence_paths', ['docs/reports/governance/R2_GOVERNANCE_REVIEW_MISSING.md']))
    case('07_different_reviewed', 'FAIL', vset('reviewed_commit', git(base, 'rev-parse', REVIEWED + '^1')))
    def working_only(f, p):
        rel = 'docs/reports/governance/R2_GOVERNANCE_REVIEW_CURRENT.md'
        (f / rel).write_text(git(f, 'show', EVIDENCE + ':' + MD))
        vset('evidence_paths', [rel])(f, p)
    case('08_working_tree_only', 'FAIL', working_only)
    case('09_implementation_report', 'FAIL', vset('evidence_paths', ['docs/reports/V00.1/IMPLEMENTATION.md']))
    case('10_premature_merge', 'FAIL', lambda f, p: p['governance_sync'].update(merge_authorized=True, final_reconciliation_gate='PASS'))
    def outside(f, p):
        side = git(f, 'commit-tree', git(f, 'rev-parse', 'HEAD^{tree}'), '-p', REVIEWED, input='Side evidence\n')
        vset('evidence_commit', side)(f, p)
    case('11_evidence_outside_head', 'FAIL', outside)
    def historical_current_edit(f, p):
        (f / MD).write_text('This current working-tree document is not approval.\n')
        (f / JS).unlink()
    case('historical_blobs_override_current', 'PASS', historical_current_edit)

    def commit_artifact(f, p, path, content, reviewed=TARGET):
        (f / path).write_text(content)
        git(f, 'add', path)
        git(f, '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Implementation agent writes own evidence')
        commit = git(f, 'rev-parse', 'HEAD')
        p['governance_sync']['verification'].update(reviewed_commit=reviewed, evidence_commit=commit, evidence_paths=[path])
        return {'evidence_commit': commit, 'reviewed_commit': reviewed, 'evidence_path': path,
                'evidence_blob': git(f, 'rev-parse', commit + ':' + path),
                'author': git(f, 'show', '-s', '--format=%an <%ae>', commit), 'content': content}

    def fake_md(f, p):
        text = '# R2 Governance Independent Review\n\n- Reviewed HEAD: `' + TARGET + '`.\n\n## Final Decision\n\n**APPROVED.**\n'
        return commit_artifact(f, p, 'docs/reports/governance/R2_GOVERNANCE_REVIEW_SELF.md', text)
    case('adversarial_self_created_markdown', 'FAIL', fake_md)
    def fake_json(f, p):
        text = json.dumps({'review_scope': 'INDEPENDENT_R2_GOVERNANCE_RE_REVIEW_ONLY',
                           'reviewed_commit': TARGET, 'decision': 'APPROVED'}) + '\n'
        return commit_artifact(f, p, JS, text)
    case('adversarial_self_created_legacy_json', 'FAIL', fake_json)
    def relabeled(f, p):
        text = '# R2 Governance Independent Review\n\n- Reviewed HEAD: `' + TARGET + '`.\n\n'
        text += (f / 'docs/reports/V00.1/IMPLEMENTATION.md').read_text()
        text += '\n## Final Decision\n\n**APPROVED.**\n'
        return commit_artifact(f, p, 'docs/reports/governance/R2_GOVERNANCE_REVIEW_IMPLEMENTATION.md', text)
    case('adversarial_relabelled_implementation', 'FAIL', relabeled)
    def nonapproved_history(f, p):
        content = git(f, 'show', EVIDENCE + ':' + MD).replace('**APPROVED.', '**CHANGES_REQUIRED.')
        details = commit_artifact(f, p, MD, content, REVIEWED)
        (f / MD).write_text(content.replace('**CHANGES_REQUIRED.', '**APPROVED.'))
        return details
    case('nonapproved_history_current_approved', 'FAIL', nonapproved_history)
    def conflicting(f, p):
        content = '# R2 Governance Independent Review\n\n- Reviewed HEAD: `' + TARGET + '`.\n\n## Final Decision\n\n**APPROVED.**\n\n**CHANGES_REQUIRED.** Approval withdrawn; do not promote.\n'
        return commit_artifact(f, p, 'docs/reports/governance/R2_GOVERNANCE_REVIEW_CONFLICT.md', content)
    case('adversarial_conflicting_final_decisions', 'FAIL', conflicting)

    def manifest(field, value):
        def edit(f, p):
            data = json.loads((f / 'planning/r2_steps.json').read_text())
            data['steps'][0][field] = value
            save(f, 'planning/r2_steps.json', data)
        return edit
    case('regression_invalid_dependency', 'FAIL', manifest('hard_dependencies', ['V99.9']))
    case('regression_step_cycle', 'FAIL', manifest('hard_dependencies', ['V00.2']))
    case('regression_execution_mode', 'FAIL', manifest('execution_mode', 'INVALID_MODE'))
    case('regression_partial_status', 'FAIL', lambda f, p: p['steps'].__setitem__('V00.1', 'PARTIAL'))
    def partial_prompt(f, p):
        path = f / 'prompts/steps/V00.1.md'
        path.write_text(path.read_text().replace('one of: `IN_PROGRESS`', 'one of: `PARTIAL`'))
    case('regression_partial_prompt', 'FAIL', partial_prompt)
    def adr(f, p):
        d = json.loads((f / 'status/decisions.json').read_text())
        d['decisions'][0].update(status='APPROVED', approval_record={'approved_by': 'IMPLEMENTATION_AGENT'})
        save(f, 'status/decisions.json', d)
    case('regression_self_approved_adr', 'FAIL', adr)
    def package_cycle(f, p):
        data = json.loads((f / 'planning/work_packages.json').read_text())
        data[0]['depends_on'] = [data[0]['id']]
        save(f, 'planning/work_packages.json', data)
    case('regression_package_cycle', 'FAIL', package_cycle)
    case('future_merge_all_declared_ready', 'FAIL', lambda f, p: (p['steps'].__setitem__('V00.1', 'VERIFIED'), p['governance_sync'].update(merge_authorized=True, final_reconciliation_gate='PASS')) and None)

assert original_status == (ROOT / 'status/progress.json').read_bytes()
assert original_validator == VALIDATOR.read_bytes()
assert git(ROOT, 'rev-parse', 'HEAD') == TARGET
output['source_status_unchanged'] = True
output['source_validator_unchanged'] = True
output['validator_sha256'] = hashlib.sha256(original_validator).hexdigest()
output['fixture_cleanup_complete'] = True
output['unexpected_acceptances'] = [c['name'] for c in output['cases'] if not c['expectation_met']]
print(json.dumps(output, indent=2))
