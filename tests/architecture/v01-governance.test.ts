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
  it('preserves all 20 decisions as proposed and not approved', () => {
    const decisions = readJson('status/decisions.json').decisions;
    const graph = readJson('requirements/adr_dependency_map.json');
    const expectedIds = Array.from(
      { length: 20 },
      (_, index) => `ADR-${String(index + 1).padStart(2, '0')}`,
    );

    expect(graph.counts.adrs).toBe(20);
    expect(graph.approval_summary).toEqual({
      approved: 0,
      proposed_not_approved: 20,
      bulk_approval_permitted: false,
    });
    expect(graph.adrs.map((adr) => adr.id)).toEqual(expectedIds);
    expect(
      decisions.every(
        (decision) =>
          decision.status === 'PROPOSED_NOT_APPROVED' &&
          decision.approval_record === null,
      ),
    ).toBe(true);
    expect(
      graph.adrs.every(
        (adr) =>
          adr.decision_status === 'PROPOSED_NOT_APPROVED' &&
          adr.approval_record === null,
      ),
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
