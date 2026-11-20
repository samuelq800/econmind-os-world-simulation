/** Browser-safe derived current records. These grant no inventory, title,
 * source admission or transfer authority. */
import {
  parsePostwarCurrentPageProof,
  type PostwarCurrentPageProof,
} from './postwar-extended-current-reducer.js';
export const POSTWAR_TRADE_CURRENT_DATASETS = Object.freeze([
  'inventory-current',
  'goods-transfers-current',
] as const);
export type PostwarTradeCurrentDataset =
  (typeof POSTWAR_TRADE_CURRENT_DATASETS)[number];
export const POSTWAR_TRADE_CURRENT_NATURE =
  'ADMITTED_CURRENT_TRADE_COMPLETE_PREFIX' as const;
export interface PostwarTradeInventoryRow {
  readonly schemaVersion: 'postwar-trade-current-inventory-row-v1';
  readonly countryId: string;
  readonly commodityId: string;
  readonly batchId: string;
  readonly unit: string;
  readonly physicalLocationId: string;
  readonly bucket: 'AVAILABLE' | 'RESERVED' | 'IN_TRANSIT';
  readonly reservationId: string | null;
  readonly shipmentId: string | null;
  readonly titleHolderId: string;
  readonly riskBearerId: string;
  readonly economicRecognitionId: string | null;
  readonly quantity: string;
}
export interface PostwarTradeTransferRow {
  readonly schemaVersion: 'postwar-trade-current-transfer-row-v1';
  readonly transferCommandId: string;
  readonly transferFingerprint: string;
  readonly sellerCountryId: string;
  readonly buyerCountryId: string;
  readonly commodityId: string;
  readonly batchId: string;
  readonly quantity: string;
  readonly unit: string;
  readonly reservationId: string;
  readonly shipmentId: string | null;
  readonly status: 'RESERVED' | 'SHIPPED' | 'DELIVERED';
}
export interface PostwarTradeCurrentCoverage {
  readonly schemaVersion: 'postwar-trade-current-page-chain-coverage-v1';
  readonly reducerVersion: 'POSTWAR_COMPLETE_MIXED_PAGED_PREFIX_V1';
  readonly countryId: string;
  readonly coverageRef: string;
  readonly globalWorldVersion: string;
  readonly globalEventSequence: string;
  readonly prefixFingerprint: string;
  readonly knownEffectsFingerprint: string;
  readonly coveredThroughEventId: string;
  readonly coveredThroughEventFingerprint: string;
  readonly financialPostingCount: string;
  readonly financialBatchCount: string;
  readonly financialPostingsFingerprint: string;
  readonly pageProof: Readonly<PostwarCurrentPageProof>;
  readonly inventoryRowsHash: string;
  readonly transferRowsHash: string;
}
const id = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z][A-Za-z0-9._:-]{0,255}$/u.test(v);
const unit = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z][A-Za-z0-9 _/-]{0,63}$/u.test(v);
const country = (v: unknown): v is string =>
  typeof v === 'string' && /^COUNTRY_(?:0[1-9]|[1-6][0-9]|70)$/u.test(v);
const hash = (v: unknown): v is string =>
  typeof v === 'string' && /^sha256:[a-f0-9]{64}$/u.test(v);
const uint = (v: unknown): v is string =>
  typeof v === 'string' && /^(?:0|[1-9]\d*)$/u.test(v);
const amount = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length <= 256 &&
  /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u.test(v);
function record(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).sort().join('|') !== [...keys].sort().join('|')
  )
    throw Error('TRADE_CURRENT_EXACT_WIRE_FIELDS_REQUIRED');
  return v as Record<string, unknown>;
}
export function parsePostwarTradeInventoryRow(
  v: unknown,
): Readonly<PostwarTradeInventoryRow> {
  const r = record(v, [
    'schemaVersion',
    'countryId',
    'commodityId',
    'batchId',
    'unit',
    'physicalLocationId',
    'bucket',
    'reservationId',
    'shipmentId',
    'titleHolderId',
    'riskBearerId',
    'economicRecognitionId',
    'quantity',
  ]);
  if (
    r.schemaVersion !== 'postwar-trade-current-inventory-row-v1' ||
    !country(r.countryId) ||
    ![
      'commodityId',
      'batchId',
      'physicalLocationId',
      'titleHolderId',
      'riskBearerId',
    ].every((k) => id(r[k])) ||
    !unit(r.unit) ||
    !['reservationId', 'shipmentId', 'economicRecognitionId'].every(
      (k) => r[k] === null || id(r[k]),
    ) ||
    !['AVAILABLE', 'RESERVED', 'IN_TRANSIT'].includes(String(r.bucket)) ||
    !amount(r.quantity) ||
    r.quantity === '0' ||
    (r.bucket === 'AVAILABLE' &&
      (r.reservationId !== null || r.shipmentId !== null)) ||
    (r.bucket === 'RESERVED' &&
      (r.reservationId === null || r.shipmentId !== null)) ||
    (r.bucket === 'IN_TRANSIT' &&
      (r.reservationId !== null || r.shipmentId === null))
  )
    throw Error('TRADE_CURRENT_INVENTORY_ROW_REQUIRED');
  return Object.freeze({
    ...r,
  }) as unknown as Readonly<PostwarTradeInventoryRow>;
}
export function parsePostwarTradeTransferRow(
  v: unknown,
): Readonly<PostwarTradeTransferRow> {
  const r = record(v, [
    'schemaVersion',
    'transferCommandId',
    'transferFingerprint',
    'sellerCountryId',
    'buyerCountryId',
    'commodityId',
    'batchId',
    'quantity',
    'unit',
    'reservationId',
    'shipmentId',
    'status',
  ]);
  if (
    r.schemaVersion !== 'postwar-trade-current-transfer-row-v1' ||
    !['transferCommandId', 'commodityId', 'batchId', 'reservationId'].every(
      (k) => id(r[k]),
    ) ||
    !unit(r.unit) ||
    !hash(r.transferFingerprint) ||
    !country(r.sellerCountryId) ||
    !country(r.buyerCountryId) ||
    r.sellerCountryId === r.buyerCountryId ||
    !amount(r.quantity) ||
    r.quantity === '0' ||
    !['RESERVED', 'SHIPPED', 'DELIVERED'].includes(String(r.status)) ||
    (r.status === 'RESERVED' ? r.shipmentId !== null : !id(r.shipmentId))
  )
    throw Error('TRADE_CURRENT_TRANSFER_ROW_REQUIRED');
  return Object.freeze({
    ...r,
  }) as unknown as Readonly<PostwarTradeTransferRow>;
}
export function parsePostwarTradeCurrentCoverage(
  v: unknown,
): Readonly<PostwarTradeCurrentCoverage> {
  const r = record(v, [
    'schemaVersion',
    'reducerVersion',
    'countryId',
    'coverageRef',
    'globalWorldVersion',
    'globalEventSequence',
    'prefixFingerprint',
    'knownEffectsFingerprint',
    'coveredThroughEventId',
    'coveredThroughEventFingerprint',
    'financialPostingCount',
    'financialBatchCount',
    'financialPostingsFingerprint',
    'pageProof',
    'inventoryRowsHash',
    'transferRowsHash',
  ]);
  const proof = parsePostwarCurrentPageProof(r.pageProof, {
    worldVersion: String(r.globalWorldVersion),
    eventSequence: String(r.globalEventSequence),
  });
  if (
    r.schemaVersion !== 'postwar-trade-current-page-chain-coverage-v1' ||
    r.reducerVersion !== 'POSTWAR_COMPLETE_MIXED_PAGED_PREFIX_V1' ||
    !country(r.countryId) ||
    !id(r.coverageRef) ||
    !id(r.coveredThroughEventId) ||
    ![
      'prefixFingerprint',
      'knownEffectsFingerprint',
      'coveredThroughEventFingerprint',
      'financialPostingsFingerprint',
      'inventoryRowsHash',
      'transferRowsHash',
    ].every((k) => hash(r[k])) ||
    ![
      'globalWorldVersion',
      'globalEventSequence',
      'financialPostingCount',
      'financialBatchCount',
    ].every((k) => uint(r[k])) ||
    r.globalWorldVersion === '0' ||
    BigInt(String(r.globalEventSequence)) <
      BigInt(String(r.globalWorldVersion)) ||
    proof.frameCount !== r.globalWorldVersion
  )
    throw Error('TRADE_CURRENT_COMPLETE_COVERAGE_REQUIRED');
  return Object.freeze({
    ...r,
    pageProof: proof,
  }) as unknown as Readonly<PostwarTradeCurrentCoverage>;
}
