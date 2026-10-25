import { types as nodeTypes } from 'node:util';
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  PRODUCTION_CONSUMPTION_SCHEMA_VERSION,
  canonicalSerialize,
  createProductionConsumptionPosting,
  inventoryPostingId,
  type AuthoritativeTransition,
  type CanonicalCommand,
  type InventoryProductionPosting,
  type ProductionConsumptionEvidence,
  type Sha256Hex,
} from '@econmind/core';

export function industryInputInvalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `Industry finite source input: ${reason}`,
  );
}
export function industryClosedRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    nodeTypes.isProxy(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    industryInputInvalid('CLOSED_RECORD_REQUIRED');
  const actual = Reflect.ownKeys(value);
  if (
    actual.length !== keys.length ||
    actual.some((k) => typeof k !== 'string' || !keys.includes(k))
  )
    industryInputInvalid('CLOSED_RECORD_REQUIRED');
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const p = Object.getOwnPropertyDescriptor(value, key);
    if (!p || !Object.hasOwn(p, 'value'))
      industryInputInvalid('DATA_FIELDS_ONLY');
    result[key] = p.value;
  }
  return result;
}
/** Finite inert copy, not a generic serializer, source issuer or admission. */
export function copyIndustrySourceData(value: unknown): unknown {
  let nodes = 0;
  const seen = new Set<object>();
  function visit(v: unknown, depth: number): unknown {
    if (depth > 16 || ++nodes > 10000) industryInputInvalid('DATA_BOUND');
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      if (new TextEncoder().encode(v).length > 262144)
        industryInputInvalid('DATA_BOUND');
      return v;
    }
    if (typeof v !== 'object') industryInputInvalid('INERT_DATA_REQUIRED');
    if (nodeTypes.isProxy(v)) industryInputInvalid('INERT_DATA_REQUIRED');
    if (seen.has(v)) industryInputInvalid('CYCLIC_DATA');
    seen.add(v);
    let result: unknown;
    if (Array.isArray(v)) {
      if (v.length > 10000 || Reflect.ownKeys(v).length !== v.length + 1)
        industryInputInvalid('DENSE_ARRAY_REQUIRED');
      result = Object.freeze(
        Array.from({ length: v.length }, (_, n) => {
          const p = Object.getOwnPropertyDescriptor(v, String(n));
          if (!p || !Object.hasOwn(p, 'value'))
            industryInputInvalid('DATA_FIELDS_ONLY');
          return visit(p.value, depth + 1);
        }),
      );
    } else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(v)))
        industryInputInvalid('INERT_DATA_REQUIRED');
      const entries = Reflect.ownKeys(v).map((k) => {
        if (typeof k !== 'string' || k === '__proto__' || k.length > 512)
          industryInputInvalid('INERT_DATA_REQUIRED');
        const p = Object.getOwnPropertyDescriptor(v, k);
        if (!p || !Object.hasOwn(p, 'value'))
          industryInputInvalid('DATA_FIELDS_ONLY');
        return [k, visit(p.value, depth + 1)] as const;
      });
      result = Object.freeze(Object.fromEntries(entries));
    }
    seen.delete(v);
    return result;
  }
  const result = visit(value, 0);
  if (new TextEncoder().encode(canonicalSerialize(result)).length > 262144)
    industryInputInvalid('DATA_BOUND');
  return result;
}
const accountKeys = [
  'worldId',
  'countryId',
  'commodityId',
  'batchId',
  'physicalLocationId',
  'titleHolderId',
  'riskBearerId',
  'bucket',
  'unit',
  'economicRecognitionId',
  'reservationId',
  'shipmentId',
];
function array(v: unknown): readonly unknown[] {
  if (!Array.isArray(v)) industryInputInvalid('ARRAY_REQUIRED');
  return v;
}
function quantity(v: unknown) {
  industryClosedRecord(v, ['amount', 'unit']);
}
function rate(v: unknown) {
  industryClosedRecord(v, ['amount', 'inputUnit', 'outputUnit']);
}
function trace(v: unknown) {
  const t = industryClosedRecord(v, [
    'traceRef',
    'calculationVersion',
    'snapshot',
    'snapshotAt',
  ]);
  industryClosedRecord(t.snapshot, [
    'lineageRef',
    'sourceVersion',
    'snapshotRef',
    'snapshotHash',
    'predecessorSnapshotHash',
  ]);
  quantity(t.snapshotAt);
}
function fact(v: unknown, keys: readonly string[]) {
  const f = industryClosedRecord(v, [
    'factRef',
    'sourceRef',
    'predecessorFactRefs',
    'snapshot',
    'observedAt',
    'payload',
    'canonicalPayload',
  ]);
  industryClosedRecord(f.snapshot, [
    'lineageRef',
    'sourceVersion',
    'snapshotRef',
    'snapshotHash',
    'predecessorSnapshotHash',
  ]);
  quantity(f.observedAt);
  array(f.predecessorFactRefs);
  return industryClosedRecord(f.payload, keys);
}
function evidence(v: unknown): ProductionConsumptionEvidence {
  const e = industryClosedRecord(v, [
    'runId',
    'inventorySnapshotHash',
    'input',
    'recipe',
    'operating',
    'materials',
    'output',
  ]);
  const i = industryClosedRecord(e.input, [
    'trace',
    'outcomeRef',
    'capacity',
    'materials',
    'energy',
    'labour',
    'logistics',
  ]);
  trace(i.trace);
  const c = fact(i.capacity, [
    'facilityRef',
    'operationalCapacity',
    'operatingDuration',
    'targetUtilisation',
    'productivity',
  ]);
  rate(c.operationalCapacity);
  rate(c.productivity);
  quantity(c.operatingDuration);
  quantity(c.targetUtilisation);
  for (const m of array(i.materials)) {
    const p = fact(m, [
      'materialRef',
      'inventoryRef',
      'v12AvailabilityRef',
      'readOnly',
      'usableBefore',
      'requiredAtPotentialOutput',
    ]);
    quantity(p.usableBefore);
    quantity(p.requiredAtPotentialOutput);
  }
  const energy = fact(i.energy, [
    'allocationRef',
    'deliveredBefore',
    'requiredAtPotentialOutput',
  ]);
  quantity(energy.deliveredBefore);
  quantity(energy.requiredAtPotentialOutput);
  for (const name of ['labour', 'logistics']) {
    const p = fact(i[name], [
      'capacityRef',
      'availableBefore',
      'requiredAtPotentialOutput',
    ]);
    quantity(p.availableBefore);
    quantity(p.requiredAtPotentialOutput);
  }
  const r = fact(e.recipe, [
    'facilityRef',
    'outputCommodityId',
    'outputUnit',
    'materials',
    'energyPerOutput',
    'labourPerOutput',
    'logisticsPerOutput',
    'costPerOutput',
  ]);
  for (const m of array(r.materials)) {
    const p = industryClosedRecord(m, [
      'materialRef',
      'commodityId',
      'perOutput',
    ]);
    rate(p.perOutput);
  }
  for (const name of [
    'energyPerOutput',
    'labourPerOutput',
    'logisticsPerOutput',
    'costPerOutput',
  ])
    rate(r[name]);
  const op = fact(e.operating, [
    'worldId',
    'worldVersion',
    'facilityRef',
    'operatorId',
    'operatorClassification',
    'maintenanceAppliedRef',
    'technologyRightRef',
    'operatingPermissionRef',
    'costSourceRef',
    'fundingBatchId',
    'fundingFingerprint',
    'costLegId',
    'settledCost',
  ]);
  industryClosedRecord(op.settledCost, ['amount', 'currency']);
  industryClosedRecord(e.output, accountKeys);
  for (const m of array(e.materials)) {
    const p = industryClosedRecord(m, ['materialRef', 'account']);
    industryClosedRecord(p.account, accountKeys);
  }
  return v as ProductionConsumptionEvidence;
}

/** Constructor validation only. Official reader/writer schema refusals remain. */
export function decodeIndustryProductionRow(input: {
  readonly row: unknown;
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly sha256Hex: Sha256Hex;
}): Readonly<InventoryProductionPosting> {
  const row = industryClosedRecord(input.row, [
    'canonical_payload',
    'causation_command_id',
    'fingerprint',
  ]);
  let raw: unknown = row.canonical_payload;
  if (typeof raw === 'string') {
    if (new TextEncoder().encode(raw).length > 262144)
      industryInputInvalid('DATA_BOUND');
    try {
      raw = JSON.parse(raw);
    } catch {
      industryInputInvalid('INVALID_JSON');
    }
  }
  const p = industryClosedRecord(copyIndustrySourceData(raw), [
    'schemaVersion',
    'postingId',
    'worldId',
    'causationCommandId',
    'causationEventIds',
    'worldVersionBefore',
    'worldVersionAfter',
    'simTime',
    'transitionBinding',
    'operation',
    'entries',
    'evidence',
    'result',
  ]);
  if (
    p.schemaVersion !== PRODUCTION_CONSUMPTION_SCHEMA_VERSION ||
    p.operation !== 'PRODUCE_AND_CONSUME' ||
    row.causation_command_id !== input.command.commandId
  )
    industryInputInvalid('PRODUCTION_SCOPE_MISMATCH');
  if (typeof p.postingId !== 'string')
    industryInputInvalid('POSTING_ID_REQUIRED');
  const posting = createProductionConsumptionPosting(
    {
      postingId: inventoryPostingId(p.postingId),
      command: input.command,
      transition: input.transition,
      evidence: evidence(p.evidence),
    },
    input.sha256Hex,
  );
  const canonical = JSON.parse(canonicalSerialize(posting)) as Record<
    string,
    unknown
  >;
  const fingerprint = canonical.fingerprint;
  delete canonical.fingerprint;
  if (
    canonicalSerialize(canonical) !== canonicalSerialize(p) ||
    fingerprint !== row.fingerprint
  )
    industryInputInvalid('CANONICAL_POSTING_OR_FINGERPRINT_MISMATCH');
  return posting;
}
