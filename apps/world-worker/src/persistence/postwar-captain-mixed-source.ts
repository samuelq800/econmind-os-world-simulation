import {
  readPagedFromPreparedSocialBaseOnHeldExecutor,
  releasePostwarPagedFinanceSocialReplay,
} from './postwar-paged-finance-social-replay.js';
/** Fixed server-owned Captain replay binding. The private H0 preparation is
 * DATA, not source/actor/lease/admission authority. Every request reloads the
 * actual complete bounded SQL prefix and current custody in its owning tx. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  type CanonicalCommand,
  type CaptainPoliticalCapitalReplayState,
} from '@econmind/core';
import {
  readPostwarSocialRuntimeFinancialReplayBase,
  readPostwarSocialRuntimeConnectionResources,
  isPostwarSocialRuntimeConnection,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import { consumePreparedPostwarSocialFinancialReplayBase } from './prepared-postwar-social-source.js';
import { validateCaptainSourcePublicationPacket } from './postwar-captain-source-publication.js';
import type { CaptainOperatingOriginal } from './captain-operating-source-custody.js';
import type { SqlExecutor } from './sql-database.js';
import { decodeDurableCanonicalCommandRow } from './durable-v08-ledger-lineage-reader.js';
export interface PostwarCaptainMixedSource {
  readonly kind: 'POSTWAR_CAPTAIN_GENUINE_MIXED_SOURCE';
}
const issued = new WeakMap<
  object,
  Readonly<{ worldId: string; social: PostwarSocialRuntimeConnection }>
>();
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(s: string): never {
  throw Error('CAPTAIN_MIXED_SOURCE:' + s);
}
function one<T>(a: readonly T[]): T {
  if (a.length !== 1) invalid('ONE_EXACT_ORIGINAL_REQUIRED');
  return a[0]!;
}
export function createPostwarCaptainMixedSource(input: {
  worldId: string;
  social: PostwarSocialRuntimeConnection;
}): Readonly<PostwarCaptainMixedSource> {
  if (!isPostwarSocialRuntimeConnection(input.social, input.worldId))
    invalid('GENUINE_SAME_WORLD_SOCIAL_CONNECTION_REQUIRED');
  const v = Object.freeze({
    kind: 'POSTWAR_CAPTAIN_GENUINE_MIXED_SOURCE' as const,
  });
  issued.set(
    v,
    Object.freeze({ worldId: input.worldId, social: input.social }),
  );
  return v;
}
export function isPostwarCaptainMixedSource(
  value: unknown,
): value is PostwarCaptainMixedSource {
  return !!value && typeof value === 'object' && issued.has(value);
}
/** No callback/configured balance/ready flag is accepted. The source guard
 * retains actual actor+lease+adoption locks before invoking this read. */
export async function readPostwarCaptainMixedSourceFrom(
  tx: SqlExecutor,
  input: {
    binding: PostwarCaptainMixedSource;
    command: CanonicalCommand;
    genesis: CaptainOperatingOriginal;
    reason: CaptainOperatingOriginal;
    mode: 'TEST_ONLY_LOCAL' | 'OFFICIAL_RUNTIME';
  },
): Promise<
  Readonly<{
    seed: { seedId: string; fingerprint: string };
    headWorldVersion: string;
    headEventSequence: string;
    state: CaptainPoliticalCapitalReplayState;
    eventRefs: readonly string[];
    predecessorSnapshotHash: string | null;
  }>
> {
  const token = issued.get(input.binding);
  if (!token) invalid('GENUINE_LIVE_BINDING_REQUIRED');
  if (token.worldId !== input.command.worldId) invalid('EXACT_WORLD_REQUIRED');
  const b = consumePreparedPostwarSocialFinancialReplayBase(
      readPostwarSocialRuntimeFinancialReplayBase(token.social, token.worldId),
    ),
    c = input.command;
  if (
    b.pins.worldId !== c.worldId ||
    !b.document.countries.some((x) => x.countryId === c.countryId)
  )
    invalid('EXACT_WORLD_COUNTRY_REQUIRED');
  const r = await tx.query<Record<string, unknown>>(
    'select * from world_v2.read_postwar_captain_paged_scope($1,$2,$3::uuid,$4)',
    [c.worldId, c.countryId, c.authSubject, c.expectedWorldVersion],
  );
  const row = r.rows[0];
  if (
    r.rows.length !== 1 ||
    !row ||
    row.seed_id !== b.pins.seedRef ||
    row.seed_fingerprint !== b.pins.contentHash ||
    row.admission_ref !== b.pins.admissionRef ||
    row.world_version !== c.expectedWorldVersion ||
    typeof row.event_sequence !== 'string' ||
    !/^(0|[1-9]\d*)$/u.test(row.event_sequence) ||
    row.history_mode !== 'GENUINE_SHARED_PAGED_CORE_REPLAY_REQUIRED' ||
    !Array.isArray(row.captain_packets) ||
    row.captain_packets.length !== 1
  )
    invalid('ACTUAL_ADMISSION_HEAD_BASE_MISMATCH');
  const p = row.captain_packets[0];
  if (
    !p ||
    typeof p.packet_text !== 'string' ||
    Buffer.byteLength(p.packet_text) > 65536 ||
    sha(p.packet_text) !== p.packet_sha256
  )
    invalid('PACKET_BYTES_REQUIRED');
  const packet = validateCaptainSourcePublicationPacket(
    JSON.parse(p.packet_text),
  );
  if (
    canonicalSerialize(packet) !== p.packet_text ||
    packet.adoption.worldId !== c.worldId ||
    packet.adoption.countryId !== c.countryId ||
    packet.adoption.seedId !== b.pins.seedRef ||
    packet.adoption.seedFingerprint !== b.pins.contentHash ||
    packet.adoption.worldAdmissionRef !== b.pins.admissionRef ||
    canonicalSerialize(packet.originalTexts) !==
      canonicalSerialize(p.originals) ||
    canonicalSerialize(packet.genesis) !== canonicalSerialize(input.genesis) ||
    !packet.reasons.some(
      (r) => canonicalSerialize(r) === canonicalSerialize(input.reason),
    ) ||
    (input.mode === 'OFFICIAL_RUNTIME' &&
      packet.genesis.sourceClass !== 'ADMITTED_ORIGINAL')
  )
    invalid('CURRENT_HELD_ORIGINAL_DIFFERS');
  // Caller owns genuine Captain custody. Return only to the private connection's
  // fixed worker for the sibling Social reader, and restore Captain on all paths.
  const role = readPostwarSocialRuntimeConnectionResources(
    token.social,
  ).workerRole;
  const session = await tx.query<{ role_name: string }>(
    'select current_user as role_name',
  );
  if (
    session.rows.length !== 1 ||
    session.rows[0]?.role_name !== 'world_v2_captain_source_reader'
  )
    invalid('FIXED_CAPTAIN_READER_REQUIRED');
  await tx.query("select set_config('role',$1,true)", [role]);
  let result:
    | Awaited<ReturnType<typeof readPagedFromPreparedSocialBaseOnHeldExecutor>>
    | undefined;
  try {
    result = await readPagedFromPreparedSocialBaseOnHeldExecutor(tx, {
      socialConnection: token.social,
      worldId: c.worldId,
      hostCountryId: c.countryId,
      expectedHead: {
        worldVersion: row.world_version as string,
        eventSequence: row.event_sequence,
      },
      captainCountryId: c.countryId,
      requireCaptain: true,
      omoOriginalMode: input.mode,
    });
    if (BigInt(result.metadata.maxCommandSimTimeTicks) > c.simTime.ticks)
      invalid('FUTURE_FRAME_REQUIRED_REJECTION');
    const state = one(
      (result.view.result.captainCountries ?? []).filter(
        (x) => x.countryId === c.countryId,
      ),
    ).state;
    const predecessorSnapshotHash =
      result.metadata.captainPredecessorSnapshotHashes[c.countryId] ?? null;
    if ((state.applied.length === 0) !== (predecessorSnapshotHash === null))
      invalid('COMPLETE_CAPTAIN_PREDECESSOR_REQUIRED');
    return Object.freeze({
      seed: Object.freeze({
        seedId: b.pins.seedRef,
        fingerprint: b.pins.contentHash,
      }),
      headWorldVersion: result.view.head.worldVersion,
      headEventSequence: result.view.head.eventSequence,
      state,
      eventRefs: Object.freeze(state.applied.map((x) => x.eventId)),
      predecessorSnapshotHash,
    });
  } finally {
    try {
      if (result) releasePostwarPagedFinanceSocialReplay(result);
    } finally {
      await tx.query("select set_config('role',$1,true)", [
        'world_v2_captain_source_reader',
      ]);
    }
  }
}

export async function readPostwarCaptainDurableCommandFrom(
  tx: SqlExecutor,
  input: { worldId: string; commandId: string; commandFingerprint: string },
): Promise<CanonicalCommand> {
  const r = await tx.query<{ command_row: Record<string, unknown> }>(
    'select world_v2.read_postwar_captain_durable_command($1,$2,$3) as command_row',
    [input.worldId, input.commandId, input.commandFingerprint],
  );
  if (r.rows.length !== 1 || !r.rows[0]?.command_row)
    invalid('DURABLE_COMMAND_REQUIRED');
  const c = decodeDurableCanonicalCommandRow(r.rows[0].command_row, sha);
  if (
    c.worldId !== input.worldId ||
    c.commandId !== input.commandId ||
    c.fingerprint !== input.commandFingerprint
  )
    invalid('EXACT_DURABLE_COMMAND_REQUIRED');
  return c;
}
