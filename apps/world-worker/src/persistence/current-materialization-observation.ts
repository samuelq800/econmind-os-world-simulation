import {
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  worldId,
  type Sha256Hex,
  type WorldId,
} from '@econmind/core';
import type { SqlExecutor } from './sql-database.js';

declare const observationBrand: unique symbol;

/** A database observation, not admission, authorization or economic authority. */
export interface CurrentMaterializationObservation {
  readonly [observationBrand]: true;
  readonly worldId: WorldId;
  readonly key: string;
  readonly observedWorldVersion: string;
  readonly valueWorldVersion: string | null;
  readonly canonicalPayload: string | null;
  readonly payloadHash: `sha256:${string}` | null;
}

const observations = new WeakSet<object>();
const integer = /^(?:0|[1-9]\d*)$/u;
const keyPattern = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u;

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
}

/**
 * One SQL statement observes global head and this replaceable cache row at the
 * same database snapshot. Events/Postings remain authoritative; callers must
 * separately reconstruct and validate domain state and current permissions.
 */
export async function observeCurrentMaterialization(input: {
  readonly executor: SqlExecutor;
  readonly worldId: WorldId;
  readonly key: string;
  readonly expectedWorldVersion: string;
  readonly sha256Hex: Sha256Hex;
}): Promise<Readonly<CurrentMaterializationObservation>> {
  worldId(input.worldId);
  if (
    !integer.test(input.expectedWorldVersion) ||
    !keyPattern.test(input.key)
  ) {
    invalid('Materialization observation requires a canonical head and key');
  }
  const result = await input.executor.query<{
    readonly world_version: string;
    readonly value_world_version: string | null;
    readonly canonical_payload: string | null;
    readonly payload_sha256: string | null;
  }>(
    `select head.world_version::text,
            value.world_version::text as value_world_version,
            value.canonical_payload, value.payload_sha256
       from world_v2.world_head head
       left join world_v2.current_materialization value
         on value.world_id = head.world_id and value.materialization_key = $2
      where head.world_id = $1 and head.world_version = $3`,
    [input.worldId, input.key, input.expectedWorldVersion],
  );
  const row = result.rows[0];
  if (result.rows.length !== 1 || row === undefined) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.WORLD_VERSION_MISMATCH,
      'Materialization observation did not find the expected current World head',
    );
  }
  if (row.world_version !== input.expectedWorldVersion) {
    invalid('Materialization observation head is not the requested head');
  }
  let payloadHash: `sha256:${string}` | null = null;
  if (row.value_world_version === null) {
    if (row.canonical_payload !== null || row.payload_sha256 !== null) {
      invalid('Absent materialization has inconsistent payload evidence');
    }
  } else {
    if (
      !/^[1-9]\d*$/u.test(row.value_world_version) ||
      BigInt(row.value_world_version) > BigInt(row.world_version) ||
      typeof row.canonical_payload !== 'string'
    ) {
      invalid('Materialization value is ahead of its observed World head');
    }
    let payload: unknown;
    try {
      payload = JSON.parse(row.canonical_payload);
    } catch {
      invalid('Materialization payload is not JSON');
    }
    if (canonicalSerialize(payload) !== row.canonical_payload) {
      invalid('Materialization payload is not canonical');
    }
    payloadHash = canonicalSha256(canonicalHashInput(payload), input.sha256Hex);
    if (row.payload_sha256 !== payloadHash) {
      invalid('Materialization payload does not match its stored hash');
    }
  }
  const observation = Object.freeze({
    worldId: input.worldId,
    key: input.key,
    observedWorldVersion: row.world_version,
    valueWorldVersion: row.value_world_version,
    canonicalPayload: row.canonical_payload,
    payloadHash,
  }) as Readonly<CurrentMaterializationObservation>;
  observations.add(observation);
  return observation;
}

export function assertCurrentMaterializationObservation(input: {
  readonly observation: CurrentMaterializationObservation;
  readonly worldId: WorldId;
  readonly key: string;
  readonly expectedWorldVersion: string;
}): void {
  if (
    !observations.has(input.observation) ||
    input.observation.worldId !== input.worldId ||
    input.observation.key !== input.key ||
    input.observation.observedWorldVersion !== input.expectedWorldVersion
  ) {
    invalid(
      'Materialization requires an exact server-held database observation',
    );
  }
}
