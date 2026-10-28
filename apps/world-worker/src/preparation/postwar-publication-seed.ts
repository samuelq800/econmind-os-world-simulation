/** Reinspect the complete candidate before the existing signed publication
 * protocol. This function neither signs nor bootstraps nor admits a world. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  createOpeningSeed,
  parseOpeningSeed,
  type OpeningSeed,
} from '@econmind/core';
import type {
  LoadedOfficialOpeningBundle,
  OfficialOpeningPublicationSourceBundleV3,
} from './official-opening-bundle-loader.js';
import { decodePostwarSeedDocument } from './postwar-seed-document.js';
import { derivePostwarSourceContextFromLoaded } from './postwar-source-context.js';
import {
  buildPostwarOperatingSupplies,
  appendPostwarOperatingSupplies,
  POSTWAR_SUPPLIES_POLICY_PATH,
} from './postwar-operating-supplies.js';
import { validatePostwarPhysicalServiceReceiptFromSeed } from './postwar-physical-service-receipt.js';
import { readPostwarOperatingGenesisFromSeed } from './postwar-operating-genesis-adoption.js';

const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
export function validatePostwarOpeningPublicationSeed(input: {
  readonly loaded: LoadedOfficialOpeningBundle;
  readonly bundle: OfficialOpeningPublicationSourceBundleV3;
  readonly financialSeed: OpeningSeed;
}): OpeningSeed {
  if (input.loaded.bundle !== input.bundle)
    throw Error('POSTWAR_PUBLICATION_LOADER_BINDING_REQUIRED');
  const financial = parseOpeningSeed(
    JSON.parse(canonicalSerialize(input.financialSeed)),
    sha,
  );
  const seed = parseOpeningSeed(
    decodePostwarSeedDocument(input.bundle.operating.finalSeedBytes),
    sha,
  );
  if (
    seed.worldId !== financial.worldId ||
    seed.seedId !== financial.seedId ||
    canonicalSerialize(seed.replayBinding) !==
      canonicalSerialize(financial.replayBinding)
  )
    throw Error('POSTWAR_PUBLICATION_WORLD_OR_REPLAY_BINDING_MISMATCH');
  readPostwarOperatingGenesisFromSeed(seed);
  const operating = seed.sources.filter(
    (source) =>
      (JSON.parse(source.canonicalPayload) as { schemaVersion?: unknown })
        .schemaVersion === 'postwar-operating-genesis-seed-source-v1',
  );
  if (operating.length !== 1)
    throw Error('POSTWAR_PUBLICATION_EXACT_OPERATING_SOURCE_REQUIRED');
  const payload = JSON.parse(operating[0]!.canonicalPayload) as {
    carrier: {
      documents: readonly { path: string; bytes: string }[];
      physicalServiceReceiptDocumentId?: string;
    };
  };
  const documents = payload.carrier.documents.filter(
    (d) => d.path === POSTWAR_SUPPLIES_POLICY_PATH,
  );
  if (documents.length !== 1)
    throw Error('POSTWAR_PUBLICATION_EXACT_SUPPLY_POLICY_REQUIRED');
  const context = derivePostwarSourceContextFromLoaded(input.loaded);
  const supplies = buildPostwarOperatingSupplies({
    source: context.source,
    adoption: context.labourSocial,
    mappingBytes: context.mappingBytes,
    countriesBytes: context.countriesBytes,
    regionsBytes: context.regionsBytes,
    worldId: seed.worldId,
    seedId: seed.seedId,
    policyBytes: documents[0]!.bytes,
  });
  if (typeof payload.carrier.physicalServiceReceiptDocumentId !== 'string')
    throw Error('POSTWAR_PUBLICATION_PHYSICAL_SERVICE_RECEIPT_REQUIRED');
  validatePostwarPhysicalServiceReceiptFromSeed({
    seed,
    documentId: payload.carrier.physicalServiceReceiptDocumentId,
    context,
  });
  const expected = appendPostwarOperatingSupplies(financial, supplies);
  const actual = createOpeningSeed(
    {
      schemaVersion: seed.schemaVersion,
      seedId: seed.seedId,
      worldId: seed.worldId,
      openingWorldVersion: seed.openingWorldVersion,
      replayBinding: seed.replayBinding,
      sources: seed.sources.filter((source) => source !== operating[0]),
      inventoryEntries: seed.inventoryEntries,
      financialBatches: seed.financialBatches,
    },
    sha,
  );
  if (canonicalSerialize(actual) !== canonicalSerialize(expected))
    throw Error('POSTWAR_PUBLICATION_FINANCIAL_OR_PHYSICAL_LINEAGE_MISMATCH');
  return seed;
}
