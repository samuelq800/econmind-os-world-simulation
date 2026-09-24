import {
  connectCountrySeedProvenanceToCalibration,
  type ProvenanceCalibrationIssue,
  type ProvenanceCalibrationLinkStatus,
} from '../calibration/country-provenance-adapter.js';
import {
  canonicalSha256,
  type CanonicalSha256,
  type Sha256Hex,
} from '../commands/command.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { worldId, type WorldId } from '../ids.js';
import {
  prepareNpcResourceAllocationIntent,
  type NpcIntentPreparationInput,
  type NpcUnavailableReason,
} from '../npc/intent-preparation.js';
import type { CountrySeedProvenancePreparation } from '../opening/country-seed-provenance-preparation.js';
import { isSimTime, type SimTime } from '../numeric/sim-time.js';
import { canonicalHashInput } from '../serialization/canonical.js';
import { createSimulationClockState } from '../time/simulation-clock.js';

export const SINGLE_WORLD_PREFLIGHT_VERSION =
  'single-world-preflight-v1' as const;

export interface SingleWorldPreflightInput {
  readonly worldId: WorldId;
  readonly initialSimTime: SimTime;
  readonly provenance: CountrySeedProvenancePreparation;
  readonly calibration: unknown;
  readonly npcInputs: readonly NpcIntentPreparationInput[];
  readonly sha256Hex: Sha256Hex;
}

export interface SingleWorldNpcScreening {
  readonly countryId: string;
  readonly status: 'CANDIDATE_ONLY' | 'UNAVAILABLE';
  readonly reason: NpcUnavailableReason | null;
  readonly fingerprint: CanonicalSha256 | null;
}

export interface SingleWorldPreflightIssue {
  readonly code: ProvenanceCalibrationIssue['code'];
  readonly countryId: string | null;
  readonly metricRef: string | null;
  readonly calibrationPath: string | null;
  readonly missingFields: readonly string[];
}

export interface SingleWorldPreflightResult {
  readonly preflightVersion: typeof SINGLE_WORLD_PREFLIGHT_VERSION;
  readonly status: 'PREPARATION_ONLY';
  readonly initializationAuthorized: false;
  readonly workerDispatchAllowed: false;
  readonly worldId: WorldId;
  readonly initialSimTime: string;
  readonly clockVersion: string;
  readonly countryCount: string;
  readonly provenanceCalibrationStatus: ProvenanceCalibrationLinkStatus;
  readonly provenanceCalibrationHashInput: string;
  readonly calibrationIssues: readonly SingleWorldPreflightIssue[];
  readonly npcScreenings: readonly SingleWorldNpcScreening[];
  readonly blockers: readonly string[];
  /** Canonical SHA-256 review preimage, not an OpeningSeed or Event. */
  readonly hashInput: string;
  readonly fingerprint: CanonicalSha256;
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
    `Single World preflight invalid: ${message}`,
  );
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Execute only existing candidate validators on one World. This cannot seed,
 * dispatch, advance the clock or certify any V27 dependency/ADR gate.
 */
export function prepareSingleWorldWorkerPreflight(
  input: SingleWorldPreflightInput,
): Readonly<SingleWorldPreflightResult> {
  const requestedWorldId = worldId(input.worldId);
  if (!isSimTime(input.initialSimTime)) invalid('initial SimTime is missing');
  if (
    !input.provenance ||
    input.provenance.worldId !== requestedWorldId ||
    !Array.isArray(input.npcInputs)
  ) {
    invalid('candidate sources must name the same World and NPC list');
  }
  const clock = createSimulationClockState(input.initialSimTime);
  const adapter = connectCountrySeedProvenanceToCalibration({
    provenance: input.provenance,
    calibration: input.calibration,
    sha256Hex: input.sha256Hex,
  });
  const configuredCountries = new Set(input.provenance.configuredCountryIds);
  const seenNpcCountries = new Set<string>();
  const npcScreenings = input.npcInputs.map((npc) => {
    if (
      !npc ||
      npc.worldId !== requestedWorldId ||
      !configuredCountries.has(npc.countryId) ||
      !isSimTime(npc.simTime) ||
      npc.simTime.ticks !== clock.simTime.ticks ||
      seenNpcCountries.has(npc.countryId)
    ) {
      invalid('NPC screening conflicts with World/country/SimTime');
    }
    seenNpcCountries.add(npc.countryId);
    const screening = prepareNpcResourceAllocationIntent(npc, input.sha256Hex);
    return Object.freeze({
      countryId: npc.countryId,
      status: screening.status,
      reason: screening.status === 'UNAVAILABLE' ? screening.reason : null,
      fingerprint:
        screening.status === 'CANDIDATE_ONLY' ? screening.fingerprint : null,
    });
  });
  npcScreenings.sort((left, right) => compare(left.countryId, right.countryId));
  const calibrationIssues = adapter.issues.map((issue) =>
    Object.freeze({
      code: issue.code,
      countryId: issue.countryId,
      metricRef: issue.metricRef,
      calibrationPath: issue.calibrationPath,
      missingFields: Object.freeze([...issue.missingFields]),
    }),
  );
  const blockers = new Set<string>(['V27_DEPENDENCY_AND_ADR_GATE_OPEN']);
  if (adapter.status !== 'AVAILABLE') {
    blockers.add(`CALIBRATION_PROVENANCE_${adapter.status}`);
  }
  for (const issue of adapter.issues) blockers.add(issue.code);
  if (npcScreenings.length === 0) blockers.add('NPC_INPUT_UNAVAILABLE');
  if (npcScreenings.some((item) => item.status === 'UNAVAILABLE')) {
    blockers.add('NPC_INTENT_UNAVAILABLE');
  }
  const body = Object.freeze({
    preflightVersion: SINGLE_WORLD_PREFLIGHT_VERSION,
    status: 'PREPARATION_ONLY' as const,
    initializationAuthorized: false as const,
    workerDispatchAllowed: false as const,
    worldId: requestedWorldId,
    initialSimTime: clock.simTime.toCanonicalValue(),
    clockVersion: clock.clockVersion,
    countryCount: adapter.countryCount,
    provenanceCalibrationStatus: adapter.status,
    provenanceCalibrationHashInput: adapter.hashInput,
    calibrationIssues: Object.freeze(calibrationIssues),
    npcScreenings: Object.freeze(npcScreenings),
    blockers: Object.freeze([...blockers].sort(compare)),
  });
  const hashInput = canonicalHashInput(body);
  return Object.freeze({
    ...body,
    hashInput,
    fingerprint: canonicalSha256(hashInput, input.sha256Hex),
  });
}
