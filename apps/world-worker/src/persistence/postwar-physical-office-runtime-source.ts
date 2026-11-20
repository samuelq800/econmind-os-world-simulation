/** Industry, Trade and Captain read adapters over the same admitted seed and
 * held durable ledger. No command, permit, issuer, balance or action is created.
 * This full-seed path requires an enrolled offline/server evidence reader.
 * Online Workers use the separately sealed bounded country projection store. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  canonicalDecimal,
  parseWorldDecimal,
  OFFICE_DEFINITIONS,
  rebuildV08LedgersFromLineage,
  type OpeningSeed,
  type AuthorizationCapability,
  type AuthorizedOfficeContext,
} from '@econmind/core';
import {
  createAuthorizedAdmittedOpeningSource,
  consumeAuthorizedAdmittedOpeningSourceFrom,
  type AuthorizedAdmittedOpeningSource,
} from './postwar-operating-runtime-source.js';
import {
  buildOfficialPhysicalOpeningAdoption,
  type OfficialPhysicalOpeningAdoption,
} from '../preparation/official-physical-opening-adoption.js';
import {
  buildOfficialWaterOpeningAdoption,
  type OfficialWaterOpeningAdoption,
} from '../preparation/official-water-opening-adoption.js';
import {
  validatePostwarPhysicalServiceReceiptFromSeed,
  type PostwarPhysicalServiceReceipt,
  type PostwarPhysicalSourceContext,
} from '../preparation/postwar-physical-service-receipt.js';
import { isVerifiedOfficialOpeningDecisionSource } from '../preparation/official-opening-decision-reconciliation.js';
import type { SqlExecutor } from './sql-database.js';
import { readPostwarOperatingGenesisFromSeed } from '../preparation/postwar-operating-genesis-adoption.js';

export type PostwarPhysicalOffice = 'INDUSTRY' | 'TRADE' | 'CAPTAIN';
interface Scope {
  readonly worldId: string;
  readonly countryId: string;
  readonly officeId: PostwarPhysicalOffice;
}
const capabilities: Readonly<
  Record<PostwarPhysicalOffice, readonly AuthorizationCapability[]>
> = {
  INDUSTRY: OFFICE_DEFINITIONS.INDUSTRY.capabilities,
  TRADE: OFFICE_DEFINITIONS.TRADE.capabilities,
  CAPTAIN: OFFICE_DEFINITIONS.CAPTAIN.capabilities,
};
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const hash = (value: unknown) => `sha256:${sha(canonicalSerialize(value))}`;
function invalid(reason: string): never {
  throw Error(`POSTWAR_PHYSICAL_OFFICE:${reason}`);
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('source record required');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    invalid('exact source text required');
  return value;
}
function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) invalid('source rows required');
  return value.map(record);
}
function sourceRows(bytes: string): Record<string, unknown>[] {
  const parse = JSON.parse as (
    bytes: string,
    reviver: (
      key: string,
      value: unknown,
      context: { source?: string },
    ) => unknown,
  ) => unknown;
  return rows(
    parse(bytes, (_key, value, context) =>
      typeof value === 'number' ? context.source : value,
    ),
  );
}
function sum(values: readonly string[]): string {
  return canonicalDecimal(
    values.reduce(
      (total, value) => total.add(parseWorldDecimal(value)),
      parseWorldDecimal('0'),
    ),
  );
}
interface Installation {
  readonly context: PostwarPhysicalSourceContext;
  readonly physical: OfficialPhysicalOpeningAdoption;
  readonly water: OfficialWaterOpeningAdoption;
  readonly sourceCountryId: string;
  readonly sourceRegions: readonly Readonly<{
    sourceRegionId: string;
    locationId: string;
  }>[];
  readonly commodityIds: readonly string[];
}
function install(
  context: PostwarPhysicalSourceContext,
  countryId: string,
  shared?: Readonly<{
    physical: OfficialPhysicalOpeningAdoption;
    water: OfficialWaterOpeningAdoption;
    mapping: Record<string, unknown>;
  }>,
): Installation {
  if (!isVerifiedOfficialOpeningDecisionSource(context.source))
    invalid('actual server source context required');
  const physical =
    shared?.physical ??
    buildOfficialPhysicalOpeningAdoption({
      sourceBytes: context.sourceBytes,
      ownerDecisionBytes: context.ownerOriginalBytes,
    });
  const water =
    shared?.water ??
    buildOfficialWaterOpeningAdoption({
      sourceBytes: context.sourceBytes,
      ownerDecisionBytes: context.ownerOriginalBytes,
    });
  const mapping =
    shared?.mapping ??
    record(record(JSON.parse(context.sourceBytes.mappingBytes)).mappings);
  const countries = rows(mapping.countries).filter(
    (row) => row.coreCountryId === countryId,
  );
  if (countries.length !== 1) invalid('country outside pinned mapping');
  return Object.freeze({
    context,
    physical,
    water,
    sourceCountryId: text(countries[0]!.sourceCountryId),
    sourceRegions: rows(mapping.regions)
      .filter((row) => row.coreCountryId === countryId)
      .map((row) => ({
        sourceRegionId: text(row.sourceRegionId),
        locationId: text(row.normalizedRegionId),
      })),
    commodityIds: context.source.commodities.map((row) =>
      text(row.coreCommodityId),
    ),
  });
}
function derive(
  held: Pick<
    AuthorizedAdmittedOpeningSource,
    'seed' | 'replayed' | 'operating'
  > &
    Readonly<{
      scope: Readonly<{ worldId: string; countryId: string; officeId: string }>;
    }>,
  installation: Installation,
  scope: Scope,
  validatedReceipt?: PostwarPhysicalServiceReceipt,
) {
  if (
    held.scope.worldId !== scope.worldId ||
    held.scope.countryId !== scope.countryId ||
    held.scope.officeId !== scope.officeId ||
    held.replayed.headWorldVersion !== '0' ||
    held.replayed.headEventSequence !== '0'
  )
    invalid('held exact office/country/H0 source required');
  if (!held.operating.physicalServiceReceiptDocumentId)
    invalid('admitted global physical receipt required');
  const receipt =
    validatedReceipt ??
    validatePostwarPhysicalServiceReceiptFromSeed({
      seed: held.seed,
      documentId: held.operating.physicalServiceReceiptDocumentId,
      context: installation.context,
    });
  const countryRegions = new Set(
    installation.sourceRegions.map((row) => row.locationId),
  );
  const commodities = new Set(installation.commodityIds);
  const inventory = held.replayed.ledgers.inventory.balances
    .filter(
      (balance) =>
        balance.account.countryId === scope.countryId &&
        commodities.has(balance.account.commodityId),
    )
    .map((balance) => {
      const accountRef = hash(balance.account);
      return {
        accountRef,
        countryId: balance.account.countryId,
        commodityId: balance.account.commodityId,
        unit: balance.account.unit,
        quantity: canonicalDecimal(balance.quantity.amount),
        physicalLocationId: balance.account.physicalLocationId,
        bucket: balance.account.bucket,
        titleHolderId: balance.account.titleHolderId,
        riskBearerId: balance.account.riskBearerId,
        reservationRef: balance.account.reservationId,
        shipmentRef: balance.account.shipmentId,
        economicRecognitionRef: balance.account.economicRecognitionId,
        openingEntryReferences: held.seed.inventoryEntries
          .filter((entry) => hash(entry.account) === accountRef)
          .map((entry) => ({
            entryId: entry.entryId,
            sourceId: entry.sourceId,
            sourcePayloadHash: held.seed.sources.find(
              (source) => source.sourceId === entry.sourceId,
            )!.payloadHash,
          })),
        interpretation:
          'HELD_CANONICAL_PHYSICAL_STOCK_NOT_EXPORT_OR_CONSUMPTION_PERMISSION' as const,
      };
    });
  const allFacilities = installation.physical.facilities
    .filter((facility) => facility.countryId === scope.countryId)
    .map((facility) => ({
      facilityId: facility.id,
      countryId: facility.countryId,
      locationId: facility.regionId,
      projectId:
        typeof facility.source.projectId === 'string'
          ? facility.source.projectId
          : null,
      commodityId:
        typeof facility.source.commodityId === 'string'
          ? facility.source.commodityId
          : null,
      capacity: text(facility.source.capacity),
      capacityUnit: text(facility.source.capacityUnit),
      adoptionStatus: facility.status,
      titleHolderId: facility.titleHolderId,
      riskBearerId: facility.riskBearerId,
      operatorId: facility.operatorId,
      sourceOperationalFlag: facility.source.runtimeOperational === true,
      actualOperatingPermitRef: null,
      classification:
        facility.status === 'ADOPTED_BUILT'
          ? ('ADOPTED_ASSET_SOURCE_CAPACITY_NOT_ACTUAL_PRODUCTION' as const)
          : ('UNBUILT_OPTION_CAPACITY_NOT_EXISTING_CAPACITY' as const),
      sourceReference: {
        path: facility.binding.path,
        pointer: facility.binding.pointer,
        sha256: facility.binding.sha256,
      },
    }));
  const references = {
    seedFingerprint: held.seed.fingerprint,
    sourcePackageId: installation.context.source.pins.packageId,
    sourceChecksumsSha256: installation.context.source.pins.checksumsSha256,
    mappingSha256: installation.context.source.pins.mappingSha256,
    physicalManifestHash: installation.physical.manifestHash,
    waterManifestHash: installation.water.manifestHash,
    physicalReceiptFingerprint: receipt.fingerprint,
  };
  const utility = receipt.utility.inputs.accounts
    .filter((account) => account.countryId === scope.countryId)
    .map((account) => ({
      accountRef: account.accountRef,
      utility: account.utility,
      physicalObjectId: account.physicalObjectId,
      locationId: account.locationId,
      unit: account.unit,
      ownerId: account.ownerId,
      beneficiaryId: account.beneficiaryId,
      availableAmount: account.availableAmount,
      authority: account.authority,
      validity: account.validity,
      actualDelivered: account.actualDelivered,
      sourceReferences: account.sourceReferences,
    }));
  const currentServices = held.operating.facts.services.filter((service) =>
    countryRegions.has(service.regionId),
  );
  const inventoryTotals = installation.commodityIds.flatMap((commodityId) =>
    [
      ...new Set(
        inventory
          .filter((row) => row.commodityId === commodityId)
          .map((row) => `${row.unit}|${row.bucket}`),
      ),
    ].map((key) => {
      const [unit, bucket] = key.split('|');
      return {
        commodityId,
        unit: unit!,
        bucket: bucket!,
        quantity: sum(
          inventory
            .filter(
              (row) =>
                row.commodityId === commodityId &&
                row.unit === unit &&
                row.bucket === bucket,
            )
            .map((row) => row.quantity),
        ),
      };
    }),
  );
  if (scope.officeId === 'CAPTAIN') {
    const facilityKeys = [
      ...new Set(
        allFacilities
          .filter((row) => row.adoptionStatus === 'ADOPTED_BUILT')
          .map(
            (row) =>
              `${row.projectId ?? row.commodityId ?? 'UNCLASSIFIED'}|${row.capacityUnit}`,
          ),
      ),
    ];
    return freeze({
      officeId: 'CAPTAIN' as const,
      classification:
        'COUNTRY_PHYSICAL_SUMMARY_IN_CAPTAIN_PRIVATE_SCOPE' as const,
      sourceBinding: references,
      countryId: scope.countryId,
      inventoryTotals,
      infrastructure: facilityKeys.map((key) => {
        const [projectOrCommodityId, unit] = key.split('|');
        const selected = allFacilities.filter(
          (row) =>
            row.adoptionStatus === 'ADOPTED_BUILT' &&
            (row.projectId ?? row.commodityId ?? 'UNCLASSIFIED') ===
              projectOrCommodityId &&
            row.capacityUnit === unit,
        );
        return {
          projectOrCommodityId: projectOrCommodityId!,
          unit: unit!,
          adoptedFacilityCount: String(selected.length),
          sourceCapacity: sum(selected.map((row) => row.capacity)),
          interpretation: 'ADOPTED_SOURCE_CAPACITY_NOT_OUTPUT' as const,
        };
      }),
      publicServices: [
        ...new Set(currentServices.map((service) => service.kind)),
      ].map((kind) => ({
        kind,
        sourceCount: String(
          currentServices.filter((service) => service.kind === kind).length,
        ),
        demandCount: sum(
          currentServices
            .filter((service) => service.kind === kind)
            .map((service) => service.demandCount),
        ),
        initialCapacity: sum(
          currentServices
            .filter((service) => service.kind === kind)
            .map((service) => service.capacityCount),
        ),
      })),
      initialPublicUtilities: {
        rawWaterOptionM3: sum(
          utility
            .filter((row) => row.utility === 'WATER')
            .map((row) => row.availableAmount),
        ),
        storageDeliveryOptionMWh: sum(
          utility
            .filter((row) => row.utility === 'POWER')
            .map((row) => row.availableAmount),
        ),
        deliveredWater: '0',
        deliveredPower: '0',
        operationalWaterEpisodes: sum(
          receipt.regions
            .filter((row) => row.countryId === scope.countryId)
            .map((row) => row.waterEpisodes),
        ),
        operationalPowerEpisodes: sum(
          receipt.regions
            .filter((row) => row.countryId === scope.countryId)
            .map((row) => row.powerEpisodes),
        ),
        classification:
          'GENERATED_FINITE_INITIAL_CAPACITY_NOT_ACTUAL_DELIVERY' as const,
      },
      politicalCapitalSource: null,
    });
  }
  if (scope.officeId === 'TRADE') {
    const dataset = installation.context.source.domains.find(
      (domain) => domain.dataset === 'transport-routes',
    );
    if (!dataset) invalid('actual selected transport source missing');
    const routes = sourceRows(
      installation.context.sourceBytes.datasets[dataset.sourcePath]!,
    ).flatMap((route, index) => {
      const parties = [
        route.fromCountryId,
        route.toCountryId,
        ...(Array.isArray(route.transitCountryIds)
          ? route.transitCountryIds
          : []),
      ];
      if (!parties.includes(installation.sourceCountryId)) return [];
      return [
        {
          routeId: text(route.id),
          fromSourceCountryId: text(route.fromCountryId),
          toSourceCountryId: text(route.toCountryId),
          fromNodeId: text(route.fromNodeId),
          toNodeId: text(route.toNodeId),
          distanceKm: text(route.distanceKm),
          sourceStatus: text(route.status),
          sourceEngineeringAndRightsApproved:
            route.engineeringAndRightsApproved === true,
          currentCountryRole:
            route.fromCountryId === installation.sourceCountryId
              ? ('ORIGIN' as const)
              : route.toCountryId === installation.sourceCountryId
                ? ('DESTINATION' as const)
                : ('TRANSIT' as const),
          admittedTransportRightRef: null,
          classification:
            'SELECTED_SOURCE_PLANNING_ROUTE_NOT_OPERATING_PERMISSION' as const,
          sourceReference: {
            path: dataset.sourcePath,
            pointer: `/${index}`,
            sha256: dataset.sourceSha256,
          },
        },
      ];
    });
    return freeze({
      officeId: 'TRADE' as const,
      classification: 'TRADE_COUNTRY_PRIVATE_PHYSICAL_READ' as const,
      countryId: scope.countryId,
      sourceBinding: references,
      inventory,
      logisticsFacilities: allFacilities.filter((row) =>
        ['PROJECT-21', 'PROJECT-25', 'PROJECT-26'].includes(
          row.projectId ?? '',
        ),
      ),
      routes,
      tradeContractOriginals: null,
      exportPermissions: null,
    });
  }
  const sourcePositions =
    held.operating.socialEmployment?.inputs.sourcePositions ?? [];
  return freeze({
    officeId: 'INDUSTRY' as const,
    classification: 'INDUSTRY_COUNTRY_PRIVATE_PHYSICAL_READ' as const,
    countryId: scope.countryId,
    sourceBinding: references,
    inventory,
    facilities: allFacilities
      .filter(
        (row) =>
          row.commodityId !== null ||
          /^(?:PROJECT-0[1-6]|PROJECT-1[013-8]|PROJECT-23|PROJECT-26)$/u.test(
            row.projectId ?? '',
          ),
      )
      .map((facility) => ({
        ...facility,
        actualFilledWorkers: sourcePositions
          .filter(
            (position) =>
              position.countryId === scope.countryId &&
              position.sourceObjectId === facility.facilityId,
          )
          .reduce((total, position) => total + BigInt(position.filledCount), 0n)
          .toString(),
      })),
    resources: installation.physical.deposits
      .filter((deposit) => deposit.countryId === scope.countryId)
      .map((deposit) => ({
        depositId: deposit.id,
        sovereignHolderId: deposit.sovereignHolderId,
        pools: deposit.state,
        conditionalOperatorScope: deposit.conditionalOperatorScope,
        classification:
          'ADOPTED_SOURCE_RESOURCE_BASIS_NOT_EXTRACTION_PERMISSION' as const,
        sourceReference: {
          path: deposit.binding.path,
          pointer: deposit.binding.pointer,
          sha256: deposit.binding.sha256,
        },
        sourceGaps: deposit.gaps.map((gap) => ({
          field: gap.field,
          code: gap.code,
          detail: gap.detail,
        })),
      })),
    waterRights: installation.water.allocations
      .filter((row) => row.countryRef === scope.countryId)
      .map((row) => ({
        locationId: row.regionRef,
        basinRef: row.basinRef,
        status: row.status,
        rights: row.rights.map((right) => ({
          rightRef: right.rightRef,
          holderRef: right.holderRef,
          purpose: right.purpose,
          quotaPerDay: right.quotaPerDay,
          validity: right.validity,
        })),
        classification:
          'ADOPTED_SOURCE_ALLOCATION_BASIS_NOT_ACTUAL_DELIVERY' as const,
        sourceReference: row.sourceBinding,
      })),
    initialPublicUtilityUse: utility,
    productionOperatingPermitSource: null,
  });
}
export type PostwarPhysicalOfficeReadFacts = ReturnType<typeof derive>;
/** Server publication helper for bounded country rows. It projects the same
 * canonical H0 data; the store/host still owns publication and fresh read
 * authorization. This object is never a second World State or a capability. */
export function createPostwarPhysicalOfficeFactsProjector(input: {
  readonly seed: OpeningSeed;
  readonly sourceContext: PostwarPhysicalSourceContext;
}) {
  const seed = input.seed;
  // The existing Core reader requires its genuine immutable seed brand and
  // replays every opening ledger. Reference callers parse raw bytes once.
  const ledgers = rebuildV08LedgersFromLineage({ seed, sha256Hex: sha });
  const operating = readPostwarOperatingGenesisFromSeed(seed);
  if (!operating.physicalServiceReceiptDocumentId)
    invalid('admitted global physical receipt required');
  const receipt = validatePostwarPhysicalServiceReceiptFromSeed({
    seed,
    documentId: operating.physicalServiceReceiptDocumentId,
    context: input.sourceContext,
  });
  const first = install(
    input.sourceContext,
    input.sourceContext.source.countryIds[0]!,
  );
  const shared = {
    physical: first.physical,
    water: first.water,
    mapping: record(
      record(JSON.parse(input.sourceContext.sourceBytes.mappingBytes)).mappings,
    ),
  };
  return Object.freeze({
    schemaVersion: 'postwar-physical-office-facts-projector-v1' as const,
    classification:
      'DERIVED_COUNTRY_FACTS_PROJECTOR_NOT_READ_OR_COMMAND_AUTHORITY' as const,
    worldId: seed.worldId,
    seedFingerprint: seed.fingerprint,
    headWorldVersion: '0' as const,
    headEventSequence: '0' as const,
    physicalReceiptFingerprint: receipt.fingerprint,
    project(
      scope: Readonly<{ countryId: string; officeId: PostwarPhysicalOffice }>,
    ): PostwarPhysicalOfficeReadFacts {
      if (!Object.hasOwn(capabilities, scope.officeId))
        invalid('unsupported office');
      const bound = { worldId: seed.worldId, ...scope };
      return derive(
        {
          scope: bound,
          seed,
          operating,
          replayed: { headWorldVersion: '0', headEventSequence: '0', ledgers },
        },
        install(input.sourceContext, scope.countryId, shared),
        bound,
        receipt,
      );
    },
  });
}
export interface PostwarPhysicalOfficeRuntimeSource {
  readonly schemaVersion: 'postwar-physical-office-runtime-source-v1';
  readonly status: 'ADMITTED_OPENING_AT_H0';
  readonly scope: AuthorizedAdmittedOpeningSource['scope'];
  readonly boundary: AuthorizedAdmittedOpeningSource['boundary'];
  readonly facts: PostwarPhysicalOfficeReadFacts;
  readonly replayCoverage: 'HELD_H0_CANONICAL_INVENTORY_AND_IMMUTABLE_SOURCE_CAPACITIES_ONLY';
}
export interface PostwarPhysicalOfficeRuntimeSourcePort {
  withSourceFrom<Result>(
    executor: SqlExecutor,
    authorization: AuthorizedOfficeContext,
    consume: (source: PostwarPhysicalOfficeRuntimeSource) => Promise<Result>,
  ): Promise<Result>;
}
const leases = new WeakMap<
    object,
    { executor: SqlExecutor; active: boolean }
  >(),
  ports = new WeakSet<object>();
export function createPostwarPhysicalOfficeRuntimeSource(input: {
  readonly scope: Scope;
  readonly sourceContext: PostwarPhysicalSourceContext;
  readonly authorizationPublisherRole: string;
  readonly runtimeReaderRole: string;
}): PostwarPhysicalOfficeRuntimeSourcePort {
  const scope = freeze({ ...input.scope });
  if (!Object.hasOwn(capabilities, scope.officeId))
    invalid('unsupported office');
  const installation = install(input.sourceContext, scope.countryId);
  const common = createAuthorizedAdmittedOpeningSource({
    scope,
    capabilities: capabilities[scope.officeId],
    authorizationPublisherRole: input.authorizationPublisherRole,
    runtimeReaderRole: input.runtimeReaderRole,
  });
  const port: PostwarPhysicalOfficeRuntimeSourcePort = Object.freeze({
    async withSourceFrom<Result>(
      executor: SqlExecutor,
      authorization: AuthorizedOfficeContext,
      consume: (source: PostwarPhysicalOfficeRuntimeSource) => Promise<Result>,
    ): Promise<Result> {
      return common.withSourceFrom(executor, authorization, async (held) => {
        consumeAuthorizedAdmittedOpeningSourceFrom(executor, held);
        const facts = derive(held, installation, scope);
        const source: PostwarPhysicalOfficeRuntimeSource = freeze({
          schemaVersion: 'postwar-physical-office-runtime-source-v1',
          status: 'ADMITTED_OPENING_AT_H0',
          scope: held.scope,
          boundary: held.boundary,
          facts,
          replayCoverage:
            'HELD_H0_CANONICAL_INVENTORY_AND_IMMUTABLE_SOURCE_CAPACITIES_ONLY',
        });
        const lease = { executor, active: true };
        leases.set(source, lease);
        try {
          return await consume(source);
        } finally {
          lease.active = false;
        }
      });
    },
  });
  ports.add(port);
  return port;
}
export function consumePostwarPhysicalOfficeRuntimeSourceFrom(
  executor: SqlExecutor,
  source: PostwarPhysicalOfficeRuntimeSource,
): PostwarPhysicalOfficeRuntimeSource {
  const lease = leases.get(source);
  if (!lease?.active || lease.executor !== executor)
    invalid('source scope expired');
  return source;
}
export async function readPostwarPhysicalOfficeApiFrom(input: {
  readonly executor: SqlExecutor;
  readonly authorization: AuthorizedOfficeContext;
  readonly source: PostwarPhysicalOfficeRuntimeSourcePort;
}): Promise<PostwarPhysicalOfficeRuntimeSource> {
  if (!ports.has(input.source)) invalid('fixed server source port required');
  return input.source.withSourceFrom(
    input.executor,
    input.authorization,
    async (source) => {
      consumePostwarPhysicalOfficeRuntimeSourceFrom(input.executor, source);
      return freeze(
        JSON.parse(
          canonicalSerialize(source),
        ) as PostwarPhysicalOfficeRuntimeSource,
      );
    },
  );
}
