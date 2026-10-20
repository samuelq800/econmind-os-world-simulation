/** Offline, single retained event conversion. No writer, runtime or admission. */
import { parseLossless, sha256 } from '../unknown2544-c-physical/candidate.mjs';
import {
  exactDecimalAdd,
  exactDecimalMultiply,
} from '../../packages/testkit/src/exact-decimal-oracle.ts';

export const TRANSPORT_SHA256 =
  '2781606115a9b74116814024995052560275386bbfe22a8df1b418de37b90e96';
export const CATALOGUE_SHA256 =
  'b1f9a100bdb80627e31801ffaf1b2c7863a2996cedba0344de8a899c616eff2b';
const VERSION = 'CONSTRUCTED_SCENARIO_FIRST14_20261013_V1_PROPOSED';
const TYPE = 'ACCEPTED_PHYSICAL_MACHINERY_ARRIVAL';
const SOURCE_NODE = 'visual-territory-24-E1-URBAN_CLUSTER';
const DESTINATION_NODE = 'visual-territory-13-E1-RURAL_SETTLEMENT_NETWORK';

function requireFact(condition, diagnostic) {
  if (!condition) throw new Error(diagnostic);
}

/** Lexical expansion only; observations never pass through Number. Bounds are
 * resource limits, not rounding: unsupported representations fail explicitly. */
function canonicalDecimal(token) {
  requireFact(typeof token === 'string', 'DECIMAL_TOKEN_REQUIRED');
  requireFact(token.length <= 2048, 'DECIMAL_REPRESENTATION_LIMIT');
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/u.exec(token);
  requireFact(match, 'NONNEGATIVE_FINITE_DECIMAL_REQUIRED');
  const fraction = match[2] ?? '';
  const exponent = BigInt(match[3] ?? '0');
  requireFact(exponent >= -1000n && exponent <= 1000n, 'DECIMAL_SCALE_LIMIT');
  const scale = BigInt(fraction.length) - exponent;
  requireFact(scale <= 1000n, 'DECIMAL_SCALE_LIMIT');
  let digits = match[1] + fraction;
  // Only bounded lexical positions/counts are converted, never the observation.
  if (scale < 0n) digits += '0'.repeat(Number(-scale));
  requireFact(digits.length <= 1000, 'DECIMAL_DIGIT_LIMIT');
  const places = scale > 0n ? Number(scale) : 0;
  digits = digits.padStart(places + 1, '0');
  const point = digits.length - places;
  const decimal = places
    ? `${digits.slice(0, point)}.${digits.slice(point)}`
    : digits;
  return exactDecimalAdd(decimal, '0');
}

function eventFacts(event) {
  const source = event?.sourceEvent;
  return {
    sourcePointer: event?.sourcePointer,
    simDay: event?.simDay,
    realDay: event?.realDay,
    country: event?.country,
    type: event?.type,
    status: event?.status,
    countsAsDeliveredGoods: event?.countsAsDeliveredGoods,
    countsAsWorldReceipt: event?.countsAsWorldReceipt,
    simDay1: source?.simDay1,
    tripId: source?.tripId,
    orderId: source?.orderId,
    sourceType: source?.type,
    sourceNodeId: source?.sourceNodeId,
    destinationNodeId: source?.destinationNodeId,
    acceptedNative: source?.acceptedNative,
    lostNative: source?.lostNative,
    actualPaidReferenceGcu: source?.actualPaidReferenceGcu,
  };
}

function convert(transportBytes, catalogueBytes, pinned) {
  const result = {
    schemaVersion: 1,
    class: pinned
      ? 'REFERENCE_ACCEPTED_FREIGHT_TONNES_SOURCE_CANDIDATE'
      : 'UNVERIFIED_REFERENCE_INSPECTION_ONLY',
    status: 'REJECTED',
    diagnostics: [],
    sourceBytesVerified: pinned,
    provenance: {
      transport: {
        sourceFile: 'RECONSTRUCTION_TRANSPORT_EVENTS.json',
        sha256: sha256(transportBytes),
        bytes: transportBytes.length,
      },
      catalogue: {
        sourceFile:
          'artifacts/world-balanced-candidate-v1/data/commodity-catalog.json',
        sha256: sha256(catalogueBytes),
        bytes: catalogueBytes.length,
      },
      eventPointer: '/events/780',
      upstreamPointer: '/fieldShipmentEvents/19',
      orderPointer: '/orders/2',
      commodityPointer: '/9',
      acceptedNativePointer: '/events/780/sourceEvent/acceptedNative',
      unitPointer: '/9/unit',
      factorPointer: '/9/freightTonnesPerUnit',
      upstreamJournalReread: false,
    },
    sourceVersion: null,
    sourceStatus: null,
    identity: null,
    operands: null,
    matchingEventRows: null,
    uniqueAcceptedEvents: null,
    sourceCountsAsDeliveredGoods: null,
    derivedReferenceFreightTonnes: null,
    actualAcceptedFreightTonnes: null,
    referenceTonneKm: null,
    actualTonneKm: null,
    periodMinimum: null,
    completeNativeCost: null,
    countsAsWorldReceipt: false,
    actualWorldPosting: false,
    sourceAdmitted: false,
    productionAuthority: false,
    actualEntityMappingEstablished: false,
    actualClockOrPeriodAdopted: false,
    originalStages: {
      sourceAccepted: false,
      candidateComplete: false,
      independentReviewApproved: false,
      originalFieldClosed: false,
    },
    originalIdsStillOpen: [
      'U2544::COUNTRY::COUNTRY_13::transportMinimum',
      'U2544::COUNTRY::COUNTRY_13::transportCompleteCostNative',
    ],
  };
  try {
    const transport = parseLossless(transportBytes);
    const catalogue = parseLossless(catalogueBytes);
    requireFact(transport?.version === VERSION, 'SOURCE_VERSION_MISMATCH');
    requireFact(
      transport.actualWorldPosting === false,
      'WORLD_POSTING_NOT_FALSE',
    );
    requireFact(Array.isArray(transport.events), 'EVENT_ARRAY_REQUIRED');
    requireFact(Array.isArray(transport.orders), 'ORDER_ARRAY_REQUIRED');
    requireFact(Array.isArray(catalogue), 'CATALOGUE_ARRAY_REQUIRED');
    const event = transport.events[780];
    const source = event?.sourceEvent;
    const order = transport.orders[2];
    const commodity = catalogue[9];
    result.sourceVersion = transport.version;
    result.sourceStatus = event?.status ?? null;
    requireFact(
      event?.sourcePointer === '/fieldShipmentEvents/19' &&
        source?.tripId === 'FIELD-00002' &&
        source?.orderId === 'MACH-24-13',
      'SELECTED_EVENT_IDENTITY_MISMATCH',
    );
    const matches = transport.events.filter(
      (row) =>
        row?.sourcePointer === '/fieldShipmentEvents/19' ||
        (row?.sourceEvent?.tripId === 'FIELD-00002' &&
          row?.sourceEvent?.orderId === 'MACH-24-13'),
    );
    result.matchingEventRows = matches.length;
    const facts = JSON.stringify(eventFacts(event));
    requireFact(
      matches.every((row) => JSON.stringify(eventFacts(row)) === facts),
      'CONFLICTING_EVENT_DUPLICATE',
    );
    requireFact(
      event.type === TYPE &&
        source.type === TYPE &&
        event.status === 'RETAINED_REFERENCE_ONLY' &&
        event.countsAsDeliveredGoods === true &&
        event.countsAsWorldReceipt === false,
      'ACCEPTED_REFERENCE_EVENT_REQUIRED',
    );
    requireFact(
      event.simDay === '35' && source.simDay1 === '35' && event.realDay === '4',
      'REFERENCE_EVENT_TIME_MISMATCH',
    );
    result.sourceCountsAsDeliveredGoods = event.countsAsDeliveredGoods;
    // Country on the outer event is the SELLER, not buyer/recipient.
    requireFact(
      order?.orderId === 'MACH-24-13' &&
        order.sellerCountry === '24' &&
        order.buyerCountry === '13' &&
        event.country === order.sellerCountry &&
        order.commodityId === 'MACHINERY' &&
        source.sourceNodeId === SOURCE_NODE &&
        source.destinationNodeId === DESTINATION_NODE &&
        order.actualWorldPosting === false,
      'ORDER_COMMODITY_PARTY_DESTINATION_MISMATCH',
    );
    requireFact(
      transport.orders.filter((row) => row?.orderId === order.orderId)
        .length === 1,
      'ORDER_ID_NOT_UNIQUE',
    );
    requireFact(
      commodity?.id === 'MACHINERY' &&
        catalogue.filter((row) => row?.id === 'MACHINERY').length === 1,
      'COMMODITY_IDENTITY_MISMATCH',
    );
    result.identity = {
      tripId: source.tripId,
      orderId: source.orderId,
      sellerCountryNumber: order.sellerCountry,
      buyerCountryNumber: order.buyerCountry,
      commodityId: order.commodityId,
      sourceNodeId: source.sourceNodeId,
      destinationNodeId: source.destinationNodeId,
      referenceSimDay: event.simDay,
      aggregateOrderStatus: order.status ?? null,
    };
    result.operands = {
      acceptedNativeRawToken: source.acceptedNative ?? null,
      acceptedNative: null,
      nativePhysicalUnit: commodity.unit ?? null,
      sourceTonnesPerUnitRawToken: commodity.freightTonnesPerUnit ?? null,
      tonnesPerUnit: null,
      factorUnit: 'tonne/equipment unit',
      resultUnit: 'tonne',
    };
    const missing = [
      ['ACCEPTED_QUANTITY', source.acceptedNative],
      ['PHYSICAL_UNIT', commodity.unit],
      ['FREIGHT_FACTOR', commodity.freightTonnesPerUnit],
    ].filter(
      ([, value]) => value === undefined || value === null || value === '',
    );
    if (missing.length) {
      result.status = 'GAP';
      result.diagnostics = missing.map(([key]) => `MISSING_${key}`);
      return result;
    }
    requireFact(commodity.unit === 'equipment unit', 'PHYSICAL_UNIT_MISMATCH');
    const quantity = canonicalDecimal(source.acceptedNative);
    const factor = canonicalDecimal(commodity.freightTonnesPerUnit);
    requireFact(factor !== '0', 'POSITIVE_FREIGHT_FACTOR_REQUIRED');
    result.operands.acceptedNative = quantity;
    result.operands.tonnesPerUnit = factor;
    result.derivedReferenceFreightTonnes = exactDecimalMultiply(
      quantity,
      factor,
    );
    result.uniqueAcceptedEvents = 1;
    result.status = 'REFERENCE_ONLY';
  } catch (error) {
    result.diagnostics = [error.message];
  }
  return result;
}

/** Only this entry point binds the immutable approved real-file source pins.
 * Caller retains exact bytes outside Git; no I/O or source writes occur here. */
export function extractPinnedAcceptedFreight({
  transportBytes,
  catalogueBytes,
}) {
  requireFact(
    transportBytes.length === 1833026 &&
      sha256(transportBytes) === TRANSPORT_SHA256,
    'TRANSPORT_SOURCE_DRIFT',
  );
  requireFact(
    catalogueBytes.length === 1933 &&
      sha256(catalogueBytes) === CATALOGUE_SHA256,
    'CATALOGUE_SOURCE_DRIFT',
  );
  return convert(transportBytes, catalogueBytes, true);
}

/** Semantic guard inspection for untrusted/TEST_ONLY bytes. Cannot claim fixed
 * source verification even if the inspected bytes happen to match the pins. */
export function inspectUntrustedAcceptedFreight({
  transportBytes,
  catalogueBytes,
}) {
  return convert(transportBytes, catalogueBytes, false);
}
