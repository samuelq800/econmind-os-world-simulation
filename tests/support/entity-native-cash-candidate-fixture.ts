/** Mechanism vectors only. No original account identities or funding issued. */
import { financialInputSha256 } from '../../apps/world-worker/src/preparation/formal-financial-opening-contract.js';
import type { EntityCashSourceSelection } from '../../apps/world-worker/src/preparation/entity-native-cash-candidate-builder.js';
import type {
  OriginalEntityCashBatch,
  OriginalEntityCashField,
} from '../../apps/world-worker/src/preparation/entity-native-cash-candidate-adapter.js';

export const entityRoles = [
  ['GOVERNMENT', 'GOV'],
  ['OPERATOR', 'OP'],
  ['HOUSEHOLDS', 'HOUSEHOLDS'],
  ['BANK', 'BANK'],
  ['CENTRAL_BANK', 'CENTRAL-BANK'],
] as const;
export const cashScope = {
  worldId: 'WORLD_SYNTHETIC_ENTITY_CASH_ONLY',
  worldVersion: '0',
  sourceVersion: 'SYNTHETIC_ENTITY_CASH_V1',
  asOf: '2026-10-18T00:00:00.000Z',
};
export function originalEntityFixture() {
  const mappings: Record<string, unknown>[] = [];
  const originalFields: OriginalEntityCashField[] = [];
  for (let i = 1; i <= 70; i++) {
    const suffix = String(i).padStart(2, '0');
    for (const [role, legacy] of entityRoles) {
      const entityId = `ENTITY_${role}_${suffix}`,
        countryId = `COUNTRY_${suffix}`;
      mappings.push({
        entityId,
        countryId,
        legacyEntityId: `${legacy}-${suffix}`,
        legacyCountryId: `visual-territory-${suffix}`,
        sourceClass: 'REFERENCE_MAPPING_NOT_LEGAL_ACCOUNT_OR_CURRENT_AUTHORITY',
        actualAccount: null,
        actualHolderAdmission: null,
        actualCurrentAuthorization: null,
      });
      for (const missingField of ['account', 'availableNativeCash'] as const)
        originalFields.push({
          stableId: `U2544::ENTITY::${entityId}::${missingField}`,
          ownerId: entityId,
          countryId,
          missingField,
        });
    }
  }
  const batches: OriginalEntityCashBatch[] = (['B06', 'B07'] as const).map(
    (batchId) => ({
      batchId,
      stableIds: originalFields
        .filter(
          (r) =>
            r.missingField ===
            (batchId === 'B06' ? 'account' : 'availableNativeCash'),
        )
        .map((r) => r.stableId),
    }),
  );
  return {
    mappingsBytes: JSON.stringify({
      status: 'REFERENCE_CROSSWALK_NOT_ACCOUNT_BINDING',
      rows: mappings,
    }),
    originalFields,
    batches,
  };
}
export function declaredEntityCashVector() {
  const rows = entityRoles.map(([role]) => {
    const entityId = `ENTITY_${role}_01`,
      accountId = `ACCOUNT_SYNTHETIC_${role}_ONLY`;
    const atom = {
      atomId: `ATOM_${role}`,
      accountId,
      amount: '10.25',
      currency: 'XAA',
      asOf: cashScope.asOf,
    };
    return {
      account: {
        account: {
          worldId: cashScope.worldId,
          countryId: 'COUNTRY_01',
          accountId,
          ownerId: entityId,
          accountClass: 'CASH',
          currency: 'XAA',
          claimId: null,
          counterpartyEntityId: null,
        },
        issuerId: 'ENTITY_CENTRAL_BANK_01',
        purpose: 'NATIVE_CASH_SETTLEMENT',
        sourceHoldingKind: 'CASH',
      },
      cash: {
        accountId,
        currency: 'XAA',
        asOf: cashScope.asOf,
        periodStart: '2026-10-17T00:00:00.000Z',
        openingBalance: '100',
        closingBalance: '100.5',
        flowSetComplete: true,
        flows: [
          {
            flowId: `FLOW_IN_${role}`,
            accountId,
            currency: 'XAA',
            amount: '1.25',
            direction: 'INFLOW',
            status: 'SETTLED',
            settlementTime: cashScope.asOf,
          },
          {
            flowId: `FLOW_OUT_${role}`,
            accountId,
            currency: 'XAA',
            amount: '0.75',
            direction: 'OUTFLOW',
            status: 'SETTLED',
            settlementTime: cashScope.asOf,
          },
          {
            flowId: `FLOW_PENDING_${role}`,
            accountId,
            currency: 'XAA',
            amount: '9999',
            direction: 'INFLOW',
            status: 'UNSETTLED',
            settlementTime: cashScope.asOf,
          },
        ],
        restrictionsComplete: true,
        restrictionBasis: 'DECLARED_DISJOINT_CASH_ATOMS',
        encumbranceAtoms: [atom],
        restrictions: ['FROZEN', 'PLEDGED', 'EARMARK'].map((kind) => ({
          restrictionId: `${kind}_${role}`,
          kind,
          accountId,
          atomIds: [atom.atomId],
        })),
      },
    };
  });
  const source = {
    schemaVersion: 'entity-native-cash-source-v1',
    ...cashScope,
    rows,
  };
  const document = () => {
    const bytes = JSON.stringify(source);
    return {
      documentId: 'SYNTHETIC_ONLY_SOURCE',
      classification: 'SYNTHETIC_CANDIDATE' as const,
      sourceVersion: cashScope.sourceVersion,
      asOf: cashScope.asOf,
      bytes,
      sha256: financialInputSha256(bytes),
    };
  };
  const selections: EntityCashSourceSelection[] = entityRoles.map(
    ([role], i) => ({
      entityId: `ENTITY_${role}_01`,
      countryId: 'COUNTRY_01',
      nativeCurrency: 'XAA',
      account: {
        documentId: 'SYNTHETIC_ONLY_SOURCE',
        pointer: `/rows/${i}/account`,
      },
      cash: { documentId: 'SYNTHETIC_ONLY_SOURCE', pointer: `/rows/${i}/cash` },
    }),
  );
  return {
    source,
    selections,
    document,
    input: () => ({ expected: cashScope, documents: [document()], selections }),
  };
}
