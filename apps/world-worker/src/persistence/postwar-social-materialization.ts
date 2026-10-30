/** Replaceable cache observation, never an economic input or authority. The
 * caller already holds actual source/H guards and a complete Core-replayed
 * prefix. Compare the key's last matching committed event, not global H. */
import { createHash } from 'node:crypto';
import { DomainError, DOMAIN_ERROR_CODES, worldId } from '@econmind/core';
import { observeCurrentMaterialization } from './current-materialization-observation.js';
import type { PostwarSocialReplayLineage } from './prepared-postwar-social-source.js';
import type { SqlExecutor } from './sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'SOCIAL_MATERIALIZATION:' + reason,
  );
}
export async function observePostwarSocialMaterialization(input: {
  readonly executor: SqlExecutor;
  readonly lineage: Pick<
    PostwarSocialReplayLineage,
    'worldId' | 'headWorldVersion' | 'transitions'
  >;
  readonly countryId: string;
  readonly kind: 'POSITION' | 'SERVICE';
}) {
  const l = input.lineage,
    key =
      input.kind === 'POSITION'
        ? `SOCIAL_POSITION_LIFECYCLE_${input.countryId}`
        : `SOCIAL_EMPLOYMENT_SERVICE_${input.countryId}`;
  const matching = new Set(
    input.kind === 'POSITION'
      ? ['SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1']
      : ['SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1', 'SOCIAL_JOB_MATCH_SETTLED_V1'],
  );
  const latest = l.transitions
    .filter((t) => t.command.countryId === input.countryId)
    .flatMap((t) =>
      t.transition.events
        .filter((e) => matching.has(e.eventType))
        .map((event) => ({ entry: t, event })),
    )
    .at(-1);
  const bounded = await input.executor.query<{ bounded: boolean }>(
    'select coalesce(bool_and(octet_length(canonical_payload)<=1048576),true) as bounded from world_v2.current_materialization where world_id=$1 and materialization_key=$2',
    [l.worldId, key],
  );
  if (bounded.rows.length !== 1 || bounded.rows[0]?.bounded !== true)
    invalid('CACHE_ROW_BYTE_CAPACITY_EXCEEDED');
  const observation = await observeCurrentMaterialization({
    executor: input.executor,
    worldId: worldId(l.worldId),
    key,
    expectedWorldVersion: l.headWorldVersion,
    sha256Hex: sha,
  });
  if (!latest) {
    if (observation.valueWorldVersion !== null)
      invalid('CACHE_WITHOUT_CANONICAL_DOMAIN_ORIGIN');
    return observation;
  }
  const payload: unknown = JSON.parse(latest.event.canonicalPayload);
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload))
    invalid('CANONICAL_ORIGIN_PAYLOAD_REQUIRED');
  const afterStateHash = (payload as Readonly<Record<string, unknown>>)
    .afterStateHash;
  if (
    latest.entry.receipt.outcome !== 'COMMITTED' ||
    latest.event.causationCommandId !== latest.entry.command.commandId ||
    observation.valueWorldVersion !== latest.event.worldVersion ||
    typeof afterStateHash !== 'string' ||
    observation.payloadHash !== afterStateHash ||
    observation.canonicalPayload === null
  )
    invalid('CACHE_DIFFERS_FROM_LAST_CANONICAL_DOMAIN_EVENT');
  const source = await input.executor.query<{ source_command_id: string }>(
    'select source_command_id from world_v2.current_materialization where world_id=$1 and materialization_key=$2 and world_version=$3 and payload_sha256=$4',
    [l.worldId, key, observation.valueWorldVersion, observation.payloadHash],
  );
  if (
    source.rows.length !== 1 ||
    source.rows[0]?.source_command_id !== latest.entry.command.commandId
  )
    invalid('CACHE_SOURCE_COMMAND_DIFFERS_FROM_COMMITTED_ORIGIN');
  // Observe helper already hashes the exact canonical payload; matching the
  // event's afterStateHash ties those bytes to the fully replayed prefix.
  return observation;
}
