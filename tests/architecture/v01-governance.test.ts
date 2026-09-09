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
  it('limits unverified dependency continuation to adjacent V06 steps', () => {
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
      status: 'ACTIVE',
      method: 'OWNER_AUTHORIZED_PACKAGE_CONTINUATION',
      decision: 'ACCEPTED_FOR_MAINLINE_CONTINUATION',
      allowed_steps: ['V06.1', 'V06.2', 'V06.3'],
      terminal_gate: 'V06_PACKAGE_REVIEW',
      independent_review_pending: true,
      merge_authorized: false,
      production_mutation: false,
      owner_approved: true,
    });
    expect(progress.steps['V06.1']).toBe('IMPLEMENTED_UNVERIFIED');
    expect(progress.steps['V07.1']).toBe('PLANNED');
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
