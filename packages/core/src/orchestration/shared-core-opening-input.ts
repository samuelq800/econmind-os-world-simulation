import { validateV27_2CalibrationPreparation } from '../calibration/country-input-closure.js';
import {
  canonicalSha256,
  type CanonicalSha256,
  type Sha256Hex,
} from '../commands/command.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { isSimTime, type SimTime } from '../numeric/sim-time.js';
import { parseOpeningSeed } from '../opening/opening-seed.js';
import { canonicalHashInput } from '../serialization/canonical.js';
import { createSimulationClockState } from '../time/simulation-clock.js';
import { prepareSingleWorldConfiguration } from './single-world-configuration.js';

export const SHARED_CORE_OPENING_INPUT_VERSION =
  'shared-core-opening-input-preparation-v1' as const;

export interface SharedCoreOpeningInputPreparation {
  readonly schemaVersion: typeof SHARED_CORE_OPENING_INPUT_VERSION;
  readonly status: 'PREPARATION_ONLY';
  readonly initializationAuthorized: false;
  readonly orchestratorSelected: false;
  readonly worldIdStatus: 'V27_V28_OPENING_MATCHED';
  readonly configurationRefStatus: 'V27_V28_ONLY';
  readonly worldId: string;
  readonly countryCount: '70';
  readonly countryConfigurationRef: CanonicalSha256;
  readonly calibrationFingerprint: CanonicalSha256;
  readonly coreConfigurationHash: CanonicalSha256;
  readonly openingSeedId: string;
  readonly openingSeedFingerprint: CanonicalSha256;
  readonly openingWorldVersion: '0';
  readonly initialSimTime: '0';
  readonly blockers: readonly [
    'V27_1_PROVENANCE_LINK_UNVERIFIED',
    'COUNTRY_CONFIGURATION_AUTHORITY_UNVERIFIED',
    'OPENING_DURABILITY_UNVERIFIED',
    'OPENING_CONFIGURATION_BINDING_UNAVAILABLE',
    'CALIBRATION_OPENING_LINEAGE_UNVERIFIED',
    'V27_V28_DEPENDENCY_AND_ADR_GATE_OPEN',
  ];
  /** Diagnostic review fingerprint, never an initialization token. */
  readonly fingerprint: CanonicalSha256;
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
    `Shared Core opening input invalid: ${message}`,
  );
}

/**
 * One-World-at-a-time shared-Core input check. It selects neither the World
 * nor Season orchestrator and cannot bootstrap an OpeningSeed or start Core.
 */
export function prepareSharedCoreOpeningInput(input: {
  readonly calibration: unknown;
  readonly configuration: unknown;
  readonly openingSeed: unknown;
  readonly initialSimTime: SimTime;
  readonly sha256Hex: Sha256Hex;
}): Readonly<SharedCoreOpeningInputPreparation> {
  const calibration = validateV27_2CalibrationPreparation(
    input.calibration,
    input.sha256Hex,
  );
  if (calibration.status !== 'PREPARATION_INPUT_CLOSED') {
    invalid('V27.2 calibration candidate is incomplete');
  }
  const configuration = prepareSingleWorldConfiguration(
    input.configuration,
    input.sha256Hex,
  );
  const opening = parseOpeningSeed(input.openingSeed, input.sha256Hex);
  if (opening.sources.some((source) => source.sourceKind === 'TEST_FIXTURE')) {
    invalid('OpeningSeed TEST_FIXTURE provenance is not server authority');
  }
  if (!isSimTime(input.initialSimTime)) {
    invalid('initial SimTime must be canonical');
  }
  const clock = createSimulationClockState(input.initialSimTime);
  if (clock.simTime.ticks !== 0n) {
    invalid('initial SimTime must be zero');
  }
  if (
    calibration.candidate.worldId !== configuration.configuration.worldId ||
    calibration.candidate.countryConfigurationRef !==
      configuration.configuration.countryConfigurationRef ||
    configuration.configuration.countryCount !== '70' ||
    opening.worldId !== configuration.configuration.worldId ||
    opening.openingWorldVersion !== '0' ||
    opening.replayBinding.modelVersion !==
      configuration.configuration.modelVersion ||
    clock.clockVersion !== configuration.configuration.clockVersion
  ) {
    invalid('World/configuration/count/opening/clock identities disagree');
  }

  const blockers = Object.freeze([
    'V27_1_PROVENANCE_LINK_UNVERIFIED',
    'COUNTRY_CONFIGURATION_AUTHORITY_UNVERIFIED',
    'OPENING_DURABILITY_UNVERIFIED',
    'OPENING_CONFIGURATION_BINDING_UNAVAILABLE',
    'CALIBRATION_OPENING_LINEAGE_UNVERIFIED',
    'V27_V28_DEPENDENCY_AND_ADR_GATE_OPEN',
  ] as const);
  const body = Object.freeze({
    schemaVersion: SHARED_CORE_OPENING_INPUT_VERSION,
    status: 'PREPARATION_ONLY' as const,
    initializationAuthorized: false as const,
    orchestratorSelected: false as const,
    worldIdStatus: 'V27_V28_OPENING_MATCHED' as const,
    configurationRefStatus: 'V27_V28_ONLY' as const,
    worldId: opening.worldId,
    countryCount: '70' as const,
    countryConfigurationRef: calibration.candidate.countryConfigurationRef,
    calibrationFingerprint: calibration.fingerprint,
    coreConfigurationHash: configuration.snapshotHash,
    openingSeedId: opening.seedId,
    openingSeedFingerprint: opening.fingerprint,
    openingWorldVersion: opening.openingWorldVersion,
    initialSimTime: '0' as const,
    blockers,
  });
  return Object.freeze({
    ...body,
    fingerprint: canonicalSha256(canonicalHashInput(body), input.sha256Hex),
  });
}
