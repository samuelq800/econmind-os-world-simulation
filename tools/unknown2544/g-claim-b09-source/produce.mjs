/** Four original B09 fields, read-only source association; no title issuer. */
import { createHash } from 'node:crypto';
import { compileClaimCandidate } from '../../g-claim-source-candidate.mjs';

export const COMPARISON_SHA256 =
  '348cfde8e97b8cbf0508d7273082c2f7758322e618d0f17ebf3d7c4b0232830e';
export const SUPPORT_PINS = Object.freeze({
  d48: 'eee35271522f157ea0d64b1a991af58b858e7896a56b5538ffdd5f7018016bdd',
  positions: '22e0a293f9edbbdd28684c6c6c0c68c4621855b06a44fb17bd1bbda19b9fdfe3',
});

function demand(value, code) {
  if (!value) throw new Error(code);
}

/** Called only after the existing six-source compiler validates raw byte pins.
 * Exported separately for relation counterexamples, never for source admission. */
export function validateB09Relations(candidate) {
  demand(candidate.scenarios.length === 4, 'EXACT_FOUR_CLAIMS');
  const ids = new Set();
  for (const scenario of candidate.scenarios) {
    demand(!ids.has(scenario.originalClaimSelector), 'DUPLICATE_CLAIM');
    ids.add(scenario.originalClaimSelector);
    const instrument = scenario.proposedInstrument;
    const legs = scenario.pairedRegistrations;
    demand(legs.length === 2, 'EXACT_TWO_LEGS');
    const asset = legs.filter((l) => l.proposedRegistration.role === 'ASSET');
    const liability = legs.filter(
      (l) => l.proposedRegistration.role === 'LIABILITY',
    );
    demand(asset.length === 1 && liability.length === 1, 'OPPOSITE_LEGS');
    demand(
      asset[0].proposedRegistration.holderId === instrument.holderId &&
        liability[0].proposedRegistration.holderId === instrument.issuerId &&
        instrument.holderId !== instrument.issuerId,
      'LEGAL_ROLE_DIRECTION',
    );
    for (const leg of legs) {
      const position = leg.proposedRegistration;
      demand(
        position.canonicalClaimId === scenario.originalClaimSelector &&
          position.termsPointer === instrument.source.pointer,
        'SAME_INSTRUMENT_TERMS_POINTER',
      );
      demand(
        position.nativeCurrency === instrument.currency &&
          position.nativeAmount === instrument.principal,
        'SAME_NATIVE_AMOUNT_AND_CURRENCY',
      );
    }
  }
}

/** D48 leaves are checked against their original pinned positions, not upgraded
 * into title, historical denomination or cash. No large journal is reopened. */
export function validateD48Relations(candidate, d48, positions) {
  demand(
    d48.records.length === 4 && d48.sourceFieldDelta.length === 48,
    'D48_SCOPE',
  );
  demand(
    new Set(d48.records.map((r) => r.stableId)).size === 4,
    'D48_DUPLICATE_ID',
  );
  const references = new Set();
  for (const leaf of d48.sourceFieldDelta) {
    demand(leaf.source.sha256 === SUPPORT_PINS.positions, 'D48_SOURCE_PIN');
    demand(!references.has(leaf.source.pointer), 'D48_DUPLICATE_POINTER');
    references.add(leaf.source.pointer);
    const parts = leaf.source.pointer.split('/').slice(1);
    demand(
      parts[0] === 'positions' && /^\d+$/u.test(parts[1]),
      'D48_POSITION_POINTER',
    );
    const position = positions.positions[Number(parts[1])];
    demand(
      position &&
        leaf.holdingId === position.holdingId &&
        leaf.stableId ===
          `U2544::CLAIM::${position.sharedClaimId}::actualLegalHolderIssuer`,
      'D48_LEAF_CLAIM_LINK',
    );
    const source = parts.reduce((v, k) => v?.[k], positions);
    demand(
      source !== undefined && source === leaf.after.value,
      'D48_LEAF_VALUE',
    );
  }
  for (const scenario of candidate.scenarios) {
    const id = scenario.originalClaimSelector;
    const row = d48.records.find(
      (r) => r.stableId === `U2544::CLAIM::${id}::actualLegalHolderIssuer`,
    );
    demand(
      row && row.after.value === null && row.eligibleForClosure === false,
      'D48_NOT_TITLE',
    );
    demand(row.reusedMirrorRows.length === 2, 'D48_TWO_LEGS');
    const roles = new Set();
    for (const leg of row.reusedMirrorRows) {
      demand(!roles.has(leg.role), 'D48_OPPOSITE_ROLES');
      roles.add(leg.role);
      const index = Number(leg.originalSource.pointer.split('/')[2]);
      const original = positions.positions[index];
      demand(
        original &&
          leg.originalSource.sha256 === SUPPORT_PINS.positions &&
          original.sharedClaimId === id &&
          original.holdingId === leg.holdingId &&
          original.role === leg.role,
        'D48_ORIGINAL_INSTRUMENT',
      );
      const instrument = scenario.proposedInstrument;
      const owner =
        leg.role === 'ASSET' ? instrument.holderId : instrument.issuerId;
      const counterparty =
        leg.role === 'ASSET' ? instrument.issuerId : instrument.holderId;
      demand(
        ['ASSET', 'LIABILITY'].includes(leg.role) &&
          original.holderId === owner &&
          original.counterpartyId === counterparty &&
          leg.positionOwnerId === owner &&
          leg.counterpartyId === counterparty,
        'D48_LEGAL_ROLE_DIRECTION',
      );
      demand(
        original.nativeAmount === instrument.principal &&
          original.nativeCurrency === instrument.currency &&
          leg.nativeAmount === instrument.principal &&
          leg.nativeCurrency === instrument.currency,
        'D48_NATIVE_AMOUNT_CURRENCY',
      );
      demand(
        original.bookLC === leg.book.amount &&
          original.bookLocalCurrency === leg.book.currency &&
          original.bookLcPerNativeUnit === leg.book.rate &&
          original.actualWorldPosting === false &&
          leg.effectiveWorldDate === null,
        'D48_BOOK_NOT_EFFECTIVE_CASH',
      );
    }
  }
}

export function produceB09Packet(rawSources, comparisonBytes, supportBytes) {
  const candidate = compileClaimCandidate(rawSources);
  demand(
    Buffer.isBuffer(comparisonBytes) &&
      createHash('sha256').update(comparisonBytes).digest('hex') ===
        COMPARISON_SHA256,
    'COMPARISON_PIN_MISMATCH',
  );
  const comparison = JSON.parse(comparisonBytes.toString('utf8'));
  demand(
    comparison.adopted === false &&
      comparison.sourceAdoptionReceipt.foundInSelectedSmallMaterials ===
        false &&
      comparison.crossCbLifecycle.status === 'PROPOSED_NOT_ADOPTED',
    'COMPARISON_NOT_AN_ADOPTION',
  );
  validateB09Relations(candidate);
  demand(Object.keys(supportBytes).length === 2, 'EXACT_SUPPORT_SET');
  const support = {};
  for (const [key, pin] of Object.entries(SUPPORT_PINS)) {
    const bytes = supportBytes[key];
    demand(
      Buffer.isBuffer(bytes) &&
        createHash('sha256').update(bytes).digest('hex') === pin,
      `SUPPORT_PIN_MISMATCH:${key}`,
    );
    support[key] = JSON.parse(bytes.toString('utf8'));
  }
  validateD48Relations(candidate, support.d48, support.positions);
  const rows = candidate.fieldMappings
    .filter((r) => r.adoptedPlanBatch === 'B09')
    .map((r, rowIndex) => {
      const scenario = candidate.scenarios.find(
        (s) => s.originalClaimSelector === r.ownerId,
      );
      const ei = comparison.crossCbLifecycle.claims.findIndex(
        (c) => c.canonicalClaimId === r.ownerId,
      );
      const e = comparison.crossCbLifecycle.claims[ei];
      demand(
        e &&
          e.issuerCandidate === scenario.proposedInstrument.issuerId &&
          e.holderCandidate === scenario.proposedInstrument.holderId &&
          e.principal === scenario.proposedInstrument.principal &&
          e.proposedDenomination === scenario.proposedInstrument.currency &&
          e.actualTitle === 'UNKNOWN',
        'ECONOMIC_COMPARISON_JOIN',
      );
      // The compiler's /scenarios tree is not serialized in this packet.
      const mapping = { ...r };
      delete mapping.scenarioTemplatePointer;
      return {
        ...mapping,
        candidateAssociationPointerBase: 'THIS_PACKET',
        candidateAssociationPointer: `/rows/${rowIndex}/candidateAssociation`,
        candidateAssociation: {
          nature: 'CONSTRUCTED_PROPOSED_ROLES_NOT_ACTUAL_TITLE',
          instrument: scenario.proposedInstrument,
          legs: scenario.pairedRegistrations,
          principalCount: 1,
          registrationCount: 2,
          valueDate: null,
          actualOpeningIdentity: null,
          actualHistoricalDenomination: null,
          comparison: {
            sha256: COMPARISON_SHA256,
            version: comparison.version,
            pointer: `/crossCbLifecycle/claims/${ei}`,
          },
          d48: {
            sha256: SUPPORT_PINS.d48,
            pointer: `/records/${support.d48.records.findIndex((d) => d.stableId === r.stableId)}`,
            sourceLeaves: support.d48.sourceFieldDelta.filter(
              (d) => d.stableId === r.stableId,
            ),
            originalPositions: support.d48.records.find(
              (d) => d.stableId === r.stableId,
            ).reusedMirrorRows,
            originalPositionsSha256: SUPPORT_PINS.positions,
          },
        },
        actualAdoptionEvidence: null,
        periodOrValueDate: null,
        applicableWorldGenesisHead: null,
        measureExplanation:
          'REGISTER is a legal-party mapping, not a monetary amount. Principal/currency and 2026-10-13 source dates identify proposed records only; no effective legal date or World opening has been established.',
        requiredEvidence: [
          'Source-owned same-instrument legal issuer and holder evidence',
          'Exact source version and applicable inactive opening identity',
          'Explicit adoption of constructed roles if that source path is chosen',
          'Independent same-target review and Root acceptance',
        ],
      };
    });
  demand(rows.length === 4, 'EXACT_FOUR_B09_IDS');
  return {
    schema: 'G_B09_FOUR_SOURCE_ASSOCIATIONS_V1',
    status: 'IMPLEMENTED_UNVERIFIED_SOURCE_PACKET_NOT_ADOPTED',
    parentBatch: 'B09',
    parentBatchOriginalIdCount: 4,
    exactSubsetIds: rows.map((r) => r.stableId),
    subsetCount: 4,
    consumer:
      'compileClaimCandidate -> validateB09Relations -> produceB09Packet',
    sourcePins: candidate.sources,
    supportPins: SUPPORT_PINS,
    rows,
    statistics: {
      originalIds: 4,
      distinctPrincipals: 4,
      sourceRegistrations: 8,
      actualFieldsRecovered: 0,
      originalClosuresProposed: 0,
    },
    authority: candidate.authority,
  };
}
