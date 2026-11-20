/** Exact adopted refinery-site DATA. Selection neither publishes authority nor
 * supplies work, maintenance, funds, logistics or utility execution. */
import { createHash } from 'node:crypto';
import type { PostwarPhysicalSourceContext } from '../preparation/postwar-physical-service-receipt.js';
import { buildOfficialPhysicalOpeningAdoption } from '../preparation/official-physical-opening-adoption.js';
import {
  inspectOfficialOpeningDecisionSource,
  isVerifiedOfficialOpeningDecisionSource,
} from '../preparation/official-opening-decision-reconciliation.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
type Data = Readonly<Record<string, unknown>>;
function row(v: unknown): Data {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw Error('REFINERY_EXACT_SOURCE_RECORD_REQUIRED');
  return v as Data;
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v)
    throw Error('REFINERY_EXACT_SOURCE_TEXT_REQUIRED');
  return v;
}
function lossless(s: string): readonly Data[] {
  const parse = JSON.parse as (
    s: string,
    revive: (
      key: string,
      value: unknown,
      context: { source?: string },
    ) => unknown,
  ) => unknown;
  const v = parse(s, (_k, value, context) =>
    typeof value === 'number' ? text(context.source) : value,
  );
  if (!Array.isArray(v)) throw Error('REFINERY_EXACT_SOURCE_ARRAY_REQUIRED');
  return v.map(row);
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
export class PostwarIndustryRefineryNotApplicable extends Error {
  readonly code = 'INDUSTRY_REFINERY_NOT_APPLICABLE' as const;
  constructor(readonly countryId: string) {
    super('INDUSTRY_REFINERY_NOT_APPLICABLE_NO_EXISTING_REFINERY:' + countryId);
  }
}
export interface PostwarIndustryRefinerySite {
  readonly classification: 'PINNED_ADOPTED_REFINERY_SITE_DATA_NOT_EXECUTION_OR_AUTHORITY';
  readonly countryId: string;
  readonly facilityId: string;
  readonly locationId: string;
  readonly operatorId: string;
  readonly sourceFacility: Data;
  readonly recipe: Data;
  readonly domesticAccess: Data;
  readonly originals: Readonly<{
    facilitiesSha256: string;
    recipesSha256: string;
    domesticAccessSha256: string;
    facilityPointer: string;
    recipePointer: string;
    domesticAccessPointer: string;
  }>;
}
export function readPostwarIndustryRefineryCoverage(
  context: PostwarPhysicalSourceContext,
): Readonly<{
  countries: readonly string[];
  sites: readonly Readonly<PostwarIndustryRefinerySite>[];
  notApplicableCountries: readonly string[];
}> {
  if (!isVerifiedOfficialOpeningDecisionSource(context?.source))
    throw Error('REFINERY_GENUINE_PINNED_CONTEXT_REQUIRED');
  const checked = inspectOfficialOpeningDecisionSource(
    context.sourceBytes,
  ).source;
  if (
    !checked ||
    checked.pins.checksumsSha256 !== context.source.pins.checksumsSha256
  )
    throw Error('REFINERY_PINNED_SOURCE_DRIFT');
  const manifest = buildOfficialPhysicalOpeningAdoption({
    sourceBytes: context.sourceBytes,
    ownerDecisionBytes: context.ownerOriginalBytes,
  });
  const raw = (key: string) => {
    const s = context.sourceBytes.datasets['data/' + key + '.json'];
    if (typeof s !== 'string')
      throw Error('REFINERY_PINNED_DATASET_MISSING:' + key);
    return { bytes: s, rows: lossless(s), sha256: sha(s) };
  };
  const facilities = raw('facilities'),
    recipes = raw('recipes'),
    domestic = raw('domestic-access');
  const sites: PostwarIndustryRefinerySite[] = [];
  for (const adopted of manifest.facilities) {
    const f = facilities.rows.find((f) => f.id === adopted.id);
    if (!f) throw Error('REFINERY_ACTUAL_FACILITY_ROW_REQUIRED');
    if (
      f.projectId !== 'PROJECT-15' ||
      f.commodityId !== 'REFINED_FUEL' ||
      f.recipeId !== 'SCENARIO-RECIPE-REFINED_FUEL' ||
      f.constructionStatusProposal !== 'OPENING_EXISTING_ASSET' ||
      f.scenarioRole !== 'OPENING_PORTFOLIO'
    )
      continue;
    if (
      adopted.status !== 'ADOPTED_BUILT' ||
      !adopted.operatorId ||
      adopted.titleHolderId !== adopted.operatorId ||
      adopted.riskBearerId !== adopted.operatorId ||
      f.aggregateFacility !== true ||
      f.conditionFraction !== '1'
    )
      throw Error('REFINERY_FINITE_EXISTING_OP_SCOPE_REQUIRED');
    const matchedRecipes = recipes.rows.filter((r) => r.id === f.recipeId),
      routes = domestic.rows.filter(
        (d) => d.fromId === f.id && d.countryId === f.countryId,
      );
    if (
      matchedRecipes.length !== 1 ||
      matchedRecipes[0]!.commodityId !== 'REFINED_FUEL' ||
      routes.length !== 1
    )
      throw Error('REFINERY_UNIQUE_RECIPE_AND_DOMESTIC_ORIGINAL_REQUIRED');
    const route = routes[0]!;
    if (
      route.id !== 'DOM-' + f.id ||
      route.mode !== 'DOMESTIC_ACCESS_SURVEY' ||
      route.status !== 'NOT_SURVEYED_NOT_OPERATIONAL'
    )
      throw Error('REFINERY_BOUNDED_DOMESTIC_SCOPE_REQUIRED');
    sites.push({
      classification:
        'PINNED_ADOPTED_REFINERY_SITE_DATA_NOT_EXECUTION_OR_AUTHORITY',
      countryId: adopted.countryId,
      facilityId: adopted.id,
      locationId: adopted.regionId,
      operatorId: adopted.operatorId,
      sourceFacility: f,
      recipe: matchedRecipes[0]!,
      domesticAccess: route,
      originals: {
        facilitiesSha256: facilities.sha256,
        recipesSha256: recipes.sha256,
        domesticAccessSha256: domestic.sha256,
        facilityPointer: '/' + facilities.rows.indexOf(f),
        recipePointer: '/' + recipes.rows.indexOf(matchedRecipes[0]!),
        domesticAccessPointer: '/' + domestic.rows.indexOf(route),
      },
    });
  }
  const countries = [
    ...new Set(manifest.facilities.map((f) => f.countryId)),
  ].sort();
  return freeze({
    countries,
    sites,
    notApplicableCountries: countries.filter(
      (c) => !sites.some((s) => s.countryId === c),
    ),
  });
}
export function selectPostwarIndustryRefinerySite(
  context: PostwarPhysicalSourceContext,
  input: Readonly<{ countryId: string; facilityId?: string }>,
): Readonly<PostwarIndustryRefinerySite> {
  const coverage = readPostwarIndustryRefineryCoverage(context);
  if (!coverage.countries.includes(input.countryId))
    throw Error('REFINERY_ACTUAL_COUNTRY_NOT_FOUND');
  const actual = coverage.sites.filter((s) => s.countryId === input.countryId);
  if (!actual.length)
    throw new PostwarIndustryRefineryNotApplicable(input.countryId);
  const selected =
    input.facilityId === undefined
      ? actual
      : actual.filter((s) => s.facilityId === input.facilityId);
  if (selected.length !== 1)
    throw Error('REFINERY_EXACT_COUNTRY_FACILITY_REQUIRED');
  return selected[0]!;
}
