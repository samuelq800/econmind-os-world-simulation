/** Original-ID reference and explicit adopted-recipe read. No runtime admission.
 * Reuses frozen C outputs, not their large-source extractors or replay models.
 */
import pins from './source-pins.json' with { type: 'json' };
import { extractPinnedAcceptedFreight } from '../unknown2544-c-transport-source/accepted-freight.mjs';
import { produceWaterServiceCandidate } from '../unknown2544-c-water-service/produce-candidate.mjs';
import { readAdoptedCountry01Method } from '../unknown2544-c-method-adoption/adoption-view.mjs';
import {
  FIELD_BATCH,
  parseLossless,
  sha256,
  decimal,
} from '../unknown2544-c-physical/candidate.mjs';

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export const SOURCE_PINS = freeze(pins);
export const COUNTRIES = Object.freeze(['COUNTRY_01', 'COUNTRY_53']);
export const ORIGINAL_IDS = Object.freeze(
  COUNTRIES.flatMap((country) =>
    Object.keys(FIELD_BATCH).map(
      (field) => `U2544::COUNTRY::${country}::${field}`,
    ),
  ),
);
const UNITS = {
  labourMinimumHours: 'HOUR/PERIOD',
  labourPayrollNative: 'NATIVE_MONEY',
  waterPotableDeliveredMinimum: 'M3/PERIOD',
  waterCompleteCostNative: 'NATIVE_MONEY',
  energyDeliveredMinimum: 'MWH/PERIOD',
  energyCompleteCostNative: 'NATIVE_MONEY',
  transportMinimum: 'TONNE_KM/PERIOD',
  transportCompleteCostNative: 'NATIVE_MONEY',
};
const PHYSICAL_GAPS = {
  B10: 'No adopted service skill-hour recipe, source timesheet/available hours, skill matching or worker-day-to-hour rule',
  B11: 'No scoped raw/net grant validity, actual potable quality, treatment/network operation or accepted net delivery',
  B12: 'No adopted essential load, actual simulation hours, energization/dispatch/loss or accepted MWh delivery',
  B13: 'No accepted titled cargo, verified route distance, correct mode or service period; unsigned plans are not arrivals',
};
const COST_GAPS = {
  B10: 'Native legal wages, benefits/statutory costs, actual employer/payer and period absent; repair wages not payroll',
  B11: 'No inclusive tariff or disjoint labour/energy/chemical/maintenance/quality/network/storage/freight/fees coverage',
  B12: 'No native inclusive tariff or disjoint fuel/labour/maintenance/storage and network cost coverage',
  B13: 'No native contracted freight/insurance/fuel/fees coverage and explicit inclusions/exclusions',
};
function requireThat(ok, diagnostic) {
  if (!ok) throw new Error(diagnostic);
}
function at(value, pointer) {
  requireThat(
    typeof pointer === 'string' && pointer.startsWith('/'),
    'BAD_POINTER',
  );
  return pointer
    .slice(1)
    .split('/')
    .reduce((v, k) => {
      requireThat(
        v !== null && typeof v === 'object' && Object.hasOwn(v, k),
        'MISSING_SOURCE_LEAF',
      );
      return v[k];
    }, value);
}

/** Legacy pinned buffers retain the16 reference reads. The explicit adopted-only
 * constructor defers fixed R3/C16 verification to each COUNTRY01 read, without
 * loading unrelated reference sources. Neither route admits operating facts.
 */
export function createOriginalFieldConsumer(buffers) {
  if (buffers?.mode === 'ADOPTED_C01_METHODS_ONLY') {
    requireThat(
      Object.keys(buffers).length === 1,
      'ONLY_EXPLICIT_C01_METHOD_CONSUMER_MODE',
    );
    return Object.freeze({
      read: readAdoptedCountry01Method,
      snapshot() {
        throw new Error(
          'REFERENCE_SNAPSHOT_NOT_LOADED_IN_C01_METHOD_ONLY_MODE',
        );
      },
    });
  }
  if (buffers?.mode === 'CONSTRUCTED_RECIPE_INTERMEDIATES_ONLY') {
    requireThat(
      Object.keys(buffers).length === 1,
      'ONLY_EXPLICIT_CONSTRUCTED_CONSUMER_MODE',
    );
    return Object.freeze({
      read(callerRequest) {
        const allowed = [
          'mode',
          'stableId',
          'countryId',
          'originalUnit',
          'currency',
          'periodOrValueDate',
          'proposalSources',
        ];
        requireThat(
          callerRequest !== null &&
            typeof callerRequest === 'object' &&
            !Array.isArray(callerRequest),
          'CONSTRUCTED_REQUEST_OBJECT_REQUIRED',
        );
        const keys = Object.keys(callerRequest);
        requireThat(
          keys.length === allowed.length &&
            keys.every((key) => allowed.includes(key)),
          'CONSTRUCTED_CLOSED_REQUEST_REQUIRED',
        );
        // Read each caller getter once and detach immediately, before reading
        // the next property. The producer validates and uses these same bytes.
        const request = Object.fromEntries(
          keys.map((key) => {
            const value = callerRequest[key];
            if (key !== 'proposalSources') return [key, structuredClone(value)];
            requireThat(
              value !== null &&
                typeof value === 'object' &&
                !Array.isArray(value),
              'CONSTRUCTED_SOURCE_OBJECT_REQUIRED',
            );
            const sourceKeys = Object.keys(value);
            requireThat(
              sourceKeys.length === 3 &&
                sourceKeys.every((k) =>
                  [
                    'candidatePacketBytes',
                    'parameterProposalBytes',
                    'originalLedgerBytes',
                  ].includes(k),
                ),
              'CONSTRUCTED_CLOSED_SOURCES_REQUIRED',
            );
            return [
              key,
              Object.fromEntries(
                sourceKeys.map((sourceKey) => {
                  const bytes = value[sourceKey];
                  requireThat(
                    bytes instanceof Uint8Array,
                    `CONSTRUCTED_SOURCE_BYTES_REQUIRED:${sourceKey}`,
                  );
                  return [sourceKey, Buffer.from(bytes)];
                }),
              ),
            ];
          }),
        );
        requireThat(
          request.mode === 'CONSTRUCTED_RECIPE_INTERMEDIATES_ONLY',
          'CONSTRUCTED_INTERMEDIATE_MODE_REQUIRED',
        );
        return produceWaterServiceCandidate(request);
      },
      snapshot() {
        throw new Error(
          'REFERENCE_SNAPSHOT_NOT_LOADED_IN_CONSTRUCTED_ONLY_MODE',
        );
      },
    });
  }
  const readAdopted = (callerRequest) => {
    const requestKeys = Object.keys(callerRequest ?? {});
    requireThat(
      requestKeys.every((key) =>
        [
          'mode',
          'stableId',
          'countryId',
          'originalUnit',
          'currency',
          'periodOrValueDate',
          'adoptionSources',
          'recipeWork',
          'recordReadContract',
          'recordOriginClass',
          'recordKind',
          'record',
        ].includes(key),
      ),
      'UNSUPPORTED_AUTHORITY_OR_ARITHMETIC_OPTION',
    );
    // Capture each caller property once. Copy each source view immediately,
    // including Buffer/subarray/shared backing, before invoking other getters.
    // Validation, producer operands and historical row reads share this snapshot.
    const request = Object.fromEntries(
      requestKeys.map((key) => {
        const value = callerRequest[key];
        if (key !== 'adoptionSources') return [key, structuredClone(value)];
        if (value === null || typeof value !== 'object') return [key, value];
        return [
          key,
          Object.fromEntries(
            Object.keys(value).map((sourceKey) => {
              const bytes = value[sourceKey];
              return [
                sourceKey,
                bytes instanceof Uint8Array ? Buffer.from(bytes) : bytes,
              ];
            }),
          ),
        ];
      }),
    );
    requireThat(
      request.mode === 'ADOPTED_RECIPE_INTERMEDIATES_ONLY',
      'ADOPTED_INTERMEDIATE_MODE_REQUIRED',
    );
    requireThat(
      ORIGINAL_IDS.includes(request.stableId),
      'OUTSIDE_EXACT_16_SUBSET',
    );
    requireThat(
      request.stableId.startsWith('U2544::COUNTRY::COUNTRY_01::') &&
        request.countryId === 'COUNTRY_01',
      'COUNTRY01_ADOPTED_INTERMEDIATE_ONLY',
    );
    const field = request.stableId.split('::').at(-1);
    requireThat(
      request.originalUnit === UNITS[field],
      'ORIGINAL_UNIT_MISMATCH',
    );
    requireThat(request.periodOrValueDate === null, 'NO_ACTUAL_PERIOD_BOUND');
    requireThat(request.currency === null, 'NO_ACTUAL_CURRENCY_BOUND');
    const result = produceWaterServiceCandidate({
      mode: request.mode,
      originalRequest: {
        mode: 'ADOPTED_PARAMETERS_ONLY',
        stableId: request.stableId,
        countryId: request.countryId,
        originalUnit: request.originalUnit,
        currency: null,
        periodOrValueDate: null,
      },
      adoptionSources: request.adoptionSources,
      recipeWork: request.recipeWork,
      ...Object.fromEntries(
        ['recordReadContract', 'recordOriginClass', 'recordKind', 'record']
          .filter((key) => Object.hasOwn(request, key))
          .map((key) => [key, request[key]]),
      ),
    });
    // Parse the historical C16 row only after the genuine reader has verified
    // these exact bytes. No unrelated COUNTRY53 reference sources are needed.
    const adopted = result.parameterAdoptionRead;
    const row = adopted
      ? parseLossless(
          Buffer.from(request.adoptionSources.originalPacket),
        ).rows.find((r) => r.stableId === request.stableId)
      : null;
    const mid = result.parameterIntermediate;
    const relevant =
      mid === null
        ? null
        : FIELD_BATCH[field] === 'B10'
          ? { workerDaysBySkill: mid.workerDaysBySkill }
          : field === 'waterPotableDeliveredMinimum'
            ? {
                treatmentNetPotential: mid.treatmentNetPotential,
                theoreticalNetPotential: mid.theoreticalNetPotential,
                deliveryRatio: mid.deliveryRatio,
              }
            : field === 'waterCompleteCostNative'
              ? mid
              : FIELD_BATCH[field] === 'B12'
                ? { energyInputRequirement: mid.requiredInputs.ENERGY }
                : {
                    steelRequirement: mid.requiredInputs.STEEL,
                    machineryRequirement: mid.requiredInputs.MACHINERY,
                  };
    return freeze(
      structuredClone({
        schema: 'C_ORIGINAL_ID_ADOPTED_RECIPE_INTERMEDIATE_READ_V1',
        status: result.status,
        stableId: request.stableId,
        countryId: request.countryId,
        originalAcceptanceRule: row?.originalAcceptanceRule ?? null,
        originalBinding: row
          ? {
              packet: adopted.originalContract.sourceEvidence,
              ledger: row.originalLedger,
              gap: row.originalGapSource,
              parentBatch: row.parentBatch,
            }
          : null,
        candidateMeasure: row?.candidateMeasure ?? {
          status: 'BLOCKED_MISSING_SOURCE_OR_ADOPTION',
          value: null,
          unit: request.originalUnit,
          currency: null,
          periodOrValueDate: null,
          applicableWorldGenesisHead: null,
        },
        originalDependencies: row?.dependencies ?? null,
        originalStages: row?.reportedStageFlags ?? {
          sourceComplete: false,
          engineeringWired: false,
          validationPassed: false,
          formallyAdopted: false,
        },
        references: row?.references ?? null,
        referencesMeaning: 'HISTORICAL_C16_REFERENCE_CONTEXT_UNCHANGED',
        adoptionEvidence: null,
        parameterAdoptionRead: adopted ?? null,
        parameterConnection: result.parameterConnection,
        recipeIntermediate: relevant,
        ...(result.declaredRecordRead
          ? { declaredRecordRead: result.declaredRecordRead }
          : {}),
        sourceTrace: [
          ...(row
            ? [
                {
                  kind: 'ORIGINAL_C16_REFERENCE_BINDING',
                  packetEvidence: adopted.originalContract.sourceEvidence,
                  sourceEvidence: row.originalLedger,
                },
              ]
            : []),
          ...(result.sourceTrace ?? []),
        ],
        dependentResults: result.dependentResults ?? null,
        diagnostics: result.diagnostics,
        actualResultStatus: 'NOT_ORIGINAL_FIELD_ACCEPTANCE',
        sourceAdmitted: false,
        runtimeConnected: false,
        productionAuthority: false,
        originalFieldsClosed: 0,
      }),
    );
  };
  if (buffers?.mode === 'ADOPTED_RECIPE_INTERMEDIATES_ONLY') {
    requireThat(
      Object.keys(buffers).length === 1,
      'ONLY_EXPLICIT_ADOPTED_CONSUMER_MODE',
    );
    return Object.freeze({
      read: readAdopted,
      snapshot() {
        throw new Error('REFERENCE_SNAPSHOT_NOT_LOADED_IN_ADOPTED_ONLY_MODE');
      },
    });
  }
  const extended = Object.hasOwn(buffers, 'country13Transport');
  const extensionPin = SOURCE_PINS.referenceExtensions.country13Transport;
  let extension = null;
  if (extended) {
    requireThat(
      Object.keys(buffers).length ===
        Object.keys(SOURCE_PINS.sources).length + 1 &&
        Object.keys(buffers).every(
          (key) =>
            key === 'country13Transport' ||
            Object.hasOwn(SOURCE_PINS.sources, key),
        ),
      'C13_CLOSED_CONSTRUCTOR_KEYS_REQUIRED',
    );
    const callerExtension = buffers.country13Transport;
    const expectedKeys = ['contract', 'transportBytes', 'catalogueBytes'];
    requireThat(
      callerExtension !== null &&
        typeof callerExtension === 'object' &&
        Object.keys(callerExtension).length === 3 &&
        expectedKeys.every((key) => Object.hasOwn(callerExtension, key)),
      'C13_COMPLETE_EXTENSION_REQUIRED',
    );
    extension = Object.fromEntries(
      expectedKeys.map((key) => {
        const value = callerExtension[key];
        return [key, value instanceof Uint8Array ? Buffer.from(value) : value];
      }),
    );
    requireThat(
      extension.contract === extensionPin.contract,
      'C13_EXTENSION_CONTRACT_REQUIRED',
    );
    for (const [key, pinKey] of [
      ['transportBytes', 'transport'],
      ['catalogueBytes', 'catalogue'],
    ]) {
      const bytes = extension[key],
        pin = extensionPin[pinKey];
      requireThat(
        bytes instanceof Uint8Array &&
          bytes.byteLength === pin.bytes &&
          sha256(bytes) === pin.sha256,
        'C13_SOURCE_DRIFT:' + pinKey,
      );
    }
    // Active path copies every legacy source once before validation/row use.
    buffers = Object.fromEntries(
      Object.keys(SOURCE_PINS.sources).map((key) => {
        const value = buffers[key];
        return [key, value instanceof Uint8Array ? Buffer.from(value) : value];
      }),
    );
  }
  const sources = {};
  const receipts = [];
  for (const [key, pin] of Object.entries(SOURCE_PINS.sources)) {
    const bytes = buffers[key];
    requireThat(bytes instanceof Uint8Array, `SOURCE_BYTES_REQUIRED:${key}`);
    requireThat(
      bytes.byteLength === pin.bytes && sha256(bytes) === pin.sha256,
      `SOURCE_DRIFT:${key}`,
    );
    sources[key] =
      pin.format === 'text'
        ? Buffer.from(bytes).toString('utf8')
        : parseLossless(Buffer.from(bytes));
    receipts.push({
      key,
      ...pin,
      verification: 'EXACT_BYTES_ONLY_NOT_ADOPTION',
    });
  }
  requireThat(
    sources.repair.identity.countryId === 'COUNTRY_53',
    'REPAIR_COUNTRY_MISMATCH',
  );
  requireThat(
    sources.ownerReceipt.approval_evidence.attached_source_sha256 ===
      SOURCE_PINS.sources.owner.sha256,
    'OWNER_ATTACHMENT_BINDING',
  );
  const sourceRef = (source, pointer) => ({
    source,
    path: SOURCE_PINS.sources[source].path,
    sha256: SOURCE_PINS.sources[source].sha256,
    bytes: SOURCE_PINS.sources[source].bytes,
    pointer,
    exactLeaf: structuredClone(at(sources[source], pointer)),
    sourceClass:
      source === 'ownerReceipt'
        ? 'ADOPTED_OWNER_POLICY_RECEIPT_NOT_OPERATING_FACT'
        : ['physical', 'waterRecovery', 'repair'].includes(source)
          ? 'PINNED_DERIVED_REFERENCE_NOT_ACTUAL'
          : 'PINNED_REFERENCE_NOT_ACTUAL',
  });
  const quantity = (source, pointer, unit, basis) => ({
    amount: decimal(at(sources[source], pointer)),
    unit,
    basis,
    sourceEvidence: sourceRef(source, pointer),
  });
  const operationRecipe = () => ({
    status: 'UNADOPTED_R3_COEFFICIENTS_NOT_OPERATION_VOLUME',
    normalization: 'PER_RAW_M3_NOT_SERVICE_PERIOD',
    sourceEvidence: sourceRef('waterRecovery', '/coefficients'),
    coefficients: structuredClone(sources.waterRecovery.coefficients),
    combinedYield: structuredClone(
      sources.waterRecovery.combinedCandidateYield,
    ),
    conflicts: structuredClone(sources.waterRecovery.conflicts),
    actualOperationVolume: null,
    actualSkillHours: null,
  });
  const rows = ORIGINAL_IDS.map((stableId) => {
    const ledgerIndex = sources.ledger.records.findIndex(
      (r) => r.stableId === stableId,
    );
    requireThat(ledgerIndex >= 0, 'ORIGINAL_ID_NOT_IN_LEDGER');
    const original = sources.ledger.records[ledgerIndex];
    const field = original.missingField;
    const batchId = FIELD_BATCH[field];
    const parentBatch = sources.batches.find((b) => b.batchId === batchId);
    requireThat(
      parentBatch?.stableIds.filter((id) => id === stableId).length === 1,
      'PARENT_BATCH_MEMBERSHIP',
    );
    requireThat(
      original.countryId === original.ownerId &&
        original.originalUnit === UNITS[field],
      'ORIGINAL_IDENTITY_OR_UNIT',
    );
    requireThat(
      original.afterActualField.value === null,
      'ORIGINAL_VALUE_NOT_UNKNOWN',
    );
    const contextIndex = sources.physical.countryContexts.findIndex(
      (c) => c.countryId === original.countryId,
    );
    requireThat(contextIndex >= 0, 'COUNTRY_CONTEXT_MISSING');
    const context = sources.physical.countryContexts[contextIndex];
    const contextPointer = `/countryContexts/${contextIndex}`;
    const actions = context.knownActionComponentIndices
      .filter((i) => {
        const a = sources.physical.knownActionComponents[i];
        requireThat(a.countryId === original.countryId, 'CROSS_COUNTRY_ACTION');
        return (
          batchId === 'B10' ||
          (batchId === 'B11' && a.recipe === 'potableChainRepairPerRawM3Day') ||
          (batchId === 'B12' &&
            a.recipe === 'existingAveragePowerCapacityRepairPerMWhDay') ||
          (batchId === 'B13' && /warehouse|Carrier|Truck/u.test(a.recipe))
        );
      })
      .map((i) => ({
        ...structuredClone(sources.physical.knownActionComponents[i]),
        sourceEvidence: sourceRef('physical', `/knownActionComponents/${i}`),
        // These are alternate reference views, never two additive charges.
        wagesAlreadyIncludedInSubtotal: true,
        recurringServiceCost: null,
      }));
    const references = { knownRepairComponents: actions };
    if (batchId === 'B10') {
      references.allocatedPosts = quantity(
        'physical',
        `${contextPointer}/labour/allocatedPosts`,
        'POSTS_NOT_HOURS',
        'OPENING_EMPLOYMENT_TARGET_NOT_TIMESHEET',
      );
      if (original.countryId === 'COUNTRY_01')
        references.waterRecipe = operationRecipe();
    }
    if (batchId === 'B11') {
      references.rawAllocations = context.water.sources.map(({ pointer }) => {
        const raw = at(sources.water, pointer);
        requireThat(
          raw.countryId === context.legacyCountryId,
          'CROSS_COUNTRY_WATER',
        );
        return {
          sourceEvidence: sourceRef('water', pointer),
          amount: decimal(raw.domesticM3Day),
          unit: 'RAW_DOMESTIC_M3/DAY_PROPOSAL',
          rightsStatus: raw.rightsStatus,
          quotaBasisAdopted: null,
          netPotableDelivery: null,
        };
      });
      if (original.countryId === 'COUNTRY_01')
        references.waterRecipe = operationRecipe();
    }
    if (batchId === 'B12') {
      references.installedPower = Object.fromEntries(
        [
          ['solarCapacityMW', 'MW'],
          ['windCapacityMW', 'MW'],
          ['storageCapacityMWh', 'MWH_CAPACITY_NOT_STORED_ENERGY'],
        ].map(([key, unit]) => [
          key,
          quantity(
            'physical',
            `${contextPointer}/power/${key}`,
            unit,
            'OPENING_CANDIDATE_CAPACITY_NOT_DELIVERY',
          ),
        ]),
      );
      if (original.countryId === 'COUNTRY_53')
        references.repairInput = {
          identity: structuredClone(sources.repair.identity),
          electricity: quantity(
            'repair',
            '/referenceVector/electricityInputMWh',
            'MWH_REPAIR_INPUT_NOT_DELIVERY',
            'REFERENCE_WORK_SIM_DAY_1_FINISH_SIM_DAY_3_NOT_SERVICE_PERIOD',
          ),
          vectorEvidence: sourceRef('repair', '/referenceVector'),
          actualDeliveredMWh: null,
        };
    }
    if (batchId === 'B13') {
      references.inboundPlans = context.transport.inboundPlanSources.map(
        ({ pointer }) => {
          const plan = at(sources.trade, pointer);
          requireThat(
            plan.buyerCountryId === context.legacyCountryId,
            'CROSS_COUNTRY_TRANSPORT',
          );
          return {
            sourceEvidence: sourceRef('trade', pointer),
            flowId: plan.id,
            mode: plan.mode,
            status: plan.status,
            freightTonnesPerDay: decimal(plan.freightTonnesDay),
            distanceKmEstimate: decimal(plan.distanceKmEstimate),
            transportCostGcuDayProposal: decimal(
              plan.transportCostGcuDayProposal,
            ),
            measureBasis:
              'UNSIGNED_PLAN_TONNES_PER_DAY_ESTIMATED_KM_GCU_PER_DAY_NOT_ACTUAL_NATIVE_COST',
            acceptedTonneKm: null,
            nativeContractedRate: null,
          };
        },
      );
    }
    return {
      stableId,
      scope: original.scope,
      ownerId: original.ownerId,
      countryId: original.countryId,
      missingField: field,
      originalAcceptanceRule: original.acceptanceRule,
      parentBatch: {
        batchId,
        originalFieldCount: parentBatch.originalFieldCount,
        subsetCount: 4,
      },
      originalLedger: sourceRef(
        'ledger',
        `/records/${ledgerIndex}/afterActualField`,
      ),
      originalGapSource: structuredClone(original.originalSource),
      targetKind: field.includes('Cost')
        ? 'COMPLETE_COST_NOT_REPAIR_SUBTOTAL'
        : field === 'labourPayrollNative'
          ? 'ACTUAL_NATIVE_PAYROLL_NOT_REFERENCE_WAGES'
          : 'PROTECTED_SERVICE_MINIMUM_NOT_CAPACITY_OR_REFERENCE_WORK',
      candidateMeasure: {
        status: 'BLOCKED_MISSING_SOURCE_OR_ADOPTION',
        value: null,
        unit: original.originalUnit,
        currency: null,
        periodOrValueDate: null,
        applicableWorldGenesisHead: null,
      },
      nativeCurrencyCandidate: context.nativeCurrencyCandidate,
      nativeCurrencyEvidence: sourceRef(
        'physical',
        `${contextPointer}/nativeCurrencyCandidate`,
      ),
      currencyMeaning:
        original.originalUnit === 'NATIVE_MONEY'
          ? 'CANDIDATE_CODE_NOT_ADOPTED_PAYROLL_OR_SERVICE_COST_CURRENCY'
          : 'NOT_APPLICABLE_TO_PHYSICAL_MEASURE',
      references,
      adoptionEvidence: null,
      dependencies: original.dependencies.map((ref) => ({
        originalIdOrFixedExternalRef: ref,
        status: 'BLOCKED_NO_SAME_SCOPE_ACTUAL_OR_ADOPTION_RECEIPT',
        receiptPin: null,
      })),
      blockers: [
        'D:B02 protectedServiceFloor adoption and service/facility/beneficiary scope unbound',
        'Actual period/calendar and applicable World/genesis unbound',
        PHYSICAL_GAPS[batchId],
        ...(original.originalUnit === 'NATIVE_MONEY'
          ? [COST_GAPS[batchId]]
          : []),
        'Recipe/reference/source hashes do not establish adoption or actual operation',
      ],
      reportedStageFlags: {
        sourceComplete: false,
        engineeringWired: false,
        validationPassed: false,
        formallyAdopted: false,
      },
      isolatedReferenceConsumerWired: true,
    };
  });
  if (extended) {
    const rawRow = Buffer.from(buffers.ledger).subarray(
      extensionPin.rowStartByte,
      extensionPin.rowEndByteExclusive,
    );
    requireThat(
      sha256(rawRow) === extensionPin.rowSha256,
      'C13_ORIGINAL_ROW_BYTES_MISMATCH',
    );
    const original = sources.ledger.records[extensionPin.rowIndex];
    requireThat(
      JSON.stringify(parseLossless(rawRow)) === JSON.stringify(original) &&
        sources.ledger.records.filter(
          (row) => row.stableId === extensionPin.stableId,
        ).length === 1 &&
        original.stableId === extensionPin.stableId &&
        original.countryId === 'COUNTRY_13' &&
        original.ownerId === 'COUNTRY_13' &&
        original.missingField === 'transportMinimum' &&
        original.originalUnit === UNITS.transportMinimum &&
        original.afterActualField.value === null,
      'C13_ORIGINAL_ROW_SCOPE_MISMATCH',
    );
    const batch = sources.batches[12];
    requireThat(
      batch.batchId === 'B13' &&
        batch.stableIds[24] === original.stableId &&
        batch.stableIds.filter((id) => id === original.stableId).length === 1,
      'C13_BATCH_MEMBERSHIP_REQUIRED',
    );
    // This is the missing real consumer edge. Never substitute a saved result.
    const freight = extractPinnedAcceptedFreight({
      transportBytes: extension.transportBytes,
      catalogueBytes: extension.catalogueBytes,
    });
    requireThat(
      freight.status === 'REFERENCE_ONLY' &&
        freight.sourceBytesVerified === true &&
        freight.identity.buyerCountryNumber === '13' &&
        freight.identity.sellerCountryNumber === '24',
      'C13_PINNED_REFERENCE_FREIGHT_REQUIRED',
    );
    rows.push({
      stableId: original.stableId,
      scope: original.scope,
      ownerId: original.ownerId,
      countryId: original.countryId,
      missingField: original.missingField,
      originalAcceptanceRule: original.acceptanceRule,
      originalClosureStatus: original.closureStatus,
      parentBatch: {
        batchId: 'B13',
        originalFieldCount: batch.originalFieldCount,
        subsetCount: 1,
      },
      originalLedger: sourceRef('ledger', '/records/444/afterActualField'),
      originalRowBinding: {
        pointer: '/records/444',
        sha256: extensionPin.rowSha256,
      },
      originalGapSource: structuredClone(original.originalSource),
      targetKind: 'PROTECTED_SERVICE_MINIMUM_NOT_CAPACITY_OR_REFERENCE_WORK',
      candidateMeasure: {
        status: 'BLOCKED_MISSING_SOURCE_OR_ADOPTION',
        value: null,
        unit: original.originalUnit,
        currency: null,
        periodOrValueDate: null,
        applicableWorldGenesisHead: null,
      },
      references: {
        acceptedFreight: freight,
        acceptedFreightOperand: {
          amount: freight.derivedReferenceFreightTonnes,
          unit: 'TONNE',
          basis: 'SINGLE_RETAINED_REFERENCE_EVENT_NOT_PERIOD_TOTAL',
          sourceEvidence: freight.provenance,
        },
        referenceTime: {
          sourceReferenceSimDay: freight.identity.referenceSimDay,
          meaning: 'LEGACY_REFERENCE_COORDINATE_NOT_WORLD_OR_ADOPTED_PERIOD',
        },
        distanceKm: null,
        referenceTonneKm: null,
        actualTonneKm: null,
        periodMinimum: null,
        completeNativeCost: null,
      },
      nativeCurrencyCandidate: null,
      nativeCurrencyEvidence: null,
      currencyMeaning: 'NOT_APPLICABLE_TO_PHYSICAL_MEASURE',
      adoptionEvidence: null,
      dependencies: original.dependencies.map((ref) => ({
        originalIdOrFixedExternalRef: ref,
        status: 'BLOCKED_NO_SAME_SCOPE_ACTUAL_OR_ADOPTION_RECEIPT',
        receiptPin: null,
      })),
      blockers: [
        'D:B02 protectedServiceFloor adoption and service scope unbound',
        'Eligible same-trip title/route distance/mode and actual period/World/entity binding absent',
        'Reference single-cargo tonnes are not a protected minimum or World receipt',
      ],
      reportedStageFlags: {
        sourceComplete: false,
        engineeringWired: false,
        validationPassed: false,
        formallyAdopted: false,
      },
      isolatedReferenceConsumerWired: true,
      sourceAdmitted: false,
      runtimeConnected: false,
      productionAuthority: false,
      originalFieldsClosed: 0,
    });
    for (const key of ['transport', 'catalogue'])
      receipts.push({
        key,
        ...extensionPin[key],
        verification: 'EXACT_BYTES_ONLY_NOT_ADOPTION',
      });
  }
  const packet = freeze({
    schema: extended
      ? 'C_ORIGINAL_17_REFERENCE_INPUT_BRIDGE_V1'
      : 'C_ORIGINAL_16_REFERENCE_INPUT_BRIDGE_V1',
    ...(extended
      ? { rowParentBatchSubsetCountBasis: 'LEGACY16_OR_C13_EXTENSION1_COHORT' }
      : {}),
    status: 'IMPLEMENTED_UNVERIFIED',
    intendedUse: 'ORIGINAL_ID_KEYED_ISOLATED_REFERENCE_READ_ONLY',
    subset: {
      originalUniverseCount: 2544,
      cOwnedCount: 560,
      count: extended ? 17 : 16,
      exactOriginalIds: extended
        ? [...ORIGINAL_IDS, extensionPin.stableId]
        : [...ORIGINAL_IDS],
      parentBatches: ['B10', 'B11', 'B12', 'B13'].map((batchId) => ({
        batchId,
        subsetCount: extended && batchId === 'B13' ? 5 : 4,
      })),
    },
    sourceReceipts: receipts,
    adoptionBoundary: {
      ownerSource: {
        path: SOURCE_PINS.sources.owner.path,
        sha256: SOURCE_PINS.sources.owner.sha256,
        fromLine: 221,
        throughLine: 261,
      },
      adoptedPolicyReceipt: sourceRef('ownerReceipt', '/decisions/3'),
      adoptedPolicyContext: [
        'Conditional opening water quota basis and scarcity priority, not grant validity or actual potable delivery',
        'Installed assets and eligible initial SOC, not MWh generation/delivery',
        'Opening employment targets and mapping rules, not worked hours or paid payroll',
      ],
      unadoptedInputs: [
        'R3 operating recipe coefficients and conflicting versions',
        'Reference FX quotes, wages, repair/book costs and unsigned trade plans',
      ],
      operationalAdoptionReceipt: null,
    },
    rows,
    originalFieldsClosed: 0,
    productionAuthority: false,
    sourceAdmitted: false,
    runtimeConnected: false,
  });
  return Object.freeze({
    snapshot: () => packet,
    read(request) {
      if (extended)
        request = Object.fromEntries(
          Object.keys(request ?? {}).map((key) => [
            key,
            structuredClone(request[key]),
          ]),
        );
      if (request?.mode === 'ADOPTED_RECIPE_INTERMEDIATES_ONLY')
        return readAdopted(request);
      requireThat(
        request?.mode === 'REFERENCE_INPUTS_ONLY',
        'ACTUAL_MINIMUM_OR_COST_READ_PROHIBITED',
      );
      const row = rows.find((r) => r.stableId === request.stableId);
      requireThat(row !== undefined, 'OUTSIDE_EXACT_16_SUBSET');
      if (extended && row.stableId === extensionPin.stableId)
        requireThat(
          [
            'mode',
            'stableId',
            'countryId',
            'originalUnit',
            'periodOrValueDate',
            'currency',
          ].every(
            (key) => Object.hasOwn(request, key) && request[key] !== undefined,
          ),
          'C13_COMPLETE_REQUEST_REQUIRED',
        );
      requireThat(request.countryId === row.countryId, 'COUNTRY_MISMATCH');
      requireThat(
        request.originalUnit === row.candidateMeasure.unit,
        'ORIGINAL_UNIT_MISMATCH',
      );
      requireThat(request.periodOrValueDate === null, 'NO_ACTUAL_PERIOD_BOUND');
      requireThat(request.currency === null, 'NO_ACTUAL_CURRENCY_BOUND');
      requireThat(
        Object.keys(request).every((k) =>
          [
            'mode',
            'stableId',
            'countryId',
            'originalUnit',
            'periodOrValueDate',
            'currency',
          ].includes(k),
        ),
        'UNSUPPORTED_AUTHORITY_OR_ARITHMETIC_OPTION',
      );
      return freeze({
        status: 'REFERENCE_INPUTS_READ_NOT_ORIGINAL_FIELD_ACCEPTANCE',
        stableId: row.stableId,
        candidateMeasure: row.candidateMeasure,
        references: row.references,
        adoptionEvidence: null,
        actualResultStatus: 'BLOCKED_MISSING_SOURCE_OR_ADOPTION',
      });
    },
  });
}
