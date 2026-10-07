/** Disposable mechanism source/admission only. Never official adoption/grants. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  CURRENT_REPLAY_BINDING,
  Money,
  canonicalSerialize,
  createOpeningSource,
  createOpeningSeed,
  createFinancialAccount,
  countryId,
  worldId,
  legalEntityId,
  financialAccountId,
  financialOpeningBatchId,
  financialOpeningLegId,
  openingSourceId,
  openingSeedId,
  OPENING_SOURCE_SCHEMA_VERSION,
  OPENING_SEED_SCHEMA_VERSION,
  type FinancialOpeningBatch,
} from '@econmind/core';
import { WorldOpeningSeedStore } from '../../apps/world-worker/src/persistence/opening-seed-store.js';
import {
  FIXED_OPENING_PROPOSAL_E,
  OPENING_ECONOMIC_DECISION_SCHEMA,
  OPENING_FINANCE_FIELDS,
  parseOpeningEconomicDecision,
  type OpeningEconomicDecisionV1,
  type OpeningFinanceValues,
} from '../../apps/world-worker/src/preparation/opening-economic-decision.js';
import {
  FROZEN_OPENING_MAPPING_SHA256,
  openingCountrySeedAssemblyFingerprint,
  type OpeningCountrySeedAssembly,
  type OpeningCanonicalSeedAssembly,
} from '../../apps/world-worker/src/preparation/opening-canonical-seed-bridge.js';
import type { V09AtomicTestDatabase } from './v09-atomic-contract.js';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const CHECKSUMS =
  '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315';
export function visibilitySeed(
  world: string,
  mutate?: (payload: Record<string, unknown>) => void,
) {
  const sourceId = openingSourceId('SOURCE_VISIBILITY_TEST');
  const financialBatches: FinancialOpeningBatch[] = [];
  const countries: OpeningCountrySeedAssembly[] = [];
  const allocations: OpeningEconomicDecisionV1['countries'][number][] = [];
  for (const [cid, treasury, cb, cashId] of [
    [
      'COUNTRY_SELLER',
      'ENTITY_ACTIVITY_SELLER',
      'ENTITY_OTHER_SELLER_CB',
      'ACCOUNT_ACTIVITY_SELLER_CASH',
    ],
    [
      'COUNTRY_BUYER',
      'ENTITY_OTHER_BUYER_GOV',
      'ENTITY_ACTIVITY_BUYER',
      'ACCOUNT_ACTIVITY_BUYER_CASH',
    ],
  ]) {
    const country = countryId(cid!);
    const roster = {
      government: treasury!,
      centralBank: cb!,
      bank: 'ENTITY_BANK_' + cid,
      operator: 'ENTITY_OPERATOR_' + cid,
      households: 'ENTITY_HOUSEHOLDS_' + cid,
    };
    const legs: FinancialOpeningBatch['legs'][number][] = [];
    for (const [owner, tag] of [
      [treasury!, 'GOV'],
      [cb!, 'CB'],
    ]) {
      const cash = financialOpeningLegId(
          `LEG_${cid}${tag === 'GOV' ? '-' : '_'}${tag}_CASH`,
        ),
        equity = financialOpeningLegId(`LEG_${cid}_${tag}_EQUITY`);
      for (const [legId, counterpartLegId, accountClass, direction] of [
        [cash, equity, 'CASH', 'DEBIT'],
        [equity, cash, 'EQUITY', 'CREDIT'],
      ] as const) {
        const account = createFinancialAccount({
          worldId: worldId(world),
          countryId: country,
          ownerId: legalEntityId(owner!),
          accountId: financialAccountId(
            accountClass === 'CASH' &&
              ((cid === 'COUNTRY_SELLER' && tag === 'GOV') ||
                (cid === 'COUNTRY_BUYER' && tag === 'CB'))
              ? cashId!
              : `ACCOUNT_${cid}_${tag}_${accountClass}`,
          ),
          accountClass,
          currency: 'GCU',
          claimId: null,
          counterpartyEntityId: null,
        });
        legs.push({
          legId: financialOpeningLegId(legId),
          counterpartLegId: financialOpeningLegId(counterpartLegId),
          account,
          direction,
          amount: Money.from('10', 'GCU'),
        });
      }
    }
    legs.sort((a, b) => a.legId.localeCompare(b.legId));
    const batch = {
      batchId: financialOpeningBatchId(`BATCH_${cid}_VISIBILITY`),
      sourceId,
      settlementCurrency: 'GCU',
      legs,
    };
    financialBatches.push(batch);
    countries.push({
      countryId: cid!,
      roster,
      adoptionRef: 'ASSEMBLY_' + cid,
      inventoryEntries: [],
      financialBatch: JSON.parse(
        canonicalSerialize({
          batchId: batch.batchId,
          settlementCurrency: batch.settlementCurrency,
          legs: [...legs].reverse(),
        }),
      ),
    });
    allocations.push({
      countryId: cid!,
      decisionStatus: 'OWNER_ADOPTION_REQUESTED',
      legalEntities: {
        treasury: treasury!,
        centralBank: cb!,
        bank: roster.bank,
      },
      sourceFinance: Object.fromEntries(
        OPENING_FINANCE_FIELDS.map((f) => [f, '0']),
      ) as OpeningFinanceValues,
      fundsModel: 'TREASURY_DEPOSIT_AT_CB',
      treasuryOpeningBalance: '10',
      centralBankOpeningBalance: '10',
      reserveClaim: null,
      treasuryClaim: null,
      centralBankPositions: [],
      fieldProvenance: Object.fromEntries(
        [
          ...OPENING_FINANCE_FIELDS,
          'treasuryOpeningBalance',
          'centralBankOpeningBalance',
        ].map((f) => [f, 'SOURCE_' + cid + '_' + f.toUpperCase()]),
      ),
    });
  }
  const assembly: OpeningCanonicalSeedAssembly = {
    schemaVersion: 'opening-canonical-seed-assembly-v1',
    seedId: 'SEED_VISIBILITY_TEST',
    sourceId,
    replayBinding: CURRENT_REPLAY_BINDING,
    orchestratorVersion: 'VISIBILITY_MECHANISM_TEST',
    countries,
  };
  const ownerRef = `git:${'1'.repeat(40)}:status/decisions.json#/TEST_ONLY`;
  const decision: OpeningEconomicDecisionV1 = {
    schemaVersion: OPENING_ECONOMIC_DECISION_SCHEMA,
    decisionVersion: 'VISIBILITY_TEST_ONLY',
    proposal: FIXED_OPENING_PROPOSAL_E,
    sourceMutationAllowed: false,
    effectiveScope: {
      worldId: world,
      modelVersion: CURRENT_REPLAY_BINDING.modelVersion,
      orchestratorVersion: assembly.orchestratorVersion,
      sourcePackageId: 'BALANCED_2026_09_28_V1',
      sourceChecksumsSha256: CHECKSUMS,
    },
    rules: {
      currency: 'EXACT_1_TO_1_GCU',
      legalOwnership: 'E_FIXED_ROSTER_TITLE_RISK',
      bankReconciliation: 'E_COMPONENT_ANCHOR',
      reserve: 'BANK_ASSET_CB_LIABILITY_SAME_CLAIM',
      transformationVersion: 'VISIBILITY_TEST_ONLY',
    },
    ownerAdoption: {
      reference: ownerRef,
      recordFingerprint: `sha256:${'2'.repeat(64)}`,
    },
    countries: allocations,
    provenance: countries.map((c) => ({
      ref: c.adoptionRef,
      kind: 'DOMAIN_ADOPTED',
      value: openingCountrySeedAssemblyFingerprint(assembly, c),
      inputRefs: [],
      rule: null,
      ownerRecordRef: ownerRef,
      source: null,
    })),
  };
  const payload: Record<string, unknown> = {
    mappingSha256: FROZEN_OPENING_MAPPING_SHA256,
    financeSha256:
      '4f30d7dd43aa2190604d4fb73c776a8d4aaa263653dc783def6f7c2c5cc80805',
    decision,
    decisionFingerprint: parseOpeningEconomicDecision(decision).fingerprint,
    assembly,
  };
  mutate?.(payload);
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId,
      sourceKind: 'AUTHORITATIVE_DATASET',
      locator: 'artifacts/world-balanced-candidate-v1/CHECKSUMS.json',
      sourceVersion: CHECKSUMS,
      payload,
    },
    sha,
  );
  return createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId(assembly.seedId),
      worldId: worldId(world),
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches,
    },
    sha,
  );
}
export async function persistVisibilitySeed(
  database: V09AtomicTestDatabase,
  world: string,
  mutate?: (payload: Record<string, unknown>) => void,
) {
  await database.executeScript(
    await readFile(
      new URL(
        '../../database/migrations/artifacts/0016_world_v2_opening_seed.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  await database.executeScript(
    await readFile(
      new URL(
        '../../database/proposals/runtime-read-binding-storage.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const seed = visibilitySeed(world, mutate);
  await new WorldOpeningSeedStore({ database, sha256Hex: sha }).bootstrap({
    seed,
    bootstrappedAtReal: '2026-09-14T00:00:00.000Z',
  });
  return seed;
}
export async function admitVisibilitySeed(
  database: V09AtomicTestDatabase,
  world: string,
) {
  // Existing publication veto is bypassed ONLY in this isolated fixture and
  // restored immediately. No production admission entrypoint is implemented.
  await database.executeScript(
    `alter table world_v2.runtime_opening_admission disable trigger runtime_opening_admission_requires_real_publication`,
  );
  try {
    await database.query(
      `insert into world_v2.runtime_opening_admission(world_id,admission_ref,seed_id,seed_fingerprint,model_version,replay_binding)
      select world_id,'ADMISSION_VISIBILITY_TEST',seed_id,seed_fingerprint,$2,replay_binding from world_v2.opening_seed where world_id=$1`,
      [world, CURRENT_REPLAY_BINDING.modelVersion],
    );
  } finally {
    await database.executeScript(
      `alter table world_v2.runtime_opening_admission enable trigger runtime_opening_admission_requires_real_publication`,
    );
  }
}
