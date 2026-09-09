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
  it('preserves the two owner-approved decisions and all pending proposals', () => {
    const decisions = readJson('status/decisions.json').decisions;
    const graph = readJson('requirements/adr_dependency_map.json');
    const expectedIds = Array.from(
      { length: 20 },
      (_, index) => `ADR-${String(index + 1).padStart(2, '0')}`,
    );

    expect(graph.counts.adrs).toBe(20);
    expect(graph.approval_summary).toEqual({
      approved: 2,
      proposed_not_approved: 18,
      bulk_approval_permitted: false,
    });
    expect(graph.adrs.map((adr) => adr.id)).toEqual(expectedIds);
    const approvedIds = decisions
      .filter((decision) => decision.status === 'APPROVED')
      .map((decision) => decision.id);
    expect(approvedIds).toEqual(['ADR-01', 'ADR-03']);
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
    const progress = readJson('status/progress.json');

    expect(central.scoped_continuation_records).toEqual([
      'docs/governance/WORLD_CORE_V06_CONTINUATION_POLICY.json',
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
    expect(progress.current_gate).toMatchObject({
      step_id: 'V06.3',
      status: 'VERIFIED',
      next_step: 'V07.1',
      next_step_ready: false,
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
    expect(progress.steps['V07.1']).toBe('PLANNED');
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
      v07_authorized: false,
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
      v07_authorized: false,
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
