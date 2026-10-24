/** Fixed selected normative methods only. No fs/network, policy issuer,
 * operational calculation, source admission, record-set or World mutation.
 */
import pins from './source-pins.json' with { type: 'json' };
import { parseLossless, sha256 } from '../unknown2544-c-physical/candidate.mjs';

function need(ok, message) {
  if (!ok) throw new Error(message);
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const fixed = freeze(pins);
const REQUEST_KEYS = [
  'mode',
  'stableId',
  'countryId',
  'originalUnit',
  'currency',
  'periodOrValueDate',
  'methodSources',
];
const SOURCE_KEYS = [
  'adoptionReceiptBytes',
  'methodPacketBytes',
  'originalLedgerBytes',
];
function closed(value, keys) {
  need(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'METHOD_OBJECT_REQUIRED',
  );
  need(
    Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key)),
    'METHOD_CLOSED_KEYS_REQUIRED',
  );
}
function captureRequest(caller) {
  closed(caller, REQUEST_KEYS);
  const caps = {
    adoptionReceiptBytes: fixed.sources.adoptionReceiptBytes.bytes,
    methodPacketBytes: fixed.sources.B02.bytes,
    originalLedgerBytes: fixed.sources.originalLedgerBytes.bytes,
  };
  // Every caller getter once, each view copied immediately before another
  // getter runs. Caps precede copying; hash/parse/selection use only these bytes.
  return Object.fromEntries(
    Object.keys(caller).map((key) => {
      const value = caller[key];
      if (key !== 'methodSources') return [key, structuredClone(value)];
      closed(value, SOURCE_KEYS);
      return [
        key,
        Object.fromEntries(
          Object.keys(value).map((sourceKey) => {
            const bytes = value[sourceKey];
            need(
              bytes instanceof Uint8Array,
              `METHOD_BYTES_REQUIRED:${sourceKey}`,
            );
            need(
              bytes.byteLength <= caps[sourceKey],
              `METHOD_BYTE_CAP:${sourceKey}`,
            );
            return [sourceKey, Buffer.from(bytes)];
          }),
        ),
      ];
    }),
  );
}
function validate(input, section) {
  const target = fixed.targets[section];
  need(input.mode === fixed.mode, 'ADOPTED_C01_METHOD_MODE_REQUIRED');
  need(
    input.countryId === 'COUNTRY_01' && input.stableId === target.stableId,
    'ONLY_EXACT_C01_METHOD_TARGET',
  );
  need(
    input.originalUnit === target.originalUnit,
    'METHOD_ORIGINAL_UNIT_MISMATCH',
  );
  need(
    input.currency === null && input.periodOrValueDate === null,
    'METHOD_ACTUAL_CURRENCY_AND_PERIOD_MUST_BE_NULL',
  );
  const sourcePins = {
    adoptionReceiptBytes: fixed.sources.adoptionReceiptBytes,
    methodPacketBytes: fixed.sources[section],
    originalLedgerBytes: fixed.sources.originalLedgerBytes,
  };
  const parsed = {};
  for (const key of SOURCE_KEYS) {
    const bytes = input.methodSources[key],
      pin = sourcePins[key];
    need(
      bytes.length === pin.bytes && sha256(bytes) === pin.sha256,
      `METHOD_SOURCE_DRIFT:${key}`,
    );
    parsed[key] = parseLossless(bytes);
  }
  const receipt = parsed.adoptionReceiptBytes,
    packet = parsed.methodPacketBytes;
  need(
    receipt.recordId ===
      'OWNER_DIRECT_20261023_C01_B02_ORDINARY_POTABLE_V2_B03_METHOD_V2_B04_DEFERRED' &&
      JSON.stringify(receipt.countryScope) === '["COUNTRY_01"]',
    'METHOD_EXACT_RECEIPT_SCOPE_REQUIRED',
  );
  need(
    receipt.B04.status === 'OWNER_EXPLICITLY_CONTINUES_DEFERRED_NOT_ADOPTED',
    'B04_MUST_REMAIN_DEFERRED',
  );
  const adoption = receipt[section];
  need(
    adoption.methodId === target.methodId &&
      adoption.source.sha256 === sourcePins.methodPacketBytes.sha256,
    'METHOD_RECEIPT_PACKET_BINDING',
  );
  const original = parsed.originalLedgerBytes.records[target.ledgerIndex];
  need(
    original.stableId === target.stableId &&
      original.ownerId === 'COUNTRY_01' &&
      original.countryId === 'COUNTRY_01' &&
      original.missingField === target.stableId.split('::').at(-1) &&
      original.originalUnit === target.originalUnit &&
      original.afterActualField.value === null,
    'METHOD_ORIGINAL_LEDGER_BINDING',
  );
  if (section === 'B02') {
    need(
      adoption.status ===
        'OWNER_ADOPTED_BOUNDED_PROSPECTIVE_ORDINARY_POTABLE_SUBMETHOD_ONLY' &&
        adoption.wholeProtectedServiceFloorAdopted === false &&
        adoption.other69CountriesAdopted === false &&
        adoption.examplesAdoptedAsActualNeedOrSupply === false,
      'B02_SUBMETHOD_ONLY',
    );
    need(
      packet.proposalId === target.methodId &&
        packet.originalId === target.stableId &&
        packet.countryId === 'COUNTRY_01',
      'B02_METHOD_IDENTITY',
    );
    const keys = [
      'normalCriticalRelationship',
      'coverageAndPublicPurpose',
      'netPotableQuantityUnitsAndPhysicalRecipe',
      'qualityAcceptanceProfile',
      'positiveProspectiveInterval',
    ];
    need(
      Array.isArray(packet.parameters) &&
        packet.parameters.length === 5 &&
        packet.parameters.every(
          (p, i) => p.key === keys[i] && p.parameter === String(i + 1),
        ),
      'B02_FIVE_METHOD_DEFINITIONS_REQUIRED',
    );
    const period = packet.parameters[4];
    need(
      period.fromRelativeSimDay === '0' &&
        period.untilRelativeSimDayExclusive === '7' &&
        period.durationSimDays === '7' &&
        adoption.period.from === '0' &&
        adoption.period.untilExclusive === '7' &&
        adoption.period.automaticRenewal === false,
      'B02_EXACT_SEVEN_DAY_RELATIVE_METHOD',
    );
  } else {
    need(
      adoption.status ===
        'OWNER_ADOPTED_PROSPECTIVE_SCOPED_ADMIN_SERVICE_METHOD_ONLY' &&
        adoption.source.pointer === '/feePolicy' &&
        adoption.source.excludedPointer === '/bufferRule',
      'B03_FEE_POLICY_ONLY',
    );
    need(
      packet.feePolicy.decisionId === target.methodId &&
        packet.feePolicy.method === 'FRACTIONAL_NATIVE' &&
        packet.feePolicy.rateFraction === '1' &&
        packet.feePolicy.precision.kind === 'EXACT_NO_ROUNDING' &&
        packet.feePolicy.precision.maxFractionDigits === null,
      'B03_EXACT_FEE_METHOD_REQUIRED',
    );
    need(
      Object.keys(packet.independentRealSourceBindings).length === 13 &&
        Object.values(packet.independentRealSourceBindings).every(
          (v) => v === null,
        ),
      'B03_ACTUAL_SOURCE_BINDINGS_MUST_REMAIN_NULL',
    );
  }
  return { target, sourcePins, receipt, packet, adoption, original };
}
function readSelected(input, section) {
  // The one validator is used by both method readers; no trusted-view injection.
  const { target, sourcePins, receipt, packet, adoption, original } = validate(
    input,
    section,
  );
  const evidence = (key, pointer) => ({
    ...sourcePins[key],
    pointer,
    verification:
      'EXACT_BYTES_AND_SELECTED_METHOD_RECEIPT_ONLY_NOT_SOURCE_ADMISSION',
  });
  const adoptionEvidence = evidence('adoptionReceiptBytes', `/${section}`);
  const methodEvidence = evidence('methodPacketBytes', target.methodPointer);
  const sourceDefinition =
    section === 'B02'
      ? {
          proposalId: packet.proposalId,
          countryId: packet.countryId,
          parameters: packet.parameters,
        }
      : packet.feePolicy;
  const methodBoundary =
    section === 'B02'
      ? {
          ordinaryPotableOnly: true,
          wholeProtectedFloorAdopted: false,
          actualRequiredNeedFrontier: null,
          actualCompletedServiceFrontier: null,
          actualQualityAcceptedCreditFrontier: null,
          actualNationalMinimum: null,
          actualAcceptedDelivery: null,
          excludedAdoption: [
            'planning population and capacity observations',
            'planningDemandExamples',
            'physicalResourcePressure',
            'resourceStressExample',
            'actualResourceObservations',
            'other69 countries',
            'one-day70-country applicability',
          ],
          qualityProfileLineage: {
            ...adoption.quality,
            verification:
              'RECEIPT_BOUND_LINEAGE_ONLY_EXTERNAL_QUALITY_PROFILE_BYTES_NOT_READ',
          },
          declaredMethodPeriod: adoption.period,
        }
      : {
          actualSourceBindings: packet.independentRealSourceBindings,
          actualPolicyPeriod: null,
          actualNativeCurrency: null,
          actualNativePrecision: null,
          actualPayer: null,
          actualProvider: null,
          actualCharge: null,
          actualPayment: null,
          bufferRule: { status: receipt.B04.status, adopted: false },
          meaning:
            'BINDING_SPECIFICATION_ONLY_NOT_AN_OPERATIONAL_FEE_POLICY_DRAFT_DTO',
        };
  return freeze({
    schema: 'C_ORIGINAL_ID_ADOPTED_C01_METHOD_READ_V1',
    status:
      section === 'B02'
        ? 'ADOPTED_ORDINARY_POTABLE_SUBMETHOD_REFERENCE_AVAILABLE_ACTUAL_NEED_UNBOUND'
        : 'ADOPTED_FEE_METHOD_REFERENCE_AVAILABLE_ACTUAL_POLICY_BINDING_UNBOUND',
    stableId: target.stableId,
    countryId: 'COUNTRY_01',
    methodAdoptionApplied: true,
    methodAdoptionMeaning:
      'ONLY_SELECTED_NORMATIVE_METHOD_NOT_ORIGINAL_FIELD_OR_RECORD_SET_ADOPTION',
    adoptedMethod: {
      methodId: target.methodId,
      countryId: 'COUNTRY_01',
      selectedPointer: target.methodPointer,
      sourceDefinition,
      adoptionEvidence,
    },
    sourceHistoricalStatus: packet.status,
    sourceSchema: packet.schemaVersion ?? packet.schema,
    methodBoundary,
    originalAcceptanceRule: original.acceptanceRule,
    originalDependencies: original.dependencies,
    originalBinding: {
      sourceEvidence: evidence(
        'originalLedgerBytes',
        `/records/${target.ledgerIndex}`,
      ),
      originalRecord: original,
    },
    candidateMeasure: {
      ...original.afterActualField,
      periodOrValueDate: null,
      applicableWorldGenesisHead: null,
    },
    sourceTrace: [
      adoptionEvidence,
      methodEvidence,
      evidence('originalLedgerBytes', `/records/${target.ledgerIndex}`),
    ],
    adoptionEvidence,
    originalStages: {
      sourceComplete: false,
      engineeringWired: false,
      validationPassed: false,
      formallyAdopted: false,
    },
    actualValue: null,
    actualCurrency: null,
    actualPeriod: null,
    actualWorld: null,
    actualQuantities: null,
    actualFeeAmount: null,
    actualPayment: null,
    actualCash: null,
    sourceAdmitted: false,
    runtimeConnected: false,
    productionAuthority: false,
    recordSetAdopted: false,
    originalFieldsClosed: 0,
  });
}

/** One fee-method implementation, identity-reexported by the existing TS facade.
 * It does not invoke the draft fee/event/buffer/cash calculation engine.
 */
export function readAdoptedCountry01FeeMethod(caller) {
  return readSelected(captureRequest(caller), 'B03');
}
export function readAdoptedCountry01Method(caller) {
  const input = captureRequest(caller);
  // This is the exact same fee function, not a TS-facade module-load hop.
  if (input.stableId === fixed.targets.B03.stableId)
    return readAdoptedCountry01FeeMethod(input);
  return readSelected(input, 'B02');
}
