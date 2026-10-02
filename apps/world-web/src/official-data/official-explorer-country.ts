import {
  OFFICIAL_EXPLORER_COUNTRY_FILES,
  OFFICIAL_EXPLORER_SOURCE,
} from './official-explorer-country-manifest.js';
import type {
  OfficialExplorerCountryLoadResult,
  OfficialExplorerCountryPayload,
} from './official-explorer-country-types.js';
export type * from './official-explorer-country-types.js';

const referencePattern = /^(?:visual-territory-)?(0[1-9]|[1-6][0-9]|70)$/;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;
const numeric = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const point = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((v) => typeof v === 'number' && Number.isFinite(v));
const box = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length === 4 &&
  value.every((v) => typeof v === 'number' && Number.isFinite(v)) &&
  value[2] > 0 &&
  value[3] > 0;
const profileMetrics = [
  'population',
  'labourForce',
  'scenarioEmployed',
  'scenarioUnemployed',
  'foodProductionTonnesDay',
  'foodDemandTonnesDay',
  'foodAvailableStockTonnes',
  'foodReservedTonnes',
  'foodInTransitTonnes',
  'dailyIncomeGcu',
  'treasuryCentralBankBalanceGcu',
  'bankDepositsGcu',
  'bankReservesGcu',
  'bankLoansGcu',
  'bankEquityGcu',
  'historicalDebtGcu',
];
const facilityMetrics = [
  'estimatedCapacity',
  'requiredWorkers',
  'requiredPowerMW',
  'requiredWaterM3Day',
  'maintenanceGcuDay',
  'equipmentUnits',
  'constructionSimDays',
];
const depositMetrics = [
  'initialGeological',
  'historicalConsumed',
  'cumulativeExtracted',
  'remainingGeological',
  'discoveredRemaining',
  'recoverableRemaining',
  'developedRemaining',
  'qualityProxy',
  'depthM',
  'developmentDifficulty',
  'extractionCapacityPerDay',
  'runtimeExtractionPerDay',
];

function numberFor(
  reference: string,
): keyof typeof OFFICIAL_EXPLORER_COUNTRY_FILES | null {
  return (
    (referencePattern.exec(reference)?.[1] as
      keyof typeof OFFICIAL_EXPLORER_COUNTRY_FILES | undefined) ?? null
  );
}
function rows(
  value: unknown,
  countryId: string,
): value is Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    value.every((row) => record(row) && row.countryId === countryId)
  );
}
function unique(rows: Record<string, unknown>[]): boolean {
  return (
    rows.every((row) => text(row.id)) &&
    new Set(rows.map((row) => row.id)).size === rows.length
  );
}

/** Structural display validation is deliberately separate from byte identity.
 * Only the loader combines both; this predicate grants no live authority. */
export function validateOfficialExplorerCountryPayload(
  value: unknown,
  reference: string,
): value is OfficialExplorerCountryPayload {
  const number = numberFor(reference);
  if (!number || !record(value)) return false;
  const spec = OFFICIAL_EXPLORER_COUNTRY_FILES[number],
    id = `visual-territory-${number}`;
  const { profile, officialOpening: opening } = value;
  if (
    value.id !== id ||
    value.number !== number ||
    !text(value.name) ||
    !text(value.color) ||
    typeof value.coastal !== 'boolean' ||
    !numeric(value.areaKm2) ||
    !box(value.viewBox) ||
    !box(value.frame) ||
    value.scene !== `assets/scenes/${number}.png` ||
    !text(value.detail) ||
    !value.detail.startsWith(`assets/details/${number}-`) ||
    !value.detail.endsWith('.svg') ||
    !Array.isArray(value.neighbours) ||
    !value.neighbours.every(
      (v) =>
        typeof v === 'string' &&
        referencePattern.test(v) &&
        v.startsWith('visual-territory-'),
    ) ||
    !Array.isArray(value.climateMix) ||
    !value.climateMix.every(record) ||
    value.sourceStatus !== OFFICIAL_EXPLORER_SOURCE.sourceStatus ||
    (value.liveWorldState !== undefined && value.liveWorldState !== false) ||
    !record(profile) ||
    profile.countryId !== id ||
    profile.bindingStatus !== 'OPENING_SEED_NOT_COMMITTED' ||
    !profileMetrics.every((key) => numeric(profile[key])) ||
    profile.population !== spec.population ||
    !record(opening) ||
    opening.sourcePackageId !== OFFICIAL_EXPLORER_SOURCE.packageId ||
    opening.countriesSha256 !== OFFICIAL_EXPLORER_SOURCE.countriesSha256 ||
    opening.worldId !== null ||
    opening.openingSeedCommitted !== false ||
    !record(opening.finance) ||
    opening.finance.countryId !== id ||
    !record(opening.employment) ||
    opening.employment.countryId !== id ||
    !['stocks', 'productionPlans', 'populationServices'].every(
      (key) => rows(opening[key], id) && (opening[key] as unknown[]).length > 0,
    ) ||
    !record(value.power) ||
    value.power.countryId !== id ||
    !rows(value.facilities, id) ||
    !unique(value.facilities) ||
    value.facilities.length !== spec.facilities ||
    !rows(value.resources, id) ||
    !unique(value.resources) ||
    value.resources.length !== spec.resources ||
    !rows(value.regions, id) ||
    !unique(value.regions) ||
    value.regions.length !== spec.regions
  )
    return false;
  const resourceIds = new Set(value.resources.map((row) => row.id)),
    regionIds = new Set(value.regions.map((row) => row.id));
  for (const facility of value.facilities) {
    const r = facility.record;
    if (
      !point(facility.point) ||
      !(
        facility.anchor === null ||
        (point(facility.anchor) &&
          (facility.anchor as number[]).every((n) => n >= 0 && n <= 1))
      ) ||
      !(facility.projectId === null || text(facility.projectId)) ||
      !(facility.projectNumber === null || numeric(facility.projectNumber)) ||
      !(
        facility.resourceId === undefined ||
        facility.resourceId === null ||
        resourceIds.has(facility.resourceId)
      ) ||
      !text(facility.kind) ||
      !text(facility.name) ||
      !record(r) ||
      r.id !== facility.id ||
      r.countryId !== id ||
      r.name !== facility.name ||
      r.projectId !== facility.projectId ||
      !facilityMetrics.every((key) => numeric(r[key])) ||
      ![
        'lifecycle',
        'capacityUnit',
        'recipeStatus',
        'scenarioRole',
        'sourceStatus',
      ].every((key) => text(r[key])) ||
      typeof r.operational !== 'boolean' ||
      typeof r.openingAvailabilityProposal !== 'boolean'
    )
      return false;
  }
  for (const resource of value.resources) {
    const d = resource.deposit;
    if (
      !point(resource.point) ||
      !text(resource.kind) ||
      !text(resource.commodityId) ||
      !text(resource.visibility) ||
      resource.tradable !== false ||
      !record(resource.type) ||
      resource.type.id !== resource.kind ||
      !['name', 'symbol', 'color'].every((key) =>
        text((resource.type as Record<string, unknown>)[key]),
      ) ||
      !record(d) ||
      d.id !== resource.id ||
      d.countryId !== id ||
      d.commodityId !== resource.commodityId ||
      !regionIds.has(d.regionId) ||
      !point(d.point) ||
      JSON.stringify(d.point) !== JSON.stringify(resource.point) ||
      !text(d.unit) ||
      !depositMetrics.every((key) => numeric(d[key]))
    )
      return false;
  }
  for (const region of value.regions) {
    if (
      !point(region.label) ||
      !numeric(region.areaKm2) ||
      !record(region.landUseKm2) ||
      !Object.values(region.landUseKm2).every(numeric) ||
      !record(region.natural) ||
      !record(region.initial) ||
      !['population', 'labourForce', 'workingAge'].every((key) =>
        numeric((region.initial as Record<string, unknown>)[key]),
      )
    )
      return false;
  }
  if (
    value.regions.reduce(
      (sum, row) => sum + (row.initial as Record<string, number>).population!,
      0,
    ) !== profile.population
  )
    return false;
  if (value.officialSource === undefined) return false;
  {
    const source = value.officialSource;
    if (
      !record(source) ||
      source.schemaVersion !== 'OFFICIAL_UI_FIELD_PROVENANCE_V1' ||
      source.sourcePackageId !== OFFICIAL_EXPLORER_SOURCE.packageId ||
      source.sourceChecksumsSha256 !==
        OFFICIAL_EXPLORER_SOURCE.selectionChecksumSha256 ||
      source.authority !== 'SELECTED_SOURCE_NOT_RUNTIME' ||
      !record(source.datasets) ||
      !Object.values(source.datasets).every(
        (v) =>
          record(v) &&
          text(v.sourcePath) &&
          typeof v.sha256 === 'string' &&
          /^[0-9a-f]{64}$/.test(v.sha256),
      ) ||
      !record(source.fields) ||
      !Object.entries(source.fields).every(
        ([pointer, field]) =>
          pointer.startsWith('/') &&
          record(field) &&
          [
            'exact',
            'rawToken',
            'dataset',
            'rowId',
            'field',
            'sourcePointer',
            'unit',
            'unitBasis',
            'nature',
          ].every((key) => text(field[key])) &&
          Number.isSafeInteger(field.rowIndex) &&
          (field.rowIndex as number) >= 0,
      ) ||
      !record(source.collections)
    )
      return false;
  }
  return true;
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export interface OfficialExplorerCountryLoaderOptions {
  readonly fetcher?: typeof fetch;
  /** Application root, not a dataset/API URL. Defaults to Vite's public base. */
  readonly baseUrl?: string | URL;
  readonly crypto?: Pick<Crypto, 'subtle'>;
}

export function createOfficialExplorerCountryLoader(
  options: OfficialExplorerCountryLoaderOptions = {},
) {
  return Object.freeze({
    async load(
      reference: string,
      request: { readonly signal?: AbortSignal } = {},
    ): Promise<OfficialExplorerCountryLoadResult> {
      const number = numberFor(reference);
      if (!number) return { kind: 'error', reason: 'COUNTRY_ID_INVALID' };
      if (request.signal?.aborted)
        return { kind: 'stale', reason: 'READ_ABORTED' };
      let base: URL;
      try {
        base =
          options.baseUrl === undefined
            ? new URL(import.meta.env.BASE_URL, globalThis.location.href)
            : new URL(options.baseUrl);
        if (
          base.username ||
          base.password ||
          base.search ||
          base.hash ||
          (base.protocol !== 'https:' &&
            !(
              base.protocol === 'http:' &&
              ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
            ))
        )
          throw Error();
        if (!base.pathname.endsWith('/')) base.pathname += '/';
      } catch {
        return { kind: 'error', reason: 'BASE_URL_INVALID' };
      }
      const crypto = options.crypto ?? globalThis.crypto;
      if (!crypto?.subtle)
        return { kind: 'error', reason: 'CRYPTO_UNAVAILABLE' };
      const controller = new AbortController();
      let timeout = false;
      const onAbort = () => controller.abort();
      request.signal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => {
        timeout = true;
        controller.abort();
      }, 5000);
      let releaseAbort: (() => void) | undefined;
      try {
        const aborted = new Promise<OfficialExplorerCountryLoadResult>(
          (resolve) => {
            releaseAbort = () =>
              resolve(
                timeout
                  ? { kind: 'error', reason: 'READ_TIMEOUT' }
                  : { kind: 'stale', reason: 'READ_ABORTED' },
              );
            controller.signal.addEventListener('abort', releaseAbort, {
              once: true,
            });
          },
        );
        const read = async (): Promise<OfficialExplorerCountryLoadResult> => {
          const response = await (options.fetcher ?? fetch)(
            new URL(`season1-immersive/countries/data/${number}.json`, base),
            {
              signal: controller.signal,
              method: 'GET',
              credentials: 'omit',
              redirect: 'error',
              cache: 'no-store',
              referrerPolicy: 'no-referrer',
              headers: { accept: 'application/json' },
            },
          );
          if (controller.signal.aborted)
            return { kind: 'stale', reason: 'READ_ABORTED' };
          if (response.status === 404)
            return { kind: 'missing', reason: 'COUNTRY_FILE_MISSING' };
          if (
            !response.ok ||
            !response.headers
              .get('content-type')
              ?.toLowerCase()
              .includes('application/json') ||
            !response.body
          )
            return { kind: 'error', reason: 'SOURCE_UNAVAILABLE' };
          const reader = response.body.getReader(),
            parts: Uint8Array[] = [];
          const spec = OFFICIAL_EXPLORER_COUNTRY_FILES[number];
          let length = 0;
          const stop = () => {
            void reader.cancel().catch(() => undefined);
          };
          controller.signal.addEventListener('abort', stop, { once: true });
          try {
            while (true) {
              const part = await reader.read();
              if (controller.signal.aborted)
                return { kind: 'stale', reason: 'READ_ABORTED' };
              if (part.done) break;
              length += part.value.byteLength;
              if (length > spec.bytes) {
                stop();
                return { kind: 'error', reason: 'SOURCE_TOO_LARGE' };
              }
              parts.push(part.value);
            }
          } finally {
            controller.signal.removeEventListener('abort', stop);
            reader.releaseLock();
          }
          if (length !== spec.bytes)
            return { kind: 'error', reason: 'SOURCE_HASH_MISMATCH' };
          const bytes = new Uint8Array(length);
          let offset = 0;
          for (const part of parts) {
            bytes.set(part, offset);
            offset += part.byteLength;
          }
          const digest = new Uint8Array(
            await crypto.subtle.digest('SHA-256', bytes),
          );
          if (controller.signal.aborted)
            return { kind: 'stale', reason: 'READ_ABORTED' };
          const hash = Array.from(digest, (b) =>
            b.toString(16).padStart(2, '0'),
          ).join('');
          if (hash !== spec.sha256)
            return { kind: 'error', reason: 'SOURCE_HASH_MISMATCH' };
          const payload: unknown = JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(bytes),
          );
          if (!validateOfficialExplorerCountryPayload(payload, reference))
            return { kind: 'error', reason: 'SOURCE_INVALID' };
          return {
            kind: 'ready',
            data: freeze({
              ...payload,
              population: payload.profile.population,
              source: {
                kind: 'selected-source-display' as const,
                packageId: OFFICIAL_EXPLORER_SOURCE.packageId,
                countriesSha256: OFFICIAL_EXPLORER_SOURCE.countriesSha256,
                selectionChecksumSha256:
                  OFFICIAL_EXPLORER_SOURCE.selectionChecksumSha256,
                countryFileSha256: hash,
                liveWorldState: false as const,
                proposalFieldsAreExecuted: false as const,
                worldId: null,
                openingSeedCommitted: false as const,
              },
            }),
          };
        };
        return await Promise.race([read(), aborted]);
      } catch {
        return { kind: 'error', reason: 'SOURCE_UNAVAILABLE' };
      } finally {
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', onAbort);
        if (releaseAbort)
          controller.signal.removeEventListener('abort', releaseAbort);
        controller.abort();
      }
    },
  });
}
