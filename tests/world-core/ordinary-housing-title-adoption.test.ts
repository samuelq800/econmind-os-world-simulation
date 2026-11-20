/** Actual pinned 70-country source, not invented public/private housing titles. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildOfficialPhysicalOpeningAdoption,
  PHYSICAL_OWNER_DECISION_SHA256,
} from '../../apps/world-worker/src/preparation/official-physical-opening-adoption.js';
import type { OfficialOpeningSourceBytes } from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';

const root = path.resolve(import.meta.dirname, '../..');
const read = (p: string) => readFile(path.join(root, p), 'utf8');
const mappingBytes = await read(
  'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
);
type Row = Record<string, unknown>;
const mapping = JSON.parse(mappingBytes) as {
  source: { dataFiles: Record<string, unknown> };
  records: {
    facilities: { source: Row }[];
    populationServices: {
      source: Row;
      normalizedRegionId: string;
      coreCountryId: string;
    }[];
  };
};
const owner = await read(
  'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
);
const sourceBytes: OfficialOpeningSourceBytes = {
  mappingBytes,
  checksumsBytes: await read(
    'artifacts/world-balanced-candidate-v1/CHECKSUMS.json',
  ),
  coverageBytes: await read(
    'docs/reports/world-connection/C_OFFICIAL_WORLD_COMPLETE_COVERAGE.json',
  ),
  proposalBytes: await read(
    'artifacts/E_OPENING_SEMANTIC_MAPPING_PROPOSAL_2026_10_07.md',
  ),
  datasets: Object.fromEntries(
    await Promise.all(
      Object.keys(mapping.source.dataFiles).map(async (p) => [
        p,
        await read(`artifacts/world-balanced-candidate-v1/${p}`),
      ]),
    ),
  ),
};
const adopted = buildOfficialPhysicalOpeningAdoption({
  sourceBytes,
  ownerDecisionBytes: owner,
});
const housing = adopted.facilities.filter(
  (f) => f.status === 'ADOPTED_BUILT' && f.source.projectId === 'PROJECT-36',
);

describe('ordinary housing title under the actual Owner D04 and selected source', () => {
  it('preserves all 122 exact total-stock aliases and pointers without assigning public/private title, risk or operator', () => {
    expect(housing).toHaveLength(122);
    expect(new Set(housing.map((f) => f.countryId)).size).toBe(70);
    expect(new Set(housing.map((f) => f.regionId)).size).toBe(122);
    for (const facility of housing) {
      const aliases = mapping.records.populationServices.filter(
        (s) =>
          s.normalizedRegionId === facility.regionId &&
          s.coreCountryId === facility.countryId,
      );
      expect(aliases).toHaveLength(1);
      const service = aliases[0]!;
      expect(facility.source.id).toBe(`${service.source.id}-36`);
      expect(facility.source.name).toBe('住房区域服务群');
      expect(facility.source.aggregateFacility).toBe(true);
      expect(facility.source.capacityUnit).toBe('dwelling-unit');
      expect(
        BigInt(String(facility.source.capacity).replace(/\.0+$/u, '')),
      ).toBe(BigInt(String(service.source.housingUnits)));
      expect(facility.source).toEqual(
        mapping.records.facilities[Number(facility.binding.pointer.slice(1))]!
          .source,
      );
      expect(facility.source.ownerId).toBe(
        `GOV-${facility.countryId.slice(-2)}`,
      );
      expect(facility.source.operatorId).toBe(
        `OP-${facility.countryId.slice(-2)}`,
      );
      expect(facility.titleHolderId).toBeNull();
      expect(facility.riskBearerId).toBeNull();
      expect(facility.operatorId).toBeNull();
      expect(facility.gaps).toContainEqual(
        expect.objectContaining({
          countryId: facility.countryId,
          objectId: facility.id,
          field: 'titleHolderId/riskBearerId',
          code: 'SOURCE_MISSING',
        }),
      );
      expect(facility.operatingReady).toBe(false);
      expect(facility.commissioning).toBe('UNRESOLVED');
    }
  });
  it('retains the 244 explicitly public school/hospital holders and all 658 commercial holders without treating an unbuilt public housing option as existing', () => {
    const built = adopted.facilities.filter(
      (f) => f.status === 'ADOPTED_BUILT',
    );
    const publicFacilities = built.filter((f) =>
      ['PROJECT-31', 'PROJECT-34', 'PROJECT-35'].includes(
        String(f.source.projectId),
      ),
    );
    expect(publicFacilities).toHaveLength(244);
    for (const f of publicFacilities) {
      expect(f.titleHolderId).toBe(
        `ENTITY_GOVERNMENT_${f.countryId.slice(-2)}`,
      );
      expect(f.riskBearerId).toBe(f.titleHolderId);
    }
    expect(
      built.filter((f) => f.titleHolderId?.startsWith('ENTITY_OPERATOR_')),
    ).toHaveLength(658);
    const explicitlyNamedPublicHousing = adopted.facilities.filter(
      (f) =>
        f.source.projectId === 'PROJECT-36' && f.source.name === '公共住房',
    );
    expect(explicitlyNamedPublicHousing).toHaveLength(1);
    expect(explicitlyNamedPublicHousing[0]).toMatchObject({
      id: 'SF241',
      status: 'NOT_ADOPTED_UNBUILT',
      titleHolderId: null,
      riskBearerId: null,
      operatorId: null,
      commissioning: 'NOT_BUILT',
    });
    expect(built.length).toBe(244 + 658 + 122);
  });
  it('obeys the unchanged adopted original and leaves unknown public/private/tenure records genuinely absent', () => {
    expect(createHash('sha256').update(owner).digest('hex')).toBe(
      PHYSICAL_OWNER_DECISION_SHA256,
    );
    expect(owner).toContain('普通居民住房不自动变成政府住房');
    expect(owner).toContain(
      '明确公共学校、公共医院、公共住房、警务与行政公共设施归 GOV',
    );
    for (const f of housing) {
      expect(f.source).not.toHaveProperty('titleHolderId');
      expect(f.source).not.toHaveProperty('riskBearerId');
      expect(f.source).not.toHaveProperty('publicHousingUnits');
      expect(f.source).not.toHaveProperty('privateHousingUnits');
      expect(f.source).not.toHaveProperty('tenure');
      expect(f.source.status).toBe('UNAPPROVED_SCENARIO_ASSET');
    }
    expect(adopted.runtimeEnabled).toBe(false);
    expect(adopted.seedAdmitted).toBe(false);
  });
});
