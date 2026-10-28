/** Server-owned source custody; raw declarations never grant operating rights.
 * The registrar binds exact CHECKSUMS originals to an actual immutable admission.
 * Runtime source locks remain held by the caller's outer atomic transaction. */
import { createHash } from 'node:crypto';
import {
  canonicalDecimal,
  WorldDecimal,
  assertWorldDecimalResult,
  validateCanonicalCommand,
  type CanonicalCommand,
  type ExactUnitRate,
} from '@econmind/core';
import {
  isVerifiedOfficialOpeningDecisionSource,
  inspectOfficialOpeningDecisionSource,
} from '../preparation/official-opening-decision-reconciliation.js';
import { buildOfficialPhysicalOpeningAdoption } from '../preparation/official-physical-opening-adoption.js';
import type { PostwarPhysicalSourceContext } from '../preparation/postwar-physical-service-receipt.js';
import {
  ProtectedIndustryProductionGuard,
  type IndustryProductionCutoffGuard,
  type IndustryProductionCutoffRequest,
  type IndustryProductionCutoffObservation,
} from './industry-production-source-cutoff.js';
import type { SqlExecutor } from './sql-database.js';
export const POSTWAR_INDUSTRY_SOURCE_ROLES = Object.freeze({
  publisher: 'world_v2_industry_source_publisher',
  reader: 'world_v2_industry_source_reader',
});
export const POSTWAR_INDUSTRY_SOURCE_ORIGINALS = Object.freeze([
  'facilities',
  'recipes',
  'production-plans',
  'technology-proposals',
  'license-proposals',
  'commodity-catalog',
] as const);
export const POSTWAR_INDUSTRY_SOURCE_REGISTER =
  'select * from world_v2.register_postwar_industry_originals($1,$2,$3,$4::jsonb)';
export const POSTWAR_INDUSTRY_SOURCE_LOCK =
  'select * from world_v2.lock_postwar_industry_original($1,$2,$3,$4,$5)';
export const POSTWAR_INDUSTRY_SOURCE_SESSION = `select current_user as role_name,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication,current_setting('transaction_isolation')as isolation,current_setting('transaction_read_only')as read_only,pg_has_role(current_user,'world_v2_industry_source_publisher','MEMBER')as publisher_member,pg_has_role(current_user,'world_v2_industry_source_owner','MEMBER')as owner_member,pg_has_role(current_user,'world_v2_industry_source_reader','MEMBER')as reader_member from pg_roles r where r.rolname=current_user`;
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
type RecordData = Readonly<Record<string, unknown>>;
function invalid(code: string): never {
  throw Error('POSTWAR_INDUSTRY_SOURCE:' + code);
}
function record(value: unknown): RecordData {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('INVALID_ORIGINAL_RECORD');
  return value as RecordData;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value || value.trim() !== value)
    invalid('INVALID_ORIGINAL_TEXT');
  return value;
}
function originalBytes(value: unknown): string {
  if (typeof value !== 'string' || !value)
    invalid('EXACT_ORIGINAL_BYTES_REQUIRED');
  return value;
}
function rows(value: unknown): readonly RecordData[] {
  if (!Array.isArray(value)) invalid('INVALID_ORIGINAL_ARRAY');
  return value.map(record);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
/** Exact source exponent lexemes are expanded, never sent through JS Number. */
function decimal(value: unknown): string {
  const raw = text(value);
  if (
    !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(raw) ||
    raw.length > 160
  )
    invalid('INVALID_SOURCE_DECIMAL');
  return canonicalDecimal(assertWorldDecimalResult(new WorldDecimal(raw)));
}
function lossless(bytes: string): unknown {
  const parse = JSON.parse as (
    bytes: string,
    revive: (
      key: string,
      value: unknown,
      context: { source?: string },
    ) => unknown,
  ) => unknown;
  return parse(bytes, (_key, value, context) =>
    typeof value === 'number' ? text(context.source) : value,
  );
}
export const POSTWAR_INDUSTRY_MISSING_FACT_CODES = [
  'FACILITY_UNBUILT',
  'OP_TITLE_OR_SITE_SCOPE_MISSING',
  'ACTUAL_MAINTENANCE_RECEIPT_MISSING',
  'TECHNOLOGY_RIGHT_OR_NONREQUIREMENT_MISSING',
  'GRANTED_ACTIVITY_LICENSE_MISSING',
  'ACTUAL_FACILITY_LABOUR_ALLOCATION_MISSING',
  'LOGISTICS_COEFFICIENT_MISSING',
  'ACTUAL_POWER_DELIVERY_MISSING',
  'ACTUAL_WATER_DELIVERY_MISSING',
  'ACTUAL_LOGISTICS_DELIVERY_MISSING',
  'PAID_COST_PURPOSE_ORIGINAL_MISSING',
  'EXACT_COST_PER_ACTUAL_OUTPUT_MISSING',
  'CORE_WATER_DEBIT_BINDING_MISSING',
  'RESOURCE_OR_LAND_CONSUMPTION_BINDING_MISSING',
  'ORIGINAL_CUTOFF_OWNER_NOT_INSTALLED',
] as const;
export type PostwarIndustryMissingFactCode =
  (typeof POSTWAR_INDUSTRY_MISSING_FACT_CODES)[number];
export interface PostwarIndustryMissingFact {
  readonly code: PostwarIndustryMissingFactCode;
  readonly field: string;
  readonly sourcePointer: string;
  readonly detail: string;
}
export interface PostwarIndustryOriginalInspection {
  readonly status: 'SOURCE_BOUND_WITH_MISSING_FACTS';
  readonly scope: Readonly<{
    worldId: string;
    countryId: string;
    locationId: string;
    facilityId: string;
    operatorId: string;
  }>;
  readonly physical: Readonly<{
    state:
      | 'ADOPTED_EXISTING_OP_ASSET'
      | 'UNBUILT_NOT_ADOPTED'
      | 'EXISTING_TITLE_UNRESOLVED';
    titleHolderId: string | null;
    riskBearerId: string | null;
    operatingPermission:
      'OWNER_D04_CONDITIONAL_SITE_SCOPE_NOT_TRANSFERABLE_LICENSE' | 'NONE';
    sourceCapacity: string;
    sourceCapacityUnit: string;
    installedMachineryReference: string | null;
  }>;
  readonly recipe: Readonly<{
    sourceId: string;
    originalAuthority: string;
    outputCommodityId: string;
    outputUnit: string;
    materials: readonly Readonly<{
      commodityId: string;
      perOutput: ExactUnitRate;
    }>[];
    energyPerOutput: ExactUnitRate;
    waterPerOutput: ExactUnitRate;
    workersPerDailyOutputUnit: string;
    costPerOutput: null;
    labourPerOutput: ExactUnitRate;
    labourBasis: 'EXACT_PERSON_DAY_DIMENSION_NO_WORKDAY_HOURS_ASSUMPTION';
    logisticsPerOutput: null;
  }>;
  readonly sourceProductionPlans: readonly RecordData[];
  readonly sourceTechnologyProposals: readonly RecordData[];
  readonly sourceLicenseProposals: readonly RecordData[];
  readonly missing: readonly PostwarIndustryMissingFact[];
  readonly authority: false;
}
/** Pure data interpretation only. It cannot mint a custody observation or grant. */
export function inspectPostwarIndustryOriginalDocument(
  value: unknown,
): PostwarIndustryOriginalInspection {
  const d = record(value),
    f = record(d.sourceFacility),
    r = record(d.recipe),
    outputUnit = text(r.outputUnit),
    commodity = text(r.commodityId),
    operator = text(d.operatorId);
  const built = f.constructionStatusProposal === 'OPENING_EXISTING_ASSET';
  const validOp =
    built &&
    (f.commodityId === 'GRAIN' ||
      /^PROJECT-(?:0[1-6]|1[013-8]|2[1356])$/u.test(String(f.projectId)));
  if (r.id !== f.recipeId || r.commodityId !== f.commodityId)
    invalid('RECIPE_FACILITY_ORIGINAL_MISMATCH');
  const missing: PostwarIndustryMissingFact[] = [];
  const add = (
    code: PostwarIndustryMissingFactCode,
    field: string,
    sourcePointer: string,
    detail: string,
  ) => missing.push({ code, field, sourcePointer, detail });
  if (!built)
    add(
      'FACILITY_UNBUILT',
      'physicalAsset',
      'sourceFacility.constructionStatusProposal',
      'An unbuilt option supplies no opening production capacity or rights.',
    );
  if (!validOp)
    add(
      'OP_TITLE_OR_SITE_SCOPE_MISSING',
      'titleAndOperatingScope',
      'OWNER_D04_5_1',
      'No adopted existing commercial OP category; source owner proposals cannot grant title.',
    );
  // The source's historical candidate tag is retained as provenance, not a
  // fabricated new approval gate. Its declared material/energy/water rates
  // are bound exactly; missing actual allocation/logistics/cost below prevent an executable Core recipe.
  add(
    'ACTUAL_MAINTENANCE_RECEIPT_MISSING',
    'maintenanceAppliedRef',
    'sourceFacility.dailyMaintenanceGcuProposal',
    'An authored daily cost is neither an applied maintenance event nor a paid receipt.',
  );
  add(
    'TECHNOLOGY_RIGHT_OR_NONREQUIREMENT_MISSING',
    'technologyRightRef',
    'technologyProposals[]',
    'OPENING_LICENSE_PROPOSAL_NOT_GRANTED is not MASTERED, a right of use, or an authoritative nonrequirement.',
  );
  if (rows(d.licenseProposals).length)
    add(
      'GRANTED_ACTIVITY_LICENSE_MISSING',
      'activityLicense',
      'licenseProposals[].status',
      'PROPOSED_NOT_GRANTED cannot be promoted by custody registration.',
    );
  add(
    'ACTUAL_FACILITY_LABOUR_ALLOCATION_MISSING',
    'staffing',
    'sourceFacility.requiredWorkers',
    'A requirement or aggregate national employment is not a distinct facility work allocation.',
  );
  add(
    'LOGISTICS_COEFFICIENT_MISSING',
    'logisticsPerOutput',
    'recipe',
    'No tonne_km-per-output coefficient is declared.',
  );
  add(
    'ACTUAL_POWER_DELIVERY_MISSING',
    'deliveredPower',
    'recipe.electricityMWhPerUnit',
    'Source demand and Social-only finite allocations are not a delivered Industry input.',
  );
  add(
    'ACTUAL_WATER_DELIVERY_MISSING',
    'deliveredWater',
    'recipe.waterM3PerUnit',
    'A water right or source requirement is not an actual delivery/consumption receipt.',
  );
  add(
    'ACTUAL_LOGISTICS_DELIVERY_MISSING',
    'logisticsAllocation',
    'sourceFacility',
    'No reserved and delivered facility-specific logistics fact exists.',
  );
  add(
    'PAID_COST_PURPOSE_ORIGINAL_MISSING',
    'fundingQualification',
    'productionPlans[]',
    'Planned output/reference cost does not establish a matching committed operating payment or its source-qualified purpose.',
  );
  add(
    'EXACT_COST_PER_ACTUAL_OUTPUT_MISSING',
    'costPerOutput',
    'productionPlans[]',
    'Requires actual source-qualified paid cost divided exactly by the actual output; no authored price or free reserve substituted.',
  );
  add(
    'CORE_WATER_DEBIT_BINDING_MISSING',
    'waterConsumption',
    'recipe.waterM3PerUnit',
    'The existing production posting has no water debit; the positive water requirement must have its own atomic conserved binding.',
  );
  const inputs = record(r.inputsPerUnit),
    catalog = rows(d.commodityCatalog);
  const materials = Object.entries(inputs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, amount]) => {
      const items = catalog.filter((c) => c.id === id || c.commodityId === id);
      if (items.length !== 1) invalid('EXACT_COMMODITY_UNIT_REQUIRED');
      return {
        commodityId: id,
        perOutput: {
          amount: decimal(amount),
          inputUnit: outputUnit,
          outputUnit: text(items[0]!.unit),
        },
      };
    });
  if (!materials.length)
    add(
      'RESOURCE_OR_LAND_CONSUMPTION_BINDING_MISSING',
      'resourceUse',
      'recipe.inputsPerUnit',
      'An empty authored material list does not authorize free extraction or land/water use.',
    );
  const rate = (amount: unknown, unit: string): ExactUnitRate => ({
    amount: decimal(amount),
    inputUnit: outputUnit,
    outputUnit: unit,
  });
  return freeze({
    status: 'SOURCE_BOUND_WITH_MISSING_FACTS',
    scope: {
      worldId: text(d.worldId),
      countryId: text(d.countryId),
      locationId: text(d.locationId),
      facilityId: text(f.id),
      operatorId: operator,
    },
    physical: {
      state: validOp
        ? 'ADOPTED_EXISTING_OP_ASSET'
        : built
          ? 'EXISTING_TITLE_UNRESOLVED'
          : 'UNBUILT_NOT_ADOPTED',
      titleHolderId: validOp ? operator : null,
      riskBearerId: validOp ? operator : null,
      operatingPermission: validOp
        ? 'OWNER_D04_CONDITIONAL_SITE_SCOPE_NOT_TRANSFERABLE_LICENSE'
        : 'NONE',
      sourceCapacity: decimal(f.capacity),
      sourceCapacityUnit: text(f.capacityUnit),
      installedMachineryReference:
        f.installedMachineryUnits === undefined
          ? null
          : decimal(f.installedMachineryUnits),
    },
    recipe: {
      sourceId: text(r.id),
      originalAuthority: text(r.authority),
      outputCommodityId: commodity,
      outputUnit,
      materials,
      energyPerOutput: rate(r.electricityMWhPerUnit, 'MWh'),
      waterPerOutput: rate(r.waterM3PerUnit, 'm3'),
      workersPerDailyOutputUnit: decimal(r.workersPerDailyOutputUnit),
      costPerOutput: null,
      labourPerOutput: rate(r.workersPerDailyOutputUnit, 'person_day'),
      labourBasis: 'EXACT_PERSON_DAY_DIMENSION_NO_WORKDAY_HOURS_ASSUMPTION',
      logisticsPerOutput: null,
    },
    sourceProductionPlans: rows(d.productionPlans),
    sourceTechnologyProposals: rows(d.technologyProposals),
    sourceLicenseProposals: rows(d.licenseProposals),
    missing,
    authority: false,
  });
}
export class PostwarIndustrySourceMissingError extends Error {
  readonly code = 'POSTWAR_INDUSTRY_SOURCE_MISSING' as const;
  constructor(
    readonly missing: readonly PostwarIndustryMissingFact[],
    readonly registrationRef: string,
  ) {
    super(
      'POSTWAR_INDUSTRY_SOURCE_MISSING:' + missing.map((x) => x.code).join(','),
    );
  }
}
export interface PostwarIndustrySourceObservation {
  readonly registrationRef: string;
  readonly documentSha256: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly inspected: PostwarIndustryOriginalInspection;
}
/** Fixed server factory. Caller JSON/Ready/fact booleans are not its source. */
export function createPostwarIndustryProductionSource(input: {
  sourceContext: PostwarPhysicalSourceContext;
  scope: Readonly<{ worldId: string; countryId: string }>;
  runtimeReaderRole: string;
}) {
  const context = input.sourceContext;
  if (!isVerifiedOfficialOpeningDecisionSource(context.source))
    invalid('GENUINE_SELECTED_SOURCE_REQUIRED');
  const verified = inspectOfficialOpeningDecisionSource(
    context.sourceBytes,
  ).source;
  if (
    !verified ||
    verified.pins.checksumsSha256 !== context.source.pins.checksumsSha256
  )
    invalid('FIXED_SOURCE_ORIGINALS_DRIFT');
  buildOfficialPhysicalOpeningAdoption({
    sourceBytes: context.sourceBytes,
    ownerDecisionBytes: context.ownerOriginalBytes,
  });
  if (
    !/^[a-z][a-z0-9_]{0,62}$/u.test(input.runtimeReaderRole) ||
    [
      'anon',
      'authenticated',
      'service_role',
      'postgres',
      'world_v2_api_reader',
      'world_v2_api_login',
    ].includes(input.runtimeReaderRole)
  )
    invalid('FIXED_READER_ROLE_REQUIRED');
  const configured = freeze({ ...input.scope }),
    originals = Object.fromEntries(
      POSTWAR_INDUSTRY_SOURCE_ORIGINALS.map((key) => [
        key,
        originalBytes(context.sourceBytes.datasets['data/' + key + '.json']),
      ]),
    );
  const preflight = async (tx: SqlExecutor, publisher: boolean) => {
    const r = await tx.query<Record<string, unknown>>(
        POSTWAR_INDUSTRY_SOURCE_SESSION,
      ),
      s = r.rows[0];
    if (
      r.rows.length !== 1 ||
      !s ||
      s.role_name !==
        (publisher
          ? POSTWAR_INDUSTRY_SOURCE_ROLES.publisher
          : input.runtimeReaderRole) ||
      s.rolsuper !== false ||
      s.rolbypassrls !== false ||
      s.rolcreaterole !== false ||
      s.rolcreatedb !== false ||
      s.rolreplication !== false ||
      s.owner_member !== false ||
      s.read_only !== 'off' ||
      !['repeatable read', 'serializable'].includes(String(s.isolation)) ||
      (publisher
        ? s.publisher_member !== true
        : s.publisher_member !== false || s.reader_member !== true)
    )
      invalid('SEPARATED_FIXED_ROLE_AND_STABLE_TRANSACTION_REQUIRED');
  };
  const readFrom = async (
    tx: SqlExecutor,
    request: {
      command: CanonicalCommand;
      facilityId: string;
      eventSequence: string;
    },
  ): Promise<PostwarIndustrySourceObservation> => {
    const command = validateCanonicalCommand(request.command, sha);
    if (
      command.worldId !== configured.worldId ||
      command.countryId !== configured.countryId ||
      command.officeId !== 'INDUSTRY'
    )
      invalid('ACTUAL_COMMAND_SCOPE_MISMATCH');
    await preflight(tx, false);
    const r = await tx.query<Record<string, unknown>>(
        POSTWAR_INDUSTRY_SOURCE_LOCK,
        [
          configured.worldId,
          configured.countryId,
          text(request.facilityId),
          command.expectedWorldVersion,
          text(request.eventSequence),
        ],
      ),
      row = r.rows[0];
    if (r.rows.length !== 1 || !row) invalid('ORIGINAL_REGISTRATION_MISSING');
    const bytes = text(row.document_text),
      digest = text(row.document_sha256);
    if (sha(bytes) !== digest) invalid('ORIGINAL_BYTES_HASH_MISMATCH');
    const inspected = inspectPostwarIndustryOriginalDocument(lossless(bytes));
    if (
      inspected.scope.worldId !== configured.worldId ||
      inspected.scope.countryId !== configured.countryId ||
      inspected.scope.facilityId !== request.facilityId
    )
      invalid('LOCKED_ORIGINAL_SCOPE_MISMATCH');
    return freeze({
      registrationRef: text(row.registration_ref),
      documentSha256: digest,
      seedFingerprint: text(row.seed_fingerprint),
      admissionRef: text(row.admission_ref),
      inspected,
    });
  };
  return Object.freeze({
    async registerFrom(tx: SqlExecutor) {
      await preflight(tx, true);
      return tx.query<Record<string, unknown>>(
        POSTWAR_INDUSTRY_SOURCE_REGISTER,
        [
          configured.worldId,
          configured.countryId,
          context.sourceBytes.checksumsBytes,
          JSON.stringify(originals),
        ],
      );
    },
    readForCommandFrom: readFrom,
    createCutoffGuard(
      delegate: ProtectedIndustryProductionGuard | null,
    ): IndustryProductionCutoffGuard {
      if (
        delegate !== null &&
        !(delegate instanceof ProtectedIndustryProductionGuard)
      )
        invalid('FIXED_PROTECTED_CUTOFF_GUARD_REQUIRED');
      return Object.freeze({
        async assertCurrentFrom(
          tx: SqlExecutor,
          request: Readonly<IndustryProductionCutoffRequest>,
        ): Promise<Readonly<IndustryProductionCutoffObservation>> {
          const source = await readFrom(tx, {
            command: request.command,
            facilityId: request.posting.evidence.operating.payload.facilityRef,
            eventSequence: request.expectedHead.eventSequence,
          });
          if (source.inspected.missing.length)
            throw new PostwarIndustrySourceMissingError(
              source.inspected.missing,
              source.registrationRef,
            );
          // The fixed selected data currently cannot reach here. Even a future source
          // with complete facts must still pass the original full R/F guard; a document
          // inspection never manufactures its original qualification or observation.
          if (delegate === null)
            throw new PostwarIndustrySourceMissingError(
              [
                {
                  code: 'ORIGINAL_CUTOFF_OWNER_NOT_INSTALLED',
                  field: 'custodyOwner',
                  sourcePointer: 'protectedOwner',
                  detail:
                    'The fixed native original-source guard is not installed.',
                },
              ],
              source.registrationRef,
            );
          return delegate.assertCurrentFrom(tx, request);
        },
      });
    },
  });
}
