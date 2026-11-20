/** Fixed bounded local artifact reader. JSON contains source DTOs, never private
 * runtime tokens. Only the actual Core reconstruction can issue a live proof. */
import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import {
  parseOpeningSeed,
  type OpeningSeed,
  type BeneficialHousingReclassificationReceipt,
} from '@econmind/core';
import {
  prepareBeneficialHousingRentSource,
  retireBeneficialHousingRentSource,
  hasPostwarBeneficialHousingRentSourceOwner,
  type PreparedBeneficialHousingRentSource,
} from '@econmind/world-worker/beneficial-housing-rent-source';
import {
  validateRegisteredNodeBeneficialRentArtifacts,
  type RegisteredNodeBeneficialRentArtifacts,
} from './registered-node-configuration.js';

export const REGISTERED_NODE_SEED_MAX_BYTES = 256 * 1024 * 1024;
export const REGISTERED_NODE_RENT_RECEIPTS_MAX_BYTES = 4 * 1024 * 1024;
interface ArtifactEvidence {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}
export interface RegisteredNodeLoadedArtifacts {
  readonly seed: Readonly<OpeningSeed>;
  readonly beneficialRentSource?: PreparedBeneficialHousingRentSource;
  readonly files: readonly Readonly<ArtifactEvidence>[];
}
const loadedPreparations = new WeakMap<object, 'OWNED' | 'RETIRED'>();

/** Cleanup only. The service calls after its actual shared-owner drain. A live
 * or pending transfer must never be invalidated by an artifact loader. */
export function retireRegisteredNodeRentSourceAfterDrain(
  proof: PreparedBeneficialHousingRentSource,
): void {
  const state = loadedPreparations.get(proof);
  if (!state) throw Error('NODE_RENT_LOADER_OWNED_PROOF_REQUIRED');
  if (state === 'RETIRED') return;
  if (hasPostwarBeneficialHousingRentSourceOwner(proof))
    throw Error('NODE_RENT_SOURCE_OWNER_STILL_ACTIVE');
  retireBeneficialHousingRentSource(proof);
  loadedPreparations.set(proof, 'RETIRED');
}
function exact(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('|') !== [...keys].sort().join('|')
  )
    throw Error('NODE_ARTIFACT_EXACT_SHAPE_REQUIRED:' + label);
}
const seedKeys = [
  'schemaVersion',
  'seedId',
  'worldId',
  'openingWorldVersion',
  'replayBinding',
  'sources',
  'inventoryEntries',
  'financialBatches',
  'fingerprint',
];
const receiptKeys = [
  'schemaVersion',
  'parentSeedFingerprint',
  'childSeedFingerprint',
  'worldId',
  'seedId',
  'countryId',
  'householdEntityId',
  'allocationId',
  'policyRef',
  'sourcePopulationRef',
  'originalSourceId',
  'originalAccount',
  'originalAmount',
  'claimId',
  'counterpartLiabilityAccount',
  'supplementalSourceId',
  'reclassificationBatchId',
  'regions',
  'groups',
  'pools',
  'leases',
  'subaccounts',
  'rentPaidAtOpening',
  'rentAccruedAtOpening',
  'newLegalClaims',
  'fingerprint',
];

async function readPinnedJson(path: string, expected: string, maximum: number) {
  if (
    typeof path !== 'string' ||
    !path.startsWith('/') ||
    path.includes('\0') ||
    typeof expected !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(expected)
  )
    throw Error('NODE_ARTIFACT_EXPLICIT_PATH_AND_SHA_REQUIRED');
  const handle = await open(path, 'r');
  try {
    const before = await handle.stat();
    if (
      !before.isFile() ||
      !Number.isSafeInteger(before.size) ||
      before.size < 1 ||
      before.size > maximum
    )
      throw Error('NODE_ARTIFACT_BYTE_LIMIT_OR_REGULAR_FILE_REQUIRED');
    const hash = createHash('sha256');
    const chunks: Buffer[] = [];
    let count = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(Math.min(65536, maximum - count + 1));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      count += bytesRead;
      if (count > maximum)
        throw Error('NODE_ARTIFACT_BYTE_LIMIT_OR_REGULAR_FILE_REQUIRED');
      const bytes = chunk.subarray(0, bytesRead);
      hash.update(bytes);
      chunks.push(bytes);
    }
    const after = await handle.stat();
    if (
      count !== before.size ||
      after.size !== before.size ||
      after.ino !== before.ino ||
      after.dev !== before.dev ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      throw Error('NODE_ARTIFACT_CHANGED_DURING_READ');
    const actual = hash.digest('hex');
    if (actual !== expected) throw Error('NODE_ARTIFACT_FILE_HASH_MISMATCH');
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        Buffer.concat(chunks, count),
      ),
    );
    return {
      value,
      evidence: Object.freeze({ path, sha256: actual, bytes: count }),
    };
  } finally {
    await handle.close();
  }
}

function parsedSeed(value: unknown): Readonly<OpeningSeed> {
  exact(value, seedKeys, 'OPENING_SEED');
  const list = (v: unknown): unknown[] => {
    if (!Array.isArray(v)) throw Error('NODE_ARTIFACT_EXACT_ARRAY_REQUIRED');
    return v;
  };
  for (const source of list(value.sources))
    exact(
      source,
      [
        'schemaVersion',
        'sourceId',
        'sourceKind',
        'locator',
        'sourceVersion',
        'canonicalPayload',
        'payloadHash',
      ],
      'OPENING_SOURCE',
    );
  for (const entry of list(value.inventoryEntries)) {
    exact(
      entry,
      ['entryId', 'sourceId', 'account', 'quantity'],
      'OPENING_INVENTORY_ENTRY',
    );
    exact(entry.quantity, ['amount', 'unit'], 'OPENING_QUANTITY');
    exact(
      entry.account,
      [
        'worldId',
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
      ],
      'OPENING_INVENTORY_ACCOUNT',
    );
  }
  for (const batch of list(value.financialBatches)) {
    exact(
      batch,
      ['batchId', 'sourceId', 'settlementCurrency', 'legs'],
      'OPENING_FINANCIAL_BATCH',
    );
    for (const leg of list(batch.legs)) {
      exact(
        leg,
        ['legId', 'account', 'direction', 'amount', 'counterpartLegId'],
        'OPENING_FINANCIAL_LEG',
      );
      exact(leg.amount, ['amount', 'currency'], 'OPENING_MONEY');
      exact(
        leg.account,
        [
          'worldId',
          'accountId',
          'ownerId',
          'countryId',
          'accountClass',
          'currency',
          'claimId',
          'counterpartyEntityId',
        ],
        'OPENING_FINANCIAL_ACCOUNT',
      );
    }
  }
  // Core validates source/account/balance/replay hashes and reconstructs brands.
  return parseOpeningSeed(value, (s) =>
    createHash('sha256').update(s).digest('hex'),
  );
}

/** This has no network/SQL/consumer/Clock side effect and accepts no caller
 * proof, source callback or readiness flag. Parent originals must be retained. */
export async function loadRegisteredNodeStartupArtifacts(input: {
  readonly seedPath: string;
  readonly seedFileSha256: string;
  readonly worldId: string;
  readonly beneficialRent?: Readonly<RegisteredNodeBeneficialRentArtifacts>;
}): Promise<Readonly<RegisteredNodeLoadedArtifacts>> {
  exact(
    input,
    [
      'seedPath',
      'seedFileSha256',
      'worldId',
      ...(Object.hasOwn(input, 'beneficialRent') ? ['beneficialRent'] : []),
    ],
    'LOADER_REQUEST',
  );
  if (
    typeof input.worldId !== 'string' ||
    !/^[A-Z][A-Z0-9_-]{0,255}$/u.test(input.worldId)
  )
    throw Error('NODE_ARTIFACT_EXACT_WORLD_REQUIRED');
  const config = Object.hasOwn(input, 'beneficialRent')
    ? validateRegisteredNodeBeneficialRentArtifacts(input.beneficialRent)
    : undefined;
  const childFile = await readPinnedJson(
    input.seedPath,
    input.seedFileSha256,
    REGISTERED_NODE_SEED_MAX_BYTES,
  );
  const seed = parsedSeed(childFile.value);
  childFile.value = undefined;
  if (seed.worldId !== input.worldId) throw Error('NODE_SEED_WORLD_MISMATCH');
  if (!config)
    return Object.freeze({ seed, files: Object.freeze([childFile.evidence]) });
  const parentFile = await readPinnedJson(
    config.parentSeedPath,
    config.parentSeedFileSha256,
    REGISTERED_NODE_SEED_MAX_BYTES,
  );
  const parentSeed = parsedSeed(parentFile.value);
  parentFile.value = undefined;
  if (parentSeed.worldId !== input.worldId || parentSeed.seedId !== seed.seedId)
    throw Error('NODE_RENT_EXACT_PARENT_CHILD_WORLD_REQUIRED');
  // The formal operating child retains the complete cfc parent family. A
  // historical one-financial-source -> 71 child cannot substitute for it.
  if (parentSeed.sources.length !== 4)
    throw Error('NODE_RENT_COMPLETE_FOUR_SOURCE_PARENT_REQUIRED');
  const receiptFile = await readPinnedJson(
    config.receiptsPath,
    config.receiptsFileSha256,
    REGISTERED_NODE_RENT_RECEIPTS_MAX_BYTES,
  );
  if (
    !Array.isArray(receiptFile.value) ||
    receiptFile.value.length < 1 ||
    receiptFile.value.length > 70
  )
    throw Error('NODE_RENT_COMPLETE_RECEIPT_ARRAY_REQUIRED');
  for (const receipt of receiptFile.value)
    exact(receipt, receiptKeys, 'RECLASSIFICATION_RECEIPT');
  const beneficialRentSource = prepareBeneficialHousingRentSource({
    parentSeed,
    seed,
    receipts: receiptFile.value as BeneficialHousingReclassificationReceipt[],
  });
  loadedPreparations.set(beneficialRentSource, 'OWNED');
  return Object.freeze({
    seed,
    beneficialRentSource,
    files: Object.freeze([
      childFile.evidence,
      parentFile.evidence,
      receiptFile.evidence,
    ]),
  });
}
