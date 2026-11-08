import {
  loadPostwarIndustryFirstDayAdoptedPolicy,
  registerPostwarIndustryRefineryFirstDayFrom,
} from '../../apps/world-worker/src/persistence/postwar-industry-first-day-source.js';
/** Real pinned raw source and approved finite adoption; no DB or execution. */
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPostwarSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import {
  readPostwarIndustryRefineryCoverage,
  selectPostwarIndustryRefinerySite,
  PostwarIndustryRefineryNotApplicable,
} from '../../apps/world-worker/src/persistence/postwar-industry-refinery-sites.js';
let context: Awaited<ReturnType<typeof loadPostwarSourceContext>>;
beforeAll(async () => {
  context = await loadPostwarSourceContext(process.cwd());
});
describe('source-backed finite refinery coverage', () => {
  it('enumerates actual 21 refinery sites and exactly49 N/A countries without approving other recipes', () => {
    const actual = readPostwarIndustryRefineryCoverage(context);
    expect(actual.countries).toHaveLength(70);
    expect(actual.sites).toHaveLength(21);
    expect(actual.notApplicableCountries).toHaveLength(49);
    expect(new Set(actual.sites.map((s) => s.countryId)).size).toBe(21);
    for (const s of actual.sites) {
      expect(s.sourceFacility).toMatchObject({
        commodityId: 'REFINED_FUEL',
        recipeId: 'SCENARIO-RECIPE-REFINED_FUEL',
        constructionStatusProposal: 'OPENING_EXISTING_ASSET',
        runtimeOperational: false,
      });
      expect(s.recipe.authority).toBe('AUTHORED_CANDIDATE_NOT_CORE_APPROVED');
      expect(s.classification).toBe(
        'PINNED_ADOPTED_REFINERY_SITE_DATA_NOT_EXECUTION_OR_AUTHORITY',
      );
    }
  });
  it('keeps country10 real capacities, staff and domestic estimates distinct from country02', () => {
    const c2 = selectPostwarIndustryRefinerySite(context, {
        countryId: 'COUNTRY_02',
      }),
      c10 = selectPostwarIndustryRefinerySite(context, {
        countryId: 'COUNTRY_10',
      });
    expect(c2.facilityId).toBe('OPEN-02-REFINED_FUEL');
    expect(c10.facilityId).toBe('OPEN-10-REFINED_FUEL');
    expect(c2.sourceFacility.capacity).toBe('48548.289465');
    expect(c10.sourceFacility.capacity).toBe('77506.54582');
    expect(c2.sourceFacility.requiredWorkers).toBe('338');
    expect(c10.sourceFacility.requiredWorkers).toBe('540');
    expect(c10.domesticAccess.distanceKmEstimate).toBe('977.3831997178028');
    expect(c2.domesticAccess.distanceKmEstimate).toBe('1252.5865375359651');
    expect(c10.locationId).toBe('REGION_10_E1');
    expect(c10.operatorId).toBe('ENTITY_OPERATOR_10');
    expect(c10.sourceFacility.operatorId).toBe('OP-10');
    expect(c10.sourceFacility.ownerId).toBe('GOV-10');
    expect(c2.originals.facilitiesSha256).toBe(c10.originals.facilitiesSha256);
    expect(c2.originals.facilityPointer).not.toBe(
      c10.originals.facilityPointer,
    );
  });
  it('distinguishes no refinery from unknown source country and refuses cross-country facility substitution', () => {
    expect(() =>
      selectPostwarIndustryRefinerySite(context, { countryId: 'COUNTRY_01' }),
    ).toThrow(PostwarIndustryRefineryNotApplicable);
    expect(() =>
      selectPostwarIndustryRefinerySite(context, { countryId: 'COUNTRY_99' }),
    ).toThrow('ACTUAL_COUNTRY_NOT_FOUND');
    expect(() =>
      selectPostwarIndustryRefinerySite(context, {
        countryId: 'COUNTRY_10',
        facilityId: 'OPEN-02-REFINED_FUEL',
      }),
    ).toThrow('EXACT_COUNTRY_FACILITY');
  });
  it('rejects copied verification handles and altered source bytes before source selection', () => {
    expect(() =>
      readPostwarIndustryRefineryCoverage({
        ...context,
        source: { ...context.source },
      }),
    ).toThrow('GENUINE_PINNED_CONTEXT');
    expect(() =>
      readPostwarIndustryRefineryCoverage({
        ...context,
        sourceBytes: {
          ...context.sourceBytes,
          datasets: {
            ...context.sourceBytes.datasets,
            'data/facilities.json': '[]',
          },
        },
      }),
    ).toThrow('PINNED_SOURCE_DRIFT');
  });
  it('does not register or publish any source when the actual country has no refinery', async () => {
    const policy = await loadPostwarIndustryFirstDayAdoptedPolicy(
      process.cwd(),
    );
    let calls = 0;
    await expect(
      registerPostwarIndustryRefineryFirstDayFrom(
        {
          query: async () => {
            calls++;
            throw Error('NO_SQL_FOR_NA');
          },
        },
        {
          worldId: 'WORLD_SOURCE_NA_TEST_ONLY',
          countryId: 'COUNTRY_01',
          adoptedPolicy: policy,
          sourceContext: context,
        },
      ),
    ).rejects.toBeInstanceOf(PostwarIndustryRefineryNotApplicable);
    expect(calls).toBe(0);
  });
});
