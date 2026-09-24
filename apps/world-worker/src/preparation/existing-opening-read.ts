import { DOMAIN_ERROR_CODES, DomainError } from '@econmind/core';

import type { WorldOpeningSeedStore } from '../persistence/opening-seed-store.js';
import {
  inspectSingleWorldWorkerPreparation,
  type WorkerSingleWorldPreflightInput,
} from './single-world-preflight.js';

export interface ExistingSingleWorldOpeningRead {
  readonly status: 'EXISTING_OPENING_READ_ONLY';
  readonly preparationStatus: 'PREPARATION_ONLY';
  readonly initializationAuthorized: false;
  readonly workerDispatchAllowed: false;
  readonly candidateBoundToOpening: false;
  readonly worldId: string;
  readonly openingSeedId: string;
  readonly openingSeedFingerprint: string;
  readonly openingWorldVersion: '0';
  readonly preflightFingerprint: string;
  readonly preflightBlockers: readonly string[];
}

/**
 * Read-only diagnostic pairing. The opening seed is durable authority; the
 * candidate preflight is separate evidence and cannot initialize that seed.
 */
export async function inspectExistingSingleWorldOpening(input: {
  readonly openingStore: WorldOpeningSeedStore;
  readonly preflightInput: WorkerSingleWorldPreflightInput;
}): Promise<Readonly<ExistingSingleWorldOpeningRead>> {
  const preflight = inspectSingleWorldWorkerPreparation(input.preflightInput);
  if (preflight.initialSimTime !== '0') {
    throw new DomainError(
      DOMAIN_ERROR_CODES.OPENING_SEED_INVALID,
      'Existing opening inspection requires opening SimTime zero',
    );
  }
  const opening = await input.openingStore.load(preflight.worldId);
  if (
    opening.worldId !== preflight.worldId ||
    opening.openingWorldVersion !== '0'
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.OPENING_SEED_INVALID,
      'Persisted opening does not match the requested World and version zero',
    );
  }
  return Object.freeze({
    status: 'EXISTING_OPENING_READ_ONLY',
    preparationStatus: 'PREPARATION_ONLY',
    initializationAuthorized: false,
    workerDispatchAllowed: false,
    candidateBoundToOpening: false,
    worldId: opening.worldId,
    openingSeedId: opening.seedId,
    openingSeedFingerprint: opening.fingerprint,
    openingWorldVersion: opening.openingWorldVersion,
    preflightFingerprint: preflight.fingerprint,
    preflightBlockers: Object.freeze([...preflight.blockers]),
  });
}
