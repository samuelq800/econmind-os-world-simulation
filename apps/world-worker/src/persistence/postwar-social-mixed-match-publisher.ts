/** Controlled one-shot publication only. Separate source/publisher connections
 * retain actual current source and H guards through SQL publication commit.
 * No Clock, lease takeover, candidate callback, supplied ledger or Ready flag. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  parseCanonicalCommand,
  parseSocialEmploymentServiceCommand,
  countryId,
  worldId,
  type CanonicalCommand,
} from '@econmind/core';
import {
  isPostwarSocialRuntimeConnection,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import {
  createPostwarMixedCurrentProjectionSource,
  consumePostwarMixedCurrentProjectionSnapshotFrom,
} from './postwar-mixed-current-projection-publication.js';
import { assertPostwarCurrentSocialMatchPlan } from './postwar-social-match-current-plan.js';
import { SOCIAL_CUSTODY_SESSION_QUERY } from './postgres-social-operating-custody.js';
import type { SqlDatabase } from './sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const POSTWAR_SOCIAL_MIXED_MATCH_PROPOSAL =
  'database/proposals/postwar-social-mixed-match-publisher.sql';
export const POSTWAR_SOCIAL_MIXED_MATCH_PUBLISH_QUERY =
  'select * from world_v2.publish_social_operating_mixed_match_due($1,$2,$3,$4)';
export async function publishPostwarMixedSocialMatchDue(input: {
  readonly socialConnection: Readonly<PostwarSocialRuntimeConnection>;
  readonly publisherDatabase: SqlDatabase;
  readonly worldId: string;
  readonly countryId: string;
  readonly planCommandId: string;
  readonly workerRole: string;
  readonly observedAtReal: string;
}): Promise<CanonicalCommand> {
  const world = worldId(input.worldId),
    country = countryId(input.countryId);
  if (
    !isPostwarSocialRuntimeConnection(input.socialConnection, world) ||
    input.publisherDatabase === input.socialConnection.database
  )
    throw Error('GENUINE_SOCIAL_SOURCE_AND_SEPARATE_PUBLISHER_REQUIRED');
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(
      input.observedAtReal,
    ) ||
    new Date(input.observedAtReal).toISOString() !== input.observedAtReal
  )
    throw Error('MIXED_MATCH_REAL_OBSERVATION_REQUIRED');
  // withSnapshot is the fixed pure DATA reader; no UI cache/publication method
  // is invoked. Its Core replays all known effects under actual source locks.
  const source = createPostwarMixedCurrentProjectionSource({
    socialConnection: input.socialConnection,
    worldId: world,
    workerRole: input.workerRole,
    publicationDatabase: input.publisherDatabase,
  });
  try {
    return await source.withSnapshot(country, async (tx, snapshot) => {
      const facts = consumePostwarMixedCurrentProjectionSnapshotFrom(
        tx,
        snapshot,
      );
      const plan = assertPostwarCurrentSocialMatchPlan({
        frames: facts.frames,
        socialCountries: facts.shared.social.countries,
        countryId: country,
        planCommandId: input.planCommandId,
        requirePending: false,
      });
      if (plan.state === 'PENDING')
        assertPostwarCurrentSocialMatchPlan({
          frames: facts.frames,
          socialCountries: facts.shared.social.countries,
          countryId: country,
          planCommandId: input.planCommandId,
          requirePending: true,
        });
      const witness = canonicalSerialize({
        schemaVersion: 'postwar-mixed-match-publication-v1',
        seedPins: facts.seedPins,
        head: facts.head,
        planState: plan.state,
        frames: facts.frames,
      });
      if (Buffer.byteLength(witness) > 4194304)
        throw Error('MIXED_MATCH_COMPLETE_WITNESS_CAPACITY_EXCEEDED');
      return input.publisherDatabase.transaction(async (publisher) => {
        await publisher.query(
          'set transaction isolation level repeatable read',
        );
        await publisher.query(
          'set local role world_v2_social_source_publisher',
        );
        const session = await publisher.query<Record<string, unknown>>(
            SOCIAL_CUSTODY_SESSION_QUERY,
          ),
          s = session.rows[0];
        if (
          session.rows.length !== 1 ||
          !s ||
          s.role_name !== 'world_v2_social_source_publisher' ||
          s.rolsuper !== false ||
          s.rolbypassrls !== false ||
          s.rolcreaterole !== false ||
          s.rolcreatedb !== false ||
          s.rolreplication !== false ||
          s.owner_member !== false ||
          s.read_only !== 'off' ||
          !['repeatable read', 'serializable'].includes(String(s.isolation))
        )
          throw Error('FIXED_SEPARATED_MIXED_MATCH_PUBLISHER_REQUIRED');
        const result = await publisher.query<Record<string, unknown>>(
          POSTWAR_SOCIAL_MIXED_MATCH_PUBLISH_QUERY,
          [world, country, input.planCommandId, witness],
        );
        if (result.rows.length !== 1)
          throw Error('EXACT_SQL_ISSUED_MIXED_MATCH_REQUIRED');
        const r = result.rows[0]!,
          time =
            r.submitted_at_real instanceof Date
              ? r.submitted_at_real.toISOString()
              : new Date(String(r.submitted_at_real)).toISOString();
        const command = parseCanonicalCommand(
          {
            schemaVersion: r.schema_version,
            actorId: r.actor_id,
            authSubject: r.auth_subject,
            commandId: r.command_id,
            commandType: r.command_type,
            correlationId: r.correlation_id,
            countryId: r.country_id,
            expectedWorldVersion: String(r.expected_world_version),
            idempotencyKey: r.idempotency_key,
            officeId: r.office_id,
            simTime: String(r.sim_time),
            submittedAtReal: time,
            worldId: r.world_id,
            payload: JSON.parse(String(r.canonical_payload)),
          },
          sha,
        );
        const parsed = parseSocialEmploymentServiceCommand(command, sha);
        if (
          command.fingerprint !== r.command_fingerprint ||
          command.payloadHash !== r.payload_sha256 ||
          parsed.kind !== 'MATCH' ||
          command.officeId !== null ||
          command.worldId !== world ||
          command.countryId !== country ||
          parsed.intent.planCommandId !== input.planCommandId ||
          parsed.intent.planFingerprint !== plan.frame.command.fingerprint ||
          command.simTime.ticks !== plan.frame.command.simTime.ticks
        )
          throw Error('SQL_MATCH_DIFFERS_FROM_GENUINE_CORE_PLAN');
        if (
          command.expectedWorldVersion !== facts.head.worldVersion &&
          !facts.frames.some(
            (f) =>
              f.command.commandId === command.commandId &&
              f.command.fingerprint === command.fingerprint,
          )
        )
          throw Error('STALE_UNSETTLED_MATCH_CANNOT_BE_REBASED');
        return command;
      });
    });
  } finally {
    await source.close();
  }
}
