/** Authorized historical opening pages, never a current physical projection.
 * SQL owns current identity/seat/entitlement and immutable document admission.
 * This adapter keeps origin H0 separate from the actual observed global head. */
import { canonicalSerialize } from '@econmind/core';
import {
  createPostwarOfficeProjectionStore,
  POSTWAR_PROJECTION_PAGE_QUERY,
  POSTWAR_PROJECTION_RESPONSE_MAX,
  type PostwarOfficeProjectionPage,
  type PostwarOfficeProjectionSeatHeader,
} from './postwar-office-projection-store.js';
import type { SqlExecutor } from './sql-database.js';

export const POSTWAR_PHYSICAL_OPENING_PAGE_QUERY =
  'select * from world_v2.read_postwar_physical_opening_facts_page($1,$2,$3,$4,$5,$6)';
export const POSTWAR_PHYSICAL_OPENING_DATASETS = Object.freeze({
  INDUSTRY: ['opening-inventory-entries', 'regional-source-capacity'],
  TRADE: ['opening-inventory-entries'],
  CAPTAIN: ['regional-source-capacity', 'public-service-summary'],
} as const);
type Office = keyof typeof POSTWAR_PHYSICAL_OPENING_DATASETS;
type Page = Extract<PostwarOfficeProjectionPage, { status: 'PAGE' | 'EMPTY' }>;
type Unavailable = Readonly<{
  status: 'UNAVAILABLE' | 'DENIED' | 'STALE';
  code: string;
}>;
const currentFields = Object.freeze({
  'opening-inventory-entries': [
    'quantity',
    'bucket',
    'titleHolderId',
    'riskBearerId',
    'physicalLocationId',
    'reservationId',
    'shipmentId',
  ],
  'regional-source-capacity': [
    'sourceInitial',
    'currentPopulation',
    'currentEmployment',
    'staffing',
    'actualDelivery',
    'occupancy',
  ],
  'public-service-summary': [
    'demandCount',
    'capacityCount',
    'allocatedCount',
    'unallocatedCount',
    'staffing',
    'occupancy',
  ],
} as const);
export interface PostwarPhysicalOpeningRequest {
  readonly worldId: string;
  readonly officeId: Office;
  readonly dataset: string;
  readonly offset?: number;
  readonly limit?: number;
  readonly expectedVersion?: string;
  readonly view?: 'OPENING_FACTS' | 'CURRENT';
}
export type PostwarPhysicalOpeningHeadPage = Omit<Page, 'source'> &
  Readonly<{
    source: Omit<Page['source'], 'dataNature'> &
      Readonly<{
        dataNature: 'ADMITTED_IMMUTABLE_OPENING_FACTS';
        originWorldVersion: '0';
        originEventSequence: '0';
        observedHead: Readonly<{
          worldVersion: string;
          eventSequence: string;
        }>;
      }>;
    currentState: Readonly<{
      status: 'UNAVAILABLE';
      code: 'CURRENT_PHYSICAL_STATE_REPLAY_REQUIRED';
      fields: readonly string[];
    }>;
  }>;
const unavailable = (code: string): Unavailable =>
  Object.freeze({ status: 'UNAVAILABLE', code });
function validRequest(input: PostwarPhysicalOpeningRequest): void {
  if (Object.hasOwn(input, 'countryId'))
    throw Error('POSTWAR_PHYSICAL_OPENING:COUNTRY_SCOPE_IS_SERVER_SELECTED');
  if (
    !Object.hasOwn(POSTWAR_PHYSICAL_OPENING_DATASETS, input.officeId) ||
    !(
      POSTWAR_PHYSICAL_OPENING_DATASETS[input.officeId] as readonly string[]
    ).includes(input.dataset) ||
    (input.view !== undefined &&
      input.view !== 'OPENING_FACTS' &&
      input.view !== 'CURRENT')
  )
    throw Error(
      'POSTWAR_PHYSICAL_OPENING:EXACT_OFFICE_DATASET_AND_VIEW_REQUIRED',
    );
}
function sameAdmission(
  page: Page,
  header: PostwarOfficeProjectionSeatHeader,
): boolean {
  return (
    canonicalSerialize(page.scope) === canonicalSerialize(header.scope) &&
    [
      'admissionRef',
      'seedId',
      'seedFingerprint',
      'modelVersion',
      'replayBinding',
      'sourceBundleSha256',
    ].every(
      (key) =>
        page.source[key as keyof Page['source']] ===
        header.source[key as keyof typeof header.source],
    ) &&
    page.source.worldVersion === '0' &&
    page.source.eventSequence === '0' &&
    page.source.dataNature === 'DERIVED_RAW_FROM_ADMITTED_H0_NOT_AUTHORITY'
  );
}
/** Fixed SQL redirect reuses the existing bounded role/scope/hash/lossless JSON
 * parser. It does not supply rows, Ready flags or an alternate caller loader.
 * The new SQL function has the old page's five-column result contract and must
 * retain all admission/revocation/seat/page checks, without its H0-head veto. */
export function createPostwarPhysicalOpeningHeadReader(configuration: {
  readonly runtimeReaderRole: string;
  readonly authorizationPublisherRole: string;
  readonly expectedSeedFingerprint: string;
}) {
  if (!/^sha256:[0-9a-f]{64}$/u.test(configuration.expectedSeedFingerprint))
    throw Error('POSTWAR_PHYSICAL_OPENING:TRUSTED_SEED_FINGERPRINT_REQUIRED');
  const store = createPostwarOfficeProjectionStore(configuration);
  return Object.freeze({
    async readPageFrom(
      tx: SqlExecutor,
      input: PostwarPhysicalOpeningRequest,
    ): Promise<PostwarPhysicalOpeningHeadPage | Unavailable> {
      validRequest(input);
      const before = (await store.readCurrentSeatHeadersFrom(tx, input)).filter(
        (h) => h.scope.officeId === input.officeId,
      );
      if (before.length !== 1)
        return Object.freeze({
          status: 'DENIED',
          code: 'CURRENT_EXACT_OFFICE_SEAT_REQUIRED',
        });
      const header = before[0]!;
      if (
        header.source.seedFingerprint !== configuration.expectedSeedFingerprint
      )
        return unavailable('PINNED_OPENING_ADMISSION_REQUIRED');
      if (input.view === 'CURRENT')
        return unavailable('CURRENT_PHYSICAL_STATE_REPLAY_REQUIRED');
      const fixed: SqlExecutor = {
        query: (sql, args) =>
          tx.query(
            sql === POSTWAR_PROJECTION_PAGE_QUERY
              ? POSTWAR_PHYSICAL_OPENING_PAGE_QUERY
              : sql,
            args,
          ),
      };
      let page: PostwarOfficeProjectionPage;
      try {
        page = await store.readPageFrom(fixed, input);
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === '42883'
        )
          return unavailable('PHYSICAL_OPENING_READ_FUNCTION_NOT_INSTALLED');
        throw error;
      }
      if ('code' in page) return page;
      if (!sameAdmission(page, header))
        return unavailable('OPENING_AND_CURRENT_ADMISSION_SCOPE_MISMATCH');
      const after = (await store.readCurrentSeatHeadersFrom(tx, input)).filter(
        (h) => h.scope.officeId === input.officeId,
      );
      if (
        after.length !== 1 ||
        canonicalSerialize(after[0]) !== canonicalSerialize(header)
      )
        return unavailable('CURRENT_READ_BINDING_CHANGED');
      const { dataNature: _oldNature, ...source } = page.source;
      void _oldNature;
      const result: PostwarPhysicalOpeningHeadPage = {
        ...page,
        source: Object.freeze({
          ...source,
          dataNature: 'ADMITTED_IMMUTABLE_OPENING_FACTS',
          originWorldVersion: '0',
          originEventSequence: '0',
          observedHead: Object.freeze({
            worldVersion: header.source.worldVersion,
            eventSequence: header.source.eventSequence,
          }),
        }),
        currentState: Object.freeze({
          status: 'UNAVAILABLE',
          code: 'CURRENT_PHYSICAL_STATE_REPLAY_REQUIRED',
          fields: currentFields[input.dataset as keyof typeof currentFields],
        }),
      };
      if (
        Buffer.byteLength(JSON.stringify(result)) >
        POSTWAR_PROJECTION_RESPONSE_MAX
      )
        return unavailable('OPENING_FACTS_RESPONSE_TOO_LARGE');
      return Object.freeze(result);
    },
  });
}
