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
