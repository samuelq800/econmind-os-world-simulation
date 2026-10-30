import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  inspectOfficialOpeningDecisionSource,
  type OfficialOpeningSourceBytes,
} from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';
import {
  createOfficialLabourSocialOpeningAdoption,
  type OfficialLabourSocialOpeningAdoption,
} from '../../apps/world-worker/src/preparation/official-labour-social-opening-adoption.js';
import {
  createOfficialSocialOperatingSourceBindings,
  readOfficialSocialOperatingSourceField,
  requireOfficialSocialOperatingSourceValue,
  type OfficialSocialOperatingSourceBindings,
} from '../../apps/world-worker/src/preparation/official-social-operating-source-bindings.js';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => readFile(path.join(root, file), 'utf8');
const mappingBytes = await read(
  'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
);
const mapping = JSON.parse(mappingBytes) as {
  source: { dataFiles: Record<string, unknown> };
};
const bytes: OfficialOpeningSourceBytes = {
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
      Object.keys(mapping.source.dataFiles).map(async (file) => [
        file,
        await read(`artifacts/world-balanced-candidate-v1/${file}`),
      ]),
    ),
  ),
};
const inspected = inspectOfficialOpeningDecisionSource(bytes);
if (!inspected.source) throw Error(JSON.stringify(inspected.blockers));
const adoption = createOfficialLabourSocialOpeningAdoption({
  source: inspected.source,
  mappingBytes,
  ownerOriginalBytes: await read(
    'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
  ),
  ownerReceiptBytes: await read(
    'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json',
  ),
  datasets: {
    employment: bytes.datasets['data/employment.json']!,
    'population-services': bytes.datasets['data/population-services.json']!,
    regions: bytes.datasets['data/regions.json']!,
    facilities: bytes.datasets['data/facilities.json']!,
  },
});
const bindings = createOfficialSocialOperatingSourceBindings(adoption);
const school = bindings.assets.find(
  (asset) =>
    asset.countryId === 'COUNTRY_01' && asset.serviceKind === 'BASIC_EDUCATION',
)!;
const hospital = bindings.assets.find(
  (asset) =>
    asset.countryId === 'COUNTRY_01' && asset.serviceKind === 'HOSPITAL',
)!;
const selector = (asset = school, field = 'staffTarget') => ({
  kind: 'ASSET' as const,
  countryId: asset.countryId,
  economicEntityId: asset.economicEntityId,
  assetId: asset.assetId,
  field,
});
function resolvePointer(value: unknown, pointer: string): unknown {
  let result = value;
  for (const key of pointer.split('/').slice(1))
    result = (result as Record<string, unknown>)[
      key.replaceAll('~1', '/').replaceAll('~0', '~')
    ];
  return result;
}

describe('selected official social operating source bindings — no runtime admission', () => {
  it('requires the original constructor brand before reading supplied properties', () => {
    expect(() =>
      createOfficialSocialOperatingSourceBindings({ ...adoption }),
    ).toThrow('Untrusted adoption');
    let invoked = false;
    const fake = Object.defineProperty({}, 'sourceProvenance', {
      get() {
        invoked = true;
        return adoption.sourceProvenance;
      },
    });
    expect(() =>
      createOfficialSocialOperatingSourceBindings(
        fake as OfficialLabourSocialOpeningAdoption,
      ),
    ).toThrow('Untrusted adoption');
    expect(invoked).toBe(false);
  });
  it('binds the complete actual 70-country/244-asset grain and preserves all 822 gaps', () => {
    expect(bindings.assets).toHaveLength(244);
    expect(bindings.employment).toHaveLength(70);
    expect(bindings.records).toHaveLength(822);
    expect(new Set(bindings.assets.map((asset) => asset.locationId)).size).toBe(
      122,
    );
    expect(new Set(bindings.records.map((record) => record.gapKey)).size).toBe(
      822,
    );
    expect(bindings.remainingGaps).toEqual(
      adoption.gaps.filter((gap) => gap.code === 'MISSING_OPERATING_INPUT'),
    );
    expect(bindings.summary).toMatchObject({
      fullyClosedOriginalGaps: 0,
      newSourceFacts: 0,
      newlyWiredAssets: 244,
    });
    expect(
      bindings.records.every(
        (record) =>
          !record.fullyClosed &&
          record.subfields.some(
            (field) =>
              field.status === 'MISSING' || field.status === 'CONFLICT',
          ),
      ),
    ).toBe(true);
  });
  it('reads real school/hospital quantities as targets and keeps correct entity/location scope', () => {
    expect(school.locationId).toBe('REGION_01_E1');
    expect(school.economicEntityId).toBe('ENTITY_GOVERNMENT_01');
    expect(
      requireOfficialSocialOperatingSourceValue(
        bindings,
        selector(school, 'staffTarget'),
      ),
    ).toBe('771012');
    expect(
      requireOfficialSocialOperatingSourceValue(
        bindings,
        selector(school, 'capacity'),
      ),
    ).toBe('21048617');
    expect(
      requireOfficialSocialOperatingSourceValue(
        bindings,
        selector(school, 'sourceCapacityUnit'),
      ),
    ).toBe('student-seat');
    expect(
      requireOfficialSocialOperatingSourceValue(
        bindings,
        selector(hospital, 'staffTarget'),
      ),
    ).toBe('369274');
    expect(
      requireOfficialSocialOperatingSourceValue(
        bindings,
        selector(hospital, 'capacity'),
      ),
    ).toBe('316521');
    expect(
      requireOfficialSocialOperatingSourceValue(
        bindings,
        selector(hospital, 'dailyMedicalVisitsReference'),
      ),
    ).toBe('1266083');
    expect(bindings.status).toBe('SELECTED_SOURCE_BINDINGS_NOT_OPERATIONAL');
  });
  it('maps BASIC/HOSPITAL without creating a college, primary clinic, enrollment or delivered service', () => {
    expect(
      bindings.assets.filter(
        (asset) => asset.serviceKind === 'BASIC_EDUCATION',
      ),
    ).toHaveLength(122);
    expect(
      bindings.assets.filter((asset) => asset.serviceKind === 'HOSPITAL'),
    ).toHaveLength(122);
    expect(
      readOfficialSocialOperatingSourceField(
        bindings,
        selector(school, 'enrollmentAndApplicants'),
      ).status,
    ).toBe('MISSING');
    expect(
      readOfficialSocialOperatingSourceField(
        bindings,
        selector(hospital, 'newDemand'),
      ).status,
    ).toBe('MISSING');
    expect(
      readOfficialSocialOperatingSourceField(
        bindings,
        selector(hospital, 'priorBacklog'),
      ).value,
    ).toBeNull();
  });
  it('retains country employment totals once, not separately for GOV and OP', () => {
    expect(
      requireOfficialSocialOperatingSourceValue(bindings, {
        kind: 'EMPLOYMENT',
        countryId: 'COUNTRY_01',
        economicEntityId: null,
        field: 'employed',
      }),
    ).toBe('34571592');
    const country = bindings.employment[0]!;
    expect(country.economicEntityId).toBeNull();
    expect(country.employerBindings).toHaveLength(2);
    expect(() =>
      requireOfficialSocialOperatingSourceValue(bindings, {
        kind: 'EMPLOYMENT',
        countryId: 'COUNTRY_01',
        economicEntityId: school.economicEntityId as never,
        field: 'employed',
      }),
    ).toThrow('scope mismatch');
    expect(
      country.fields.find((field) => field.field === 'teachers'),
    ).toMatchObject({
      value: '771012',
      status: 'DERIVED',
      alreadyMapped: true,
    });
  });
  it('keeps the GOV employer separate from the selected OP operator proposal and actual appointment', () => {
    expect(
      requireOfficialSocialOperatingSourceValue(
        bindings,
        selector(school, 'governmentEmployerId'),
      ),
    ).toBe('ENTITY_GOVERNMENT_01');
    expect(
      requireOfficialSocialOperatingSourceValue(
        bindings,
        selector(school, 'sourceOperatorProposal'),
      ),
    ).toBe('OP-01');
    expect(() =>
      requireOfficialSocialOperatingSourceValue(
        bindings,
        selector(school, 'actualOperatorId'),
      ),
    ).toThrow('unresolved MISSING');
  });
  it.each([
    'wageAmountCurrencyPeriodVersion',
    'fundedPayrollAndObligation',
    'actualStaffEmployed',
  ])('does not manufacture %s from known targets', (field) => {
    expect(() =>
      requireOfficialSocialOperatingSourceValue(
        bindings,
        selector(school, field),
      ),
    ).toThrow('unresolved MISSING');
  });
  it('rejects teacher skill conflict and all unprovided hospital occupations rather than converting generic mixes', () => {
    expect(() =>
      requireOfficialSocialOperatingSourceValue(
        bindings,
        selector(school, 'teacherSkillSemantics'),
      ),
    ).toThrow('unresolved CONFLICT');
    for (const field of [
      'doctorsRequired',
      'nursesRequired',
      'medicalTechniciansRequired',
      'supportStaffRequired',
      'staffEmployedByOccupationAndSkill',
    ])
      expect(() =>
        requireOfficialSocialOperatingSourceValue(
          bindings,
          selector(hospital, field),
        ),
      ).toThrow('unresolved MISSING');
  });
  it('exposes exact pinned existing JSON pointers and explicitly identifies checked-parent absence evidence', async () => {
    const references = [
      ...bindings.assets.flatMap((asset) => asset.fields),
      ...bindings.employment.flatMap((country) => country.fields),
      ...bindings.records.flatMap((record) => record.subfields),
    ].flatMap((field) => field.sourceReferences);
    const cache = new Map<string, { value: unknown; hash: string }>();
    for (const reference of references) {
      if (reference.kind === 'OWNER_RULE') {
        expect(reference.pointer).toMatch(/^5\.[56]$/u);
        continue;
      }
      if (!cache.has(reference.path)) {
        const raw = await read(reference.path);
        cache.set(reference.path, {
          value: JSON.parse(raw),
          hash: createHash('sha256').update(raw).digest('hex'),
        });
      }
      const source = cache.get(reference.path)!;
      expect(reference.sha256).toBe(source.hash);
      expect(
        resolvePointer(source.value, reference.pointer),
      ).not.toBeUndefined();
    }
    const missing = bindings.records.find(
      (record) => record.field === 'wageAmountCurrencyPeriodVersion',
    )!.subfields[0]!;
    expect(missing.sourceReferences[0]?.relation).toBe('CHECKED_PARENT_RECORD');
  });
  it('rejects wrong country, employer, asset and forged bindings for value consumers', () => {
    expect(() =>
      requireOfficialSocialOperatingSourceValue(bindings, {
        ...selector(),
        countryId: 'COUNTRY_02',
      }),
    ).toThrow('scope mismatch');
    expect(() =>
      requireOfficialSocialOperatingSourceValue(bindings, {
        ...selector(),
        economicEntityId: 'ENTITY_OPERATING_01',
      }),
    ).toThrow('scope mismatch');
    expect(() =>
      requireOfficialSocialOperatingSourceValue(bindings, {
        ...selector(),
        assetId: 'OTHER_ASSET',
      }),
    ).toThrow('scope mismatch');
    expect(() =>
      requireOfficialSocialOperatingSourceValue(
        { ...bindings } as OfficialSocialOperatingSourceBindings,
        selector(),
      ),
    ).toThrow('constructor-owned');
  });
  it('is frozen and deterministic, preserving original mapped facts without a second mutable state', () => {
    expect(Object.isFrozen(bindings.assets[0]!.fields)).toBe(true);
    expect(createOfficialSocialOperatingSourceBindings(adoption)).toEqual(
      bindings,
    );
    expect(adoption.labourState).toBeNull();
    expect(adoption.seedAdmissionReady).toBe(false);
    expect(adoption.generatedHiringOrServiceEvents).toBe(false);
    for (const asset of bindings.assets)
      for (const field of asset.fields)
        if (field.status === 'KNOWN') expect(field.alreadyMapped).toBe(true);
  });
});
