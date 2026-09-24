import {
  canonicalSha256,
  type CanonicalSha256,
  type Sha256Hex,
} from '../commands/command.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { worldId, type WorldId } from '../ids.js';
import type { replayAuthoritativeEvents } from '../replay/replay.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import { SIMULATION_CLOCK_VERSION } from '../time/simulation-clock.js';
import { WORLD_MODEL_VERSION } from '../versions.js';

/** Preparation only: one World, one existing Core, no mode-specific branch. */
export const SINGLE_WORLD_CONFIGURATION_VERSION =
  'single-world-configuration-preparation-v1' as const;

const POSITIVE_INTEGER = /^[1-9]\d*$/u;
const snapshots = new WeakSet<object>();

export interface SingleWorldConfiguration {
  readonly schemaVersion: typeof SINGLE_WORLD_CONFIGURATION_VERSION;
  readonly worldId: WorldId;
  readonly modelVersion: typeof WORLD_MODEL_VERSION;
  readonly countryCount: string;
  readonly clockVersion: typeof SIMULATION_CLOCK_VERSION;
  readonly economicExpiryClock: 'SIM_TIME';
}

export interface SingleWorldConfigurationSnapshot {
  readonly configuration: Readonly<SingleWorldConfiguration>;
  readonly canonicalSnapshot: string;
  readonly snapshotHash: CanonicalSha256;
}

export type SharedCoreReplayInput = Parameters<
  typeof replayAuthoritativeEvents
>[0];

function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.SCHEDULER_INPUT_INVALID, message);
}

/** Strictly parse a single-World configuration into immutable canonical evidence. */
export function prepareSingleWorldConfiguration(
  input: unknown,
  sha256Hex: Sha256Hex,
): SingleWorldConfigurationSnapshot {
  // Canonical round-trip rejects behavioral or hidden properties before
  // inspection, including getters, Proxies, functions and JS numbers.
  const normalized: unknown = JSON.parse(canonicalSerialize(input));
  if (
    normalized === null ||
    typeof normalized !== 'object' ||
    Array.isArray(normalized)
  ) {
    invalid('Single World configuration must be an inert record');
  }
  const record = normalized as Record<string, unknown>;
  const expected = [
    'schemaVersion',
    'worldId',
    'modelVersion',
    'countryCount',
    'clockVersion',
    'economicExpiryClock',
  ].sort();
  const keys = Object.keys(record).sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    invalid('Single World configuration has missing or unknown fields');
  }
  if (record.schemaVersion !== SINGLE_WORLD_CONFIGURATION_VERSION) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.VERSION_MISMATCH,
      'Unsupported single World configuration version',
    );
  }
  if (record.modelVersion !== WORLD_MODEL_VERSION) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.VERSION_MISMATCH,
      'World must bind to the current shared Core model version',
    );
  }
  if (record.clockVersion !== SIMULATION_CLOCK_VERSION) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.VERSION_MISMATCH,
      'World must use the existing Simulation Clock version',
    );
  }
  if (
    typeof record.countryCount !== 'string' ||
    !POSITIVE_INTEGER.test(record.countryCount)
  ) {
    invalid('Country count must be a configured positive integer string');
  }
  if (record.economicExpiryClock !== 'SIM_TIME') {
    invalid('Economic expiry must use simulation time');
  }
  const configuration: SingleWorldConfiguration = Object.freeze({
    schemaVersion: SINGLE_WORLD_CONFIGURATION_VERSION,
    worldId: worldId(record.worldId as string),
    modelVersion: WORLD_MODEL_VERSION,
    countryCount: record.countryCount,
    clockVersion: SIMULATION_CLOCK_VERSION,
    economicExpiryClock: 'SIM_TIME',
  });
  const snapshot = Object.freeze({
    configuration,
    canonicalSnapshot: canonicalSerialize(configuration),
    snapshotHash: canonicalSha256(canonicalHashInput(configuration), sha256Hex),
  });
  snapshots.add(snapshot);
  return snapshot;
}

/** Bind existing replay evidence without selecting or duplicating an engine. */
export function bindSingleWorldReplayInput(
  snapshot: SingleWorldConfigurationSnapshot,
  input: SharedCoreReplayInput,
): SharedCoreReplayInput {
  if (!snapshots.has(snapshot)) {
    invalid('Configuration snapshot was not prepared by Core');
  }
  if (
    input.origin.worldId !== snapshot.configuration.worldId ||
    input.binding.modelVersion !== snapshot.configuration.modelVersion ||
    input.registry.binding.modelVersion !==
      snapshot.configuration.modelVersion ||
    input.transitions.some(
      (transition) =>
        transition.worldId !== snapshot.configuration.worldId ||
        transition.events.some(
          (event) => event.worldId !== snapshot.configuration.worldId,
        ),
    )
  ) {
    invalid('Replay evidence conflicts with the configured World or model');
  }
  return input;
}
