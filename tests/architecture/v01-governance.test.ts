import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

function readJson(path: string) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

describe('V01.1 requirements traceability', () => {
  it('maps all eight authoritative sources and every source unit', () => {
    const manifest = readJson('requirements/source_manifest.json');
    const registry = readJson('requirements/requirement_registry.json');
    const sourceUnits = readFileSync(
      resolve(root, 'requirements/source_units.jsonl'),
      'utf8',
    )
      .trim()
      .split('\n')
      .map(JSON.parse);
    const assignments = readFileSync(
      resolve(root, 'requirements/source_unit_assignments.jsonl'),
      'utf8',
    )
      .trim()
      .split('\n')
      .map(JSON.parse);

    expect(manifest).toHaveLength(8);
    expect(registry.counts.authoritative_sources).toBe(8);
    expect(registry.counts.source_units).toBe(8_743);
    expect(assignments).toHaveLength(sourceUnits.length);
    expect(new Set(assignments.map((row) => row.source_unit_id)).size).toBe(
      sourceUnits.length,
    );
    expect(assignments.every((row) => row.requirement_ids.length > 0)).toBe(
      true,
    );
  });

  it('maps all 131 fixed targets to evidence and planned ownership', () => {
    const coverage = readJson('requirements/coverage_families.json');
    const registry = readJson('requirements/requirement_registry.json');
    const requirements = registry.requirements.filter(
      (item) => item.kind !== 'source_scope',
    );

    expect(coverage.count).toBe(131);
    expect(registry.counts.fixed_targets).toBe(131);
    expect(requirements).toHaveLength(131);
    expect(requirements.every((item) => item.source_unit_refs.length > 0)).toBe(
      true,
    );
    expect(
      requirements.every(
        (item) =>
          item.planned_work_packages.length > 0 &&
          item.planned_code_owners.length > 0,
      ),
    ).toBe(true);
  });

  it('does not turn indexed or planned scope into implementation claims', () => {
    const registry = readJson('requirements/requirement_registry.json');
    expect(registry.claim_boundary).toEqual({
      documented: true,
      planned: true,
      implemented: false,
      verified_product_behavior: false,
    });
    expect(
      registry.requirements.every(
        (item) => item.implementation_status === 'PLANNED_NOT_IMPLEMENTED',
      ),
    ).toBe(true);
  });
});

describe('V01.2 ADR coordination graph', () => {
  it('preserves the owner-approved decisions and all pending proposals', () => {
    const decisions = readJson('status/decisions.json').decisions;
    const graph = readJson('requirements/adr_dependency_map.json');
    const expectedIds = Array.from(
      { length: 20 },
      (_, index) => `ADR-${String(index + 1).padStart(2, '0')}`,
    );

    expect(graph.counts.adrs).toBe(20);
    expect(graph.approval_summary).toEqual({
      approved: 11,
      proposed_not_approved: 9,
      bulk_approval_permitted: false,
    });
    expect(graph.adrs.map((adr) => adr.id)).toEqual(expectedIds);
    const approvedIds = decisions
      .filter((decision) => decision.status === 'APPROVED')
      .map((decision) => decision.id);
    expect(approvedIds).toEqual([
      'ADR-01',
      'ADR-02',
      'ADR-03',
      'ADR-05',
      'ADR-09',
      'ADR-11',
      'ADR-12',
      'ADR-16',
      'ADR-17',
      'ADR-18',
      'ADR-20',
    ]);
    expect(
      decisions
        .filter((decision) => !approvedIds.includes(decision.id))
        .every(
          (decision) =>
            decision.status === 'PROPOSED_NOT_APPROVED' &&
            decision.approval_record === null,
        ),
    ).toBe(true);
    expect(
      graph.adrs.every((adr) => {
        const decision = decisions.find((item) => item.id === adr.id);
        return (
          adr.decision_status === decision.status &&
          adr.approval_record === decision.approval_record
        );
      }),
    ).toBe(true);
  });

  it('matches affected packages and records future blocking gates', () => {
    const decisions = readJson('status/decisions.json').decisions;
    const graph = readJson('requirements/adr_dependency_map.json');
    const graphById = new Map(graph.adrs.map((adr) => [adr.id, adr]));

    for (const decision of decisions) {
      const mapped = graphById.get(decision.id);
      expect(mapped.affected_work_packages).toEqual(
        decision.affected_work_packages,
      );
      expect(mapped.latest_gate).toBe(decision.latest_gate);
      expect(mapped.future_implementation_effect).toBe(
        'BLOCK_BEFORE_LATEST_GATE_UNLESS_APPROVED',
      );
    }
    expect(graph.adr_relationships.length).toBeGreaterThan(0);
    expect(graph.adr_to_package_edges.length).toBeGreaterThan(20);
  });

  it('has no decision blocker for the coordination-only current gate', () => {
    const graph = readJson('requirements/adr_dependency_map.json');
    expect(graph.current_gate).toEqual({
      step: 'V01.2',
      unresolved_blockers: [],
      reason:
        'V01.2 records proposals and future gates; it does not select or implement an unapproved proposal.',
    });
  });
});

describe('V06 owner-authorized package continuation', () => {
  it('preserves the approved continuation history and final package closure', () => {
    const central = readJson(
      'docs/governance/FAST_MAINLINE_REVIEW_POLICY.json',
    );
    const scoped = readJson(
      'docs/governance/WORLD_CORE_V06_CONTINUATION_POLICY.json',
    );
    const v09Scoped = readJson(
      'docs/governance/WORLD_CORE_V09_CONTINUATION_POLICY.json',
    );
    const progress = readJson('status/progress.json');

    expect(central.scoped_continuation_records).toEqual([
      'docs/governance/WORLD_CORE_V06_CONTINUATION_POLICY.json',
      'docs/governance/WORLD_CORE_V07_CONTINUATION_POLICY.json',
      'docs/governance/WORLD_CORE_V08_CONTINUATION_POLICY.json',
      'docs/governance/WORLD_CORE_V09_CONTINUATION_POLICY.json',
    ]);
    expect(scoped.status).toBe('ACTIVE');
    expect(scoped.authority).toBe('RESPONSIBLE_HUMAN_OWNER');
    expect(scoped.scope).toEqual({
      branch: 'codex/world-core-v06-v10',
      first_step: 'V06.1',
      last_step: 'V06.3',
      allowed_steps: ['V06.1', 'V06.2', 'V06.3'],
      terminal_gate: 'V06_PACKAGE_REVIEW',
    });
    expect(progress.world_core_continuation).toMatchObject({
      status: 'COMPLETED',
      method: 'OWNER_AUTHORIZED_PACKAGE_CONTINUATION',
      decision: 'V06_PACKAGE_APPROVED',
      allowed_steps: ['V06.1', 'V06.2', 'V06.3'],
      terminal_gate: 'V06_PACKAGE_REVIEW',
      independent_review_pending: false,
      merge_authorized: true,
      production_mutation: false,
      owner_approved: true,
      approved_package_target: '33fe26a7e014379b15d4f0f3ab10791b912b8885',
      acceptance_record: 'docs/reports/V06/FINAL_ACCEPTANCE.md',
    });
    expect(progress.steps['V06.1']).toBe('VERIFIED');
    expect(progress.steps['V06.2']).toBe('VERIFIED');
    expect(progress.steps['V06.3']).toBe('VERIFIED');
    expect(
      progress.world_core_continuation.completed_steps['V06.2'],
    ).toMatchObject({
      implementation_commit: '4e35c07758f4d39b05dac402eeb03b080275c3e0',
      automated_evidence_status: 'PASS',
      independent_finding_status: 'CLEAR',
      review_findings_file: 'docs/reports/V06.2/REVIEW_FINDINGS.md',
      owner_continuation_record:
        'docs/reports/V06.2/OWNER_CONTINUATION_AFTER_REVIEW_UNAVAILABLE.md',
      owner_approved: true,
      review_unavailability_history: 'UNAVAILABLE_SYSTEM_ERROR',
      independent_review: 'APPROVED_FOR_CONTINUATION',
      owner_continuation_authorized: true,
      independent_closure_claimed: false,
      continuation_review: {
        decision: 'APPROVED_FOR_CONTINUATION',
        reviewed_commit: '721993d871a72e0f12c9cfd115c5b04fc7abdcab',
        bound_code_candidate: '4e35c07758f4d39b05dac402eeb03b080275c3e0',
        evidence_file: 'docs/reports/V06.2/REVIEW_CONTINUATION_FINAL.md',
        closed_p0_findings: 2,
        remaining_p0_blockers: 0,
        package_verified: false,
      },
    });
    expect(v09Scoped).toMatchObject({
      status: 'ACTIVE',
      authority: 'CONTROL_TOWER_OWNER_DELEGATION',
      scope: {
        branch: 'codex/world-core-v09',
        first_step: 'V09.1',
        last_step: 'V09.3',
        allowed_steps: ['V09.1', 'V09.2', 'V09.3'],
        terminal_gate: 'V09_PACKAGE_REVIEW',
      },
    });
    expect(progress.current_gate).toMatchObject({
      step_id: 'GATE_B_EVIDENCE_PREPARATION',
      status: 'IN_PROGRESS',
      next_step: 'GATE_B_WORLD_CORE_HARD_GATE',
      next_step_ready: false,
      next_step_blockers: [
        'full Gate B command-sequence state-machine evidence; the local 250-sequence scheduler model, 100-sequence narrow V10 lifecycle model, and 29-property / 29,000-case baseline do not replace the complete V10 lifecycle campaign',
        'real isolated PostgreSQL concurrency, transaction and controlled crash-recovery evidence',
        'browser E2E and RLS/grant negative evidence on an exact owner-approved non-production target',
      ],
      required_gate: 'GATE_B_WORLD_CORE_HARD_GATE',
      gate_status: 'PENDING',
    });
    expect(progress.v10_1_entry).toMatchObject({
      status: 'V10_1_PACKAGE_APPROVED_NEXT_GOVERNANCE_ONLY',
      branch: 'codex/v10-1-implementation',
      base_candidate: 'bacb8d6ac8623f0e527a63e969121a36740a78bc',
      approved_adrs: ['ADR-05', 'ADR-12'],
      adr_12_decision: 'docs/architecture/decisions/ADR-12.md',
      implementation_status: 'PACKAGE_REVIEWED_NEXT_GOVERNANCE_ONLY',
      implemented_increments: {
        authenticated_read_query_boundary: {
          status: 'IMPLEMENTED_UNVERIFIED',
          candidate_commit: 'fd1ee6a9fd63dc18feec50d39f3952b7500cb0f0',
          focused_tests: 'PASS — 3 files / 21 tests',
          architecture_checks: 'PASS — 9 files / 84 tests',
          production_mutation: false,
        },
        guarded_read_projection_publication: {
          status:
            'RETIRED_NO_WRITE_PATH_INDEPENDENTLY_APPROVED_FOR_CONTINUATION',
          historical_candidate_commit:
            '2709aec3974288fee290c7306d7eff5827a53d74',
          candidate_commit: 'd8282b734037ce1fa6fe1d434b8eaf04dd8de4ce',
          focused_tests: 'PASS — 2 files / 6 tests',
          architecture_checks: 'PASS — 9 files / 84 tests',
          production_mutation: false,
        },
        current_authorization_entitlement_publication: {
          status: 'IMPLEMENTED_UNVERIFIED',
          candidate_commit: '8d5fbb452f9c8371ed9e4bc465bb09724067fb7e',
          focused_tests: 'PASS — 1 file / 3 tests',
          worker_typecheck: 'PASS',
          production_mutation: false,
        },
        source_bound_country_office_activity_publication: {
          status: 'IMPLEMENTED_UNVERIFIED',
          candidate_commit: '2ac1b67573336a751af2e27839372e872333417d',
          focused_tests: 'PASS — 2 files / 5 tests',
          worker_typecheck: 'PASS',
          production_mutation: false,
        },
        country_office_source_to_query_flow_evidence: {
          status: 'LOCAL_TEST_PASS_NOT_OPERATIONAL_EVIDENCE',
          candidate_commit: 'c5669dac74796e7e796661e8320a64b50ee8ec7c',
          focused_tests: 'PASS — 1 file / 2 tests',
          production_mutation: false,
        },
      },
      package_audit_target: 'ba46856fdcf6458156e044a4cbc6112e9e6502b5',
      package_audit_status: 'AUDIT_REQUESTED',
      package_audit_request: 'docs/reports/V10/V10.1_PACKAGE_AUDIT_REQUEST.md',
      package_review_target: 'ba46856fdcf6458156e044a4cbc6112e9e6502b5',
      package_review_evidence_wrapper:
        'b25ba34c560a0142ae017132490c01c74cce0d63',
      package_review_result:
        'V10_1_PACKAGE_APPROVED_FOR_NEXT_GOVERNANCE_ONLY — BLOCKER_0_MAJOR_0_MINOR_0',
      package_review_evidence: 'docs/reports/V10/V10.1_PACKAGE_REVIEW.md',
      required_exit: 'NEXT_GOVERNANCE_DECISION',
      merge_authorized: false,
      production_access: false,
      production_mutation: false,
    });
    expect(progress.steps['V10.1']).toBe(
      'PACKAGE_REVIEWED_NEXT_GOVERNANCE_ONLY',
    );
    expect(progress.v10_2_adr_entry).toEqual({
      status: 'V10_2_PACKAGE_APPROVED_NEXT_GOVERNANCE_ONLY',
      adr_09_decision: 'docs/architecture/decisions/ADR-09.md',
      continuation_policy:
        'docs/governance/WORLD_CORE_V10_2_CONTINUATION_POLICY.json',
      owner_authorization:
        'docs/reports/V10/V10.2_OWNER_IMPLEMENTATION_AUTHORIZATION.md',
      v10_1_hard_dependency:
        'NOT_YET_DECLARED_COMPLETE_OWNER_BUILD_AUTHORIZATION_DOES_NOT_CLOSE_DEPENDENCY',
      implementation_authorized: true,
      initial_independent_review_target:
        '59b088ed84e022aacbb29a6bca47be1891b4bcf5',
      initial_independent_review_result:
        'CHANGES_REQUIRED_LOCAL — BLOCKER_0_MAJOR_1_MINOR_1; missing below-threshold enforcement',
      implementation_candidate: 'a468d43be86617aebcb6cbde1a5114ee0414e849',
      implementation_status: 'IMPLEMENTED_UNVERIFIED',
      focused_tests: 'PASS — 1 file / 4 tests',
      repair_checks:
        'PASS — core typecheck; architecture 9 files / 84 tests; boundary and authoritative-pattern scans PASS',
      independent_review_target: '6d37b88d880af9515ccc3e2f450d65085b8cf903',
      independent_review_result:
        'APPROVED_FOR_V10_2_CONTINUATION_ONLY — BLOCKER_0_MAJOR_0_MINOR_0; closes threshold and focused-coverage findings for the core increment only',
      independent_review:
        'CORE_INCREMENT_CLOSED_NEXT_DURABLE_PERSISTENCE_CANDIDATE_REQUIRES_OWN_REVIEW',
      durable_persistence_reviewed_target:
        '7eecbabc989bab5798790ed10256299273ff154b',
      durable_persistence_review_result:
        'CHANGES_REQUIRED — BLOCKER_1_MAJOR_0_MINOR_0; authorization cutoff used FOR KEY SHARE and did not serialize revocation',
      durable_persistence_candidate: '64d2389d7cbec618684e5bcacde913e4d2c31b7d',
      durable_persistence_status:
        'IMPLEMENTED_REPAIR_REVIEWED_PACKAGE_UNVERIFIED',
      durable_persistence_checks:
        'PASS — Worker typecheck; 4 files / 30 focused V09/V10 core/schema/cutoff tests including runtime FOR UPDATE cutoff-query contract; target lint; architecture 9 files / 84 tests; local migration validation and clean/existing-schema rehearsal',
      durable_persistence_repair_reviewed_target:
        '64d2389d7cbec618684e5bcacde913e4d2c31b7d',
      durable_persistence_repair_review_result:
        'APPROVED_REPAIR_ONLY — BLOCKER_0_MAJOR_0_MINOR_0; FOR UPDATE cutoff lock and runtime query contract verified',
      durable_persistence_independent_review:
        'APPROVED_REPAIR_ONLY_V10_2_PACKAGE_REVIEW_REMAINS_REQUIRED',
      durable_persistence_independent_review_target:
        '64d2389d7cbec618684e5bcacde913e4d2c31b7d',
      package_review_target: '64d2389d7cbec618684e5bcacde913e4d2c31b7d',
      package_review_evidence_wrapper:
        '07c9a5fd1bb8835c01c65d1b5687a737ce766b78',
      package_review_result:
        'V10_2_PACKAGE_APPROVED_FOR_NEXT_GOVERNANCE_ONLY — BLOCKER_0_MAJOR_0_MINOR_0',
      package_review_evidence: 'docs/reports/V10/V10.2_PACKAGE_REVIEW.md',
      required_exit: 'NEXT_GOVERNANCE_DECISION',
      merge_authorized: false,
      production_access: false,
      production_mutation: false,
    });
    expect(progress.owner_completed_work_approval).toEqual({
      status: 'APPROVED_FOR_DEVELOPMENT_BASELINE',
      approval_record:
        'docs/governance/WORLD_CORE_HISTORICAL_COMPLETED_WORK_APPROVAL.md',
      operational_evidence_reclassified: false,
      production_access: false,
      production_mutation: false,
    });
    expect(progress.v09_entry).toMatchObject({
      status: 'ACTIVE',
      branch: 'codex/world-core-v09',
      branch_base: 'b7c39497c48f5e28305a2e01bf02d11b68e4fb99',
      authoritative_main: 'b7c39497c48f5e28305a2e01bf02d11b68e4fb99',
      adr_18_decision_commit: 'b7c39497c48f5e28305a2e01bf02d11b68e4fb99',
      preflight: 'GO',
      approved_adrs: ['ADR-03', 'ADR-17', 'ADR-18', 'ADR-20'],
      deferred_adrs: ['ADR-04'],
      migration: 'NOT_CREATED',
      production_mutation: false,
      owner_approved: true,
      authority: 'CONTROL_TOWER_OWNER_DELEGATION',
    });
    expect(progress.v09_continuation).toMatchObject({
      status: 'ACTIVE',
      method: 'OWNER_AUTHORIZED_PACKAGE_CONTINUATION',
      decision: 'ACCEPTED_FOR_MAINLINE_CONTINUATION',
      branch: 'codex/world-core-v09',
      allowed_steps: ['V09.1', 'V09.2', 'V09.3'],
      terminal_gate: 'V09_PACKAGE_REVIEW',
      independent_review_pending: true,
      merge_authorized: false,
      production_mutation: false,
      owner_approved: true,
      authority: 'CONTROL_TOWER_OWNER_DELEGATION',
      completed_steps: {},
    });
    expect(progress.v08_integration).toMatchObject({
      branch: 'codex/world-core-v08',
      approved_package_target: 'b3a1f4949efa85d1c310819ebdf37505589f1b49',
      owner_acceptance_commit: '9cc753807d31a8ccfd963430d33ffa4863b65b28',
      promotion_commit: '3dbcb67ad3c0816c091f2c4a64a08d4b9a6d66a3',
      status: 'MERGED',
      merged_commit: '7a4996339dcfcf54ece8f75e918e6b22fe165970',
      history_preserved: true,
      runtime_equivalence: 'PASS',
      production_mutation: false,
      evidence_file: 'docs/reports/V08/FINAL_RECONCILIATION.md',
    });
    expect(progress.v08_entry).toMatchObject({
      status: 'COMPLETED',
      branch: 'codex/world-core-v08',
      branch_base: '403b97e6a2ae36cb7b250b1ce23fa128e9a5cbec',
      authoritative_main: 'ec3ceff57b2657b374432b5ab3b4cbc1f78e003d',
      decision_commit: '93087392ca28b2ccda70d6647f4f7af024b3f317',
      decision_main_merge: 'ec3ceff57b2657b374432b5ab3b4cbc1f78e003d',
      branch_reconciliation: 'd3c484a2a9fbeb08efbe9f1715018ac000ee53d6',
      preflight: 'GO',
      approved_adrs: ['ADR-02', 'ADR-05', 'ADR-17'],
      deferred_adrs: ['ADR-07'],
      not_current_gate_adrs: ['ADR-08'],
      production_mutation: false,
      owner_approved: true,
      v08_2: {
        status: 'VERIFIED',
        preflight: 'GO',
        dependency_method: 'OWNER_AUTHORIZED_PACKAGE_CONTINUATION',
        approved_adrs: ['ADR-02', 'ADR-17'],
        not_current_gate_adrs: ['ADR-07', 'ADR-08'],
        migration: 'NOT_CREATED',
        production_mutation: false,
        implementation_commit: '08350cfa5081668c34e4104b40ae39384ec026a2',
        historical_implementation_commit:
          'f5c022c7957a1128660d25e36ea46df99964a850',
        evidence_file:
          'docs/reports/V08.2/TEST_EVIDENCE_BLOCKER_FORWARD_FIX.json',
      },
      v08_3: {
        status: 'VERIFIED',
        preflight: 'GO',
        dependency_method: 'OWNER_AUTHORIZED_PACKAGE_CONTINUATION',
        approved_adrs: ['ADR-02', 'ADR-05', 'ADR-17'],
        not_current_gate_adrs: ['ADR-07', 'ADR-08'],
        migration: 'NOT_CREATED',
        production_mutation: false,
        implementation_commit: '08350cfa5081668c34e4104b40ae39384ec026a2',
        historical_implementation_commit:
          '4f0da4104b928f3504c50164147324c8af0deab5',
        evidence_file:
          'docs/reports/V08.3/TEST_EVIDENCE_BLOCKER_FORWARD_FIX.json',
      },
    });
    expect(progress.v08_continuation).toMatchObject({
      status: 'COMPLETED',
      method: 'OWNER_AUTHORIZED_PACKAGE_CONTINUATION',
      decision: 'V08_PACKAGE_APPROVED',
      branch: 'codex/world-core-v08',
      allowed_steps: ['V08.1', 'V08.2', 'V08.3'],
      terminal_gate: 'V08_PACKAGE_REVIEW',
      independent_review_pending: false,
      merge_authorized: true,
      production_mutation: false,
      owner_approved: true,
      completed_steps: {
        'V08.1': {
          implementation_commit: '08350cfa5081668c34e4104b40ae39384ec026a2',
          historical_implementation_commit:
            'a73c35d32d93f4067ab4e6228dbb65a4ab64734e',
          automated_evidence_status: 'PASS',
          open_recorded_p0_blockers: 0,
          historical_open_recorded_p0_blockers: 2,
          open_recorded_p1_majors: 0,
          historical_independent_review:
            'CHANGES_REQUIRED_ON_HISTORICAL_TARGET',
          independent_review: 'V08_PACKAGE_APPROVED',
          finding_implementation_state: 'CLOSED_BY_FOCUSED_INDEPENDENT_REVIEW',
          status: 'VERIFIED',
        },
        'V08.2': {
          implementation_commit: '08350cfa5081668c34e4104b40ae39384ec026a2',
          historical_implementation_commit:
            'f5c022c7957a1128660d25e36ea46df99964a850',
          automated_evidence_status: 'PASS',
          open_recorded_p0_blockers: 0,
          historical_open_recorded_p0_blockers: 2,
          open_recorded_p1_majors: 0,
          historical_independent_review:
            'CHANGES_REQUIRED_ON_HISTORICAL_TARGET',
          independent_review: 'V08_PACKAGE_APPROVED',
          finding_implementation_state: 'CLOSED_BY_FOCUSED_INDEPENDENT_REVIEW',
          status: 'VERIFIED',
        },
        'V08.3': {
          implementation_commit: '08350cfa5081668c34e4104b40ae39384ec026a2',
          historical_implementation_commit:
            '4f0da4104b928f3504c50164147324c8af0deab5',
          automated_evidence_status: 'PASS',
          open_recorded_p0_blockers: 0,
          historical_open_recorded_p0_blockers: 2,
          open_recorded_p1_majors: 0,
          historical_independent_review:
            'CHANGES_REQUIRED_ON_HISTORICAL_TARGET',
          independent_review: 'V08_PACKAGE_APPROVED',
          finding_implementation_state: 'CLOSED_BY_FOCUSED_INDEPENDENT_REVIEW',
          status: 'VERIFIED',
        },
      },
    });
    expect(progress.v08_package_review).toMatchObject({
      status: 'V08_PACKAGE_APPROVED',
      package_status: 'VERIFIED',
      review_target: 'b3a1f4949efa85d1c310819ebdf37505589f1b49',
      superseded_review_target: 'c44885fdf0c639d3cce6c1e337b21042ab647965',
      target_file:
        'docs/reports/V08/PACKAGE_REVIEW_TARGET_BLOCKER_FORWARD_FIX.md',
      open_recorded_p0_blockers: 0,
      historical_open_recorded_p0_blockers: 2,
      open_recorded_p1_majors: 0,
      independent_review: 'V08_PACKAGE_APPROVED',
      latest_independent_decision: 'V08_PACKAGE_APPROVED',
      finding_implementation_state: 'CLOSED_BY_FOCUSED_INDEPENDENT_REVIEW',
      owner_decision: 'OWNER_POLICY_AUTO_ACCEPTANCE',
      authority: 'PROJECT_OWNER_DIRECT_CONFIRMATION',
      package_verified: true,
      merge_authorized: true,
      final_baseline_before_merge: 'PASS',
      final_closure_record: 'docs/reports/V08/FINAL_CLOSURE.md',
      production_access: false,
      production_mutation: false,
      v09_started: true,
    });
    expect(progress.work_packages.V08).toBe('VERIFIED');
    expect(progress.work_packages.V09).toBe('IN_PROGRESS');
    expect(progress.v07_package_review).toMatchObject({
      status: 'V07_PACKAGE_APPROVED',
      package_status: 'VERIFIED',
      content_commit: '563a96490f207d94a3110dbf9c7a037f23b46923',
      review_target: '079fa9d230d5109488a1e5ea82e97f81845c49eb',
      superseded_review_target: '7cd856380e93020dabe8fb969472f9a18ce773cd',
      latest_independent_decision: 'V07_PACKAGE_APPROVED',
      reviewed_target: '079fa9d230d5109488a1e5ea82e97f81845c49eb',
      pending_independent_closure: {
        blockers: [],
        majors: [],
        minor_deferred: ['V07-PKG-MIN-01'],
      },
      open_p0_blockers: 0,
      open_p1_majors: 0,
      owner_acceptance_commit: 'e7cdaf0aaeb83ebe63c62208c512fcb251158929',
      owner_decision: 'ACCEPTED',
      authority: 'PROJECT_OWNER_ACCEPTANCE',
      package_verified: true,
      merge_authorized: true,
      production_release_authorized: true,
      production_access: false,
      production_mutation: false,
      v08_started: false,
    });
    expect(progress.v06_integration).toEqual({
      branch: 'codex/world-core-v06-v10',
      approved_package_target: '33fe26a7e014379b15d4f0f3ab10791b912b8885',
      owner_acceptance_commit: '7dc882c38c8559a547db5793b0c408dc28d82c16',
      promotion_commit: 'a4dd1147407e3be8ad1ca9a41db5711ed6fa3c4c',
      status: 'MERGED',
      merged_commit: '7b70b9400c9615da41b62847110c51767d400537',
      history_preserved: true,
      runtime_equivalence: 'PASS',
      production_mutation: false,
      evidence_file: 'docs/reports/V06/FINAL_RECONCILIATION.md',
    });
    expect(
      progress.world_core_continuation.completed_steps['V06.3'],
    ).toMatchObject({
      implementation_commit: 'd9a84bd0198ecdcc2a9fe739c1eb900dc4e4cef1',
      automated_evidence_status: 'PASS',
      finding_ids: ['V06-PKG-BLK-01', 'V06-PKG-BLK-02'],
      independent_closure: 'CLOSED',
      package_review_pending: false,
      package_verified: true,
    });
    expect(progress.steps['V07.1']).toBe('VERIFIED');
    expect(progress.steps['V07.2']).toBe('VERIFIED');
    expect(progress.steps['V07.3']).toBe('VERIFIED');
    expect(progress.v07_entry).toMatchObject({
      status: 'COMPLETED',
      branch: 'codex/world-core-v07',
      main_baseline: '026671eca6b85bc6e5f1c99878c6f8d740f2fb21',
      current_main: '5fb526c40345a46db7e355e257057295ce0d670f',
      decision_commit: 'e5e4a3291fd2e77ff16173d88f631ea131badf34',
      adr_16_20_decision_commit: 'ec0f67d1e8e618bd0cf77089a0fd615cb10e0f5e',
      adr_16_20_main_merge: '24c05f8d907a5c100a6918bba662bdb0da90dfac',
      preflight: 'GO',
      approved_adrs: ['ADR-11', 'ADR-16', 'ADR-17', 'ADR-20'],
      next_adr_gate: 'SATISFIED_FOR_V07.2',
      candidate_migration_merge_gate:
        'SATISFIED_BY_V07_PACKAGE_REVIEW_AND_OWNER_PROMOTION',
      implementation_result: {
        status: 'VERIFIED',
        code_candidate: 'b8c8555bac1f5e8d36d1f147732a691f248431f8',
        migration_provenance_commit: '039ffd3226a3cb780b94c624bd87b32bdc48ee67',
        acceptance_target: 'e5840f76bb6a06c636f1f2575e3245b1f7734bd9',
        evidence_commit: '4ed6f823eb7b8bc1a6e208184314153652aeb104',
        automated_evidence: 'PASS',
        review_target: 'cea9554c5ad9c3ad69e0ec538c908901660ec761',
        review_target: 'b57b6aa9cd349776e1f5cd8ae10d20413523a69c',
        independent_review: 'V07_PACKAGE_APPROVED',
        open_p0_blockers: 0,
        open_p1_majors: 0,
        active_code_candidate: '674e6cdf38bb2d52d3ec81d52616bb85a3cfd58f',
        active_review_target: '66da354755326fc00ece7fcdb78e35db27f0b15f',
        review_b_result: 'APPROVED_FOR_CONTINUATION',
        fingerprint_forward_fix: {
          status: 'CLOSED_FOR_CONTINUATION',
          finding:
            'correlationId trace metadata participated in authoritative Command fingerprint',
          fixed_code_candidate: '674e6cdf38bb2d52d3ec81d52616bb85a3cfd58f',
          automated_evidence: 'PASS',
          independent_closure: 'APPROVED_FOR_CONTINUATION',
          production_mutation: false,
        },
      },
      production_mutation: false,
      package_review: 'V07_PACKAGE_APPROVED',
      owner_acceptance: 'ACCEPTED',
      owner_acceptance_commit: 'e7cdaf0aaeb83ebe63c62208c512fcb251158929',
      production_release_authorized: true,
      owner_approved: true,
      v07_2: {
        status: 'VERIFIED',
        code_candidate: '7e4b21e0cc70e878080a777874dad491a21501aa',
        migration_artifact_source_commit:
          '6f919d3a20835da39a042ee7863d849f140f4e0c',
        review_target: '563a96490f207d94a3110dbf9c7a037f23b46923',
        automated_evidence: 'PASS',
        independent_review: 'V07_PACKAGE_APPROVED',
        open_p0_blockers: 0,
        open_p1_majors: 0,
        production_mutation: false,
      },
      v07_3: {
        status: 'VERIFIED',
        code_candidate: '2b42e0d725da590a24e845a7046501af8f8d4c01',
        review_target: '21299492a4acb47b5383056417bba22acbc214b2',
        automated_evidence: 'PASS',
        independent_review: 'V07_PACKAGE_APPROVED',
        open_p0_blockers: 0,
        open_p1_majors: 0,
        migration_change: false,
        production_mutation: false,
      },
    });
    expect(progress.v07_integration).toEqual({
      branch: 'codex/world-core-v07',
      approved_package_target: '079fa9d230d5109488a1e5ea82e97f81845c49eb',
      owner_acceptance_commit: 'e7cdaf0aaeb83ebe63c62208c512fcb251158929',
      promotion_commit: '35ca483dc6e72bbcfc6d71202c3916f2a326dd76',
      status: 'MERGED',
      merged_commit: '5fb526c40345a46db7e355e257057295ce0d670f',
      history_preserved: true,
      runtime_equivalence: 'PASS',
      application_deployment: 'NOT_APPLICABLE',
      migration_handoff_repository: 'https://github.com/samuelq800/econmind-os',
      migration_handoff_branch: 'codex/world-v07-production-release',
      migration_handoff_commit: '169efc39d1ed7f47ba3430abd0e54b03e6f5fd02',
      production_migration_release: 'PRODUCTION_MIGRATION_RELEASE_READY',
      publisher_preflight: 'FAIL_REMOTE_MIGRATION_HISTORY_DIVERGENCE',
      publisher_preflight_run:
        'https://github.com/samuelq800/econmind-os/actions/runs/34457850502',
      production_mutation: false,
      evidence_file: 'docs/reports/V07/FINAL_RECONCILIATION.md',
    });
    expect(progress.v06_package_review).toMatchObject({
      decision: 'V06_PACKAGE_APPROVED',
      reviewed_commit: '33fe26a7e014379b15d4f0f3ab10791b912b8885',
      bound_v06_3_code_candidate: 'd9a84bd0198ecdcc2a9fe739c1eb900dc4e4cef1',
      open_blockers: 0,
      open_majors: 0,
      closed_findings: ['V06-PKG-BLK-01', 'V06-PKG-BLK-02'],
      package_verified: true,
      merge_authorized: true,
      owner_decision: 'ACCEPTED',
      authority: 'PROJECT_OWNER_ACCEPTANCE',
      v07_authorized: true,
    });
    expect(
      progress.v06_package_re_review.restore_prefix_forward_fix,
    ).toMatchObject({
      status: 'CLOSED',
      finding: 'V06-PKG-BLK-02',
      code_candidate: 'd9a84bd0198ecdcc2a9fe739c1eb900dc4e4cef1',
      step_review_target: '12d81d4fca1d37240a4af39183f69f12d60415aa',
      implementation_result: 'PASS',
      independent_closure_claimed: true,
      reviewed_package_target: '33fe26a7e014379b15d4f0f3ab10791b912b8885',
      decision: 'V06_PACKAGE_APPROVED',
    });
    expect(progress.v06_package_re_review).toMatchObject({
      status: 'V06_PACKAGE_APPROVED',
      finding_id: 'V06-PKG-BLK-01',
      forward_fix_code_candidate: '7a6ad76d7e43f96a143a4620afc33c8b107261e0',
      forward_fix_step_target: '3d21e94483ae923b60dc4a6a8a3e1cd1d64e80ec',
      reviewed_package_target: '33fe26a7e014379b15d4f0f3ab10791b912b8885',
      review_mode: 'LIGHTWEIGHT_TARGETED_RE_REVIEW',
      implementation_result: 'PASS',
      independent_closure_claimed: true,
      closed_findings: ['V06-PKG-BLK-01', 'V06-PKG-BLK-02'],
      open_findings: [],
      package_verified: true,
      merge_authorized: true,
      v07_authorized: true,
    });
  });
});

describe('V01.3 two-repository integration contract', () => {
  it('freezes a minimal identity whitelist without portable authorization', () => {
    const contract = readJson(
      'requirements/two_repository_integration_contract.json',
    );
    expect(contract.shared_identity.profile_field_whitelist).toEqual([
      'user_id',
      'display_name',
      'school_id',
    ]);
    expect(
      contract.shared_identity.prohibited_shared_fields_or_assumptions,
    ).toEqual(
      expect.arrayContaining([
        'role',
        'platform_role',
        'team membership as an unverified portable claim',
        'country assignment as an unverified portable claim',
        'office assignment as an unverified portable claim',
        'service_role key',
      ]),
    );
    expect(contract.shared_identity.authorization_rule).toContain(
      'server-side',
    );
  });

  it('preserves V1, League, and Legacy route behavior', () => {
    const contract = readJson(
      'requirements/two_repository_integration_contract.json',
    );
    const routes = contract.route_contract.main_site_preserved.map(
      (item) => item.route,
    );
    expect(routes).toEqual([
      '/world',
      '/simulation/world and descendants',
      '/league/world and descendants',
      '/simulation/legacy-world and descendants',
      '/country, /lobby, /room, /results, /replay, /view',
    ]);
    expect(contract.route_contract.world_v2.during_v01).toContain(
      'No existing',
    );
    expect(contract.route_contract.world_v2.token_transport).toContain('never');
  });

  it('keeps every non-V2 system outside World V2 authority', () => {
    const contract = readJson(
      'requirements/two_repository_integration_contract.json',
    );
    expect(contract.ownership.never_world_v2_authority).toEqual(
      expect.arrayContaining([
        'main site',
        'V1 World',
        'League',
        'Legacy World',
        'browser or UI state',
      ]),
    );
    expect(contract.world_v2_authoritative_boundary.source_of_truth_count).toBe(
      1,
    );
    expect(
      contract.world_v2_authoritative_boundary.authoritative_execution_host,
    ).toBe('apps/world-worker');
    expect(contract.world_v2_authoritative_boundary.non_authoritative_ui).toBe(
      'apps/world-web',
    );
  });

  it('prohibits legacy economic state and authority reuse', () => {
    const contract = readJson(
      'requirements/two_repository_integration_contract.json',
    );
    const prohibited =
      contract.legacy_reuse.prohibited_as_world_v2_state_or_authority.join(' ');
    expect(prohibited).toContain('balances');
    expect(prohibited).toContain('Supabase mutations');
    expect(prohibited).toContain('settlement');
    expect(prohibited).toContain('client role checks');
    expect(contract.implementation_claim).toBe(false);
    expect(contract.next_gate).toBe('V01_PACKAGE_LEVEL_REVIEW');
  });
});
