import { describe, expect, it } from 'vitest';
import {
  BUNDLE_REVISION,
  MANIFEST_SHA256,
  SOURCE_INDEX,
  assemblePhysicalReference,
  readPhysicalReferenceSources,
  selectPhysicalReference,
} from '../../tools/unknown2544-g-physical-opening/reference-bundle.mjs';

const request = (countryId = 'COUNTRY_01') => ({
  bundleRevision: BUNDLE_REVISION,
  countryId,
});
const sources = readPhysicalReferenceSources(request());

describe('fixed physical construction reference publication', () => {
  it('reconstructs the original C01 reference with exact quantities and immutable output', () => {
    const result = assemblePhysicalReference(request(), sources);
    expect(result.sourceManifestHash).toBe(MANIFEST_SHA256);
    expect(result.record.geography.countryPointer).toBe('/0');
    expect(
      result.record.B02.residentOnlyNormalReference.valueExactDecimal,
    ).toBe('5275342.45');
    expect(result.record.B02.grainReferenceBasket.valueExactDecimal).toBe(
      '70337.8993333333262995434',
    );
    expect(
      result.record.B10_B11_waterAndResourcePressure.rawDeclaredPlanningWork
        .valueExactDecimal,
    ).toBe('19049847.736111112');
    expect(
      result.record.B10_B11_waterAndResourcePressure.theoreticalNetPotential
        .valueExactDecimal,
    ).toBe('17190582.5970666674688');
    expect(result.record.B10_B11_waterAndResourcePressure.recipeAuthority).toBe(
      'COUNTRY01_SCOPED_ADOPTED_COEFFICIENTS_ONLY',
    );
    expect(
      result.record.waterGeography.residentNormalRawRequirementAtProposedRecipe,
    ).toEqual({
      valueExactDecimal: null,
      numerator: '13188356125',
      denominator: '2256',
      unit: 'RAW_M3/DECLARED_PERIOD',
      roundingApplied: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.record.B02)).toBe(true);
    expect(assemblePhysicalReference(request(), sources)).toEqual(result);
  });

  it('preserves the corrected C02 root-array pointer and explicitly unadopted copied recipe', () => {
    const result = assemblePhysicalReference(request('COUNTRY_02'), sources);
    expect(result.record.geography.countryPointer).toBe('/1');
    expect(result.record.countryId).toBe('COUNTRY_02');
    expect(
      result.record.originalIds.every((id: string) =>
        id.includes('::COUNTRY_02::'),
      ),
    ).toBe(true);
    expect(result.record.B10_B11_waterAndResourcePressure.recipeAuthority).toBe(
      'NEW_COPIED_R3_COEFFICIENT_PROPOSAL_NOT_ADOPTED_FOR_THIS_COUNTRY',
    );
    expect(result.applicability.residentReferenceParameterApplicability).toBe(
      'NEW_70_COUNTRY_PROPOSAL_NOT_ADOPTED',
    );
  });

  it('selects all seven fixed chunks deterministically and verifies each ten-record reconstruction', () => {
    const selected = [];
    for (const countryId of [
      'COUNTRY_01',
      'COUNTRY_11',
      'COUNTRY_21',
      'COUNTRY_31',
      'COUNTRY_41',
      'COUNTRY_51',
      'COUNTRY_61',
    ]) {
      const result = selectPhysicalReference(request(countryId));
      selected.push(result.selectedBatch);
      expect(result.record.countryId).toBe(countryId);
      expect(result.record.originalIds).toHaveLength(9);
      expect(result.record.originClass).toBe('CONSTRUCTED_NOT_ADOPTED');
      expect(
        Object.values(result.record.actual).every((value) => value === null),
      ).toBe(true);
      expect(
        Object.values(result.record.stages).every((value) => value === false),
      ).toBe(true);
      expect(result.record.sourceAdmitted).toBe(false);
      expect(result.record.runtimeConnected).toBe(false);
      expect(result.record.productionAuthority).toBe(false);
      expect(result.record.originalFieldsClosed).toBe(0);
      expect(result.record.B02.completeProtectedFloor).toBeNull();
      expect(result.record.B12.actualMWh).toBeNull();
      expect(result.record.B13.actualTonneKm).toBeNull();
      expect(result.record.B13.C13FrozenTonnesRelabelled).toBe(false);
      expect(
        result.sourceTrace.filter((pin: { repoPath: string }) =>
          pin.repoPath.includes('/batches/'),
        ),
      ).toHaveLength(1);
    }
    expect(new Set(selected).size).toBe(7);
    const last = selectPhysicalReference(request('COUNTRY_70'));
    expect(last.record.geography.countryPointer).toBe('/69');
    expect(last.selectedBatch).toBe(selected[6]);
  });

  it.each([
    'COUNTRY_00',
    'COUNTRY_71',
    'COUNTRY_1',
    'COUNTRY_01 ',
    '../COUNTRY_01',
    'visual-territory-01',
    '',
    null,
    1,
  ])('rejects a noncanonical country %s', (countryId) => {
    expect(() =>
      selectPhysicalReference({ bundleRevision: BUNDLE_REVISION, countryId }),
    ).toThrow('CANONICAL_COUNTRY_REQUIRED');
  });
  it.each(['G_PHYSICAL_CONSTRUCTION_POINTER_V2', '', null, 3])(
    'rejects revision %s',
    (bundleRevision) => {
      expect(() =>
        selectPhysicalReference({ bundleRevision, countryId: 'COUNTRY_01' }),
      ).toThrow('BUNDLE_REVISION_MISMATCH');
    },
  );
  it.each([
    ['amount', '0'],
    ['policy', 'ADOPTED'],
    ['period', { from: '0', until: '2' }],
    ['unit', 'MWH'],
    ['worldId', 'WORLD_01'],
    ['sourceAdmitted', true],
    ['productionAuthority', true],
    ['sourcePins', SOURCE_INDEX],
    ['path', '/tmp/source'],
  ])('rejects caller override %s before source reads', (key, value) => {
    expect(() =>
      selectPhysicalReference({ ...request(), [key as string]: value }),
    ).toThrow('CLOSED_KEYS_MISMATCH:/request');
  });
  it('rejects missing request fields and source keys', () => {
    expect(() => selectPhysicalReference({ countryId: 'COUNTRY_01' })).toThrow(
      'CLOSED_KEYS_MISMATCH:/request',
    );
    const missing = { ...sources };
    delete missing.approved17;
    expect(() => assemblePhysicalReference(request(), missing)).toThrow(
      'CLOSED_KEYS_MISMATCH:/sourceBuffers',
    );
    expect(() =>
      assemblePhysicalReference(request(), {
        ...sources,
        arbitrary: Buffer.from('{}'),
      }),
    ).toThrow('CLOSED_KEYS_MISMATCH:/sourceBuffers');
  });
  it.each([
    'approved17',
    'countries',
    'OWNER_R3_BOUNDED_RECEIPT.json.txt',
    'C01_METHOD_PROPOSAL_V2.json.txt',
    'candidate-batch',
  ])('rejects pinned source drift at %s', (label) => {
    const bytes = Buffer.from(sources[label]);
    bytes[0] ^= 1;
    expect(() =>
      assemblePhysicalReference(request(), { ...sources, [label]: bytes }),
    ).toThrow(`SOURCE_DRIFT:${label}`);
  });
  it.each([
    [
      'actual value',
      '"protectedServiceFloor": null',
      '"protectedServiceFloor": "0"',
    ],
    [
      'authority',
      '"productionAuthority": false',
      '"productionAuthority": true',
    ],
    ['unit', 'NET_M3/DECLARED_PERIOD', 'MWH/DECLARED_PERIOD'],
    ['period', '"until": "1"', '"until": "2"'],
    ['pointer', '"countryPointer": "/0"', '"countryPointer": "/countries/0"'],
  ])(
    'rejects candidate %s substitution under independent source pins',
    (_name, from, until) => {
      const text = sources['candidate-batch'].toString('utf8');
      expect(text.includes(from)).toBe(true);
      const bytes = Buffer.from(text.replace(from, until));
      expect(() =>
        assemblePhysicalReference(request(), {
          ...sources,
          'candidate-batch': bytes,
        }),
      ).toThrow();
    },
  );
  it('rejects a chunk from another country range and truncated buffers', () => {
    const other = readPhysicalReferenceSources(request('COUNTRY_11'));
    expect(() => assemblePhysicalReference(request(), other)).toThrow();
    expect(() =>
      assemblePhysicalReference(request(), {
        ...sources,
        countries: sources.countries.subarray(1),
      }),
    ).toThrow('SOURCE_BYTES_REQUIRED:countries');
  });
  it('detaches subarray views without changing caller bytes', () => {
    const backing = Buffer.concat([
      Buffer.from('x'),
      sources.countries,
      Buffer.from('y'),
    ]);
    const before = Buffer.from(backing);
    expect(
      assemblePhysicalReference(request(), {
        ...sources,
        countries: backing.subarray(1, -1),
      }),
    ).toEqual(assemblePhysicalReference(request(), sources));
    expect(backing.equals(before)).toBe(true);
  });
});
