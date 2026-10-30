/** Fixed server-owned Captain replay binding. The private H0 preparation is
 * DATA, not source/actor/lease/admission authority. Every request reloads the
 * actual complete bounded SQL prefix and current custody in its owning tx. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  type CanonicalCommand,
  type FinancialAccount,
  type CaptainPoliticalCapitalReplayState,
} from '@econmind/core';
import {
  replayPreparedFinanceSocialFxLedger,
  type FinanceSocialFxOriginal,
} from '@econmind/core/finance-social-prepared-ledger';
import {
  readPostwarSocialRuntimeFinancialReplayBase,
  isPostwarSocialRuntimeConnection,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import { consumePreparedPostwarSocialFinancialReplayBase } from './prepared-postwar-social-source.js';
import { projectPostwarOpeningFinancialEncumbrances } from './prepared-postwar-finance-social-fx-replay.js';
import { decodeBoundedPostwarCanonicalPrefix } from './bounded-postwar-canonical-prefix.js';
import { decodeBoundedPostwarJournal } from './bounded-postwar-fx-postings.js';
import { validateCaptainSourcePublicationPacket } from './postwar-captain-source-publication.js';
import type {
  CaptainOperatingOriginal,
  CaptainOperatingGenesisV1,
} from './captain-operating-source-custody.js';
import type { SqlExecutor } from './sql-database.js';
import { readPostwarBeneficialHousingRentMixedOriginalsForSocialBase } from './postwar-beneficial-housing-rent-mixed-source.js';
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
    'select * from world_v2.read_postwar_captain_mixed_prefix($1,$2,$3::uuid,$4)',
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
    !Array.isArray(row.captain_packets) ||
    !Array.isArray(row.fx_quotes)
  )
    invalid('ACTUAL_ADMISSION_HEAD_BASE_MISMATCH');
  const prefix = decodeBoundedPostwarCanonicalPrefix({
    worldId: c.worldId,
    prefixRow: row,
    journal: decodeBoundedPostwarJournal(row),
  });
  const originals = row.captain_packets.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      invalid('EXACT_PACKET_ROW_REQUIRED');
    const p = raw as Record<string, unknown>;
    if (
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
      packet.adoption.seedId !== row.seed_id ||
      packet.adoption.seedFingerprint !== row.seed_fingerprint ||
      packet.adoption.worldAdmissionRef !== row.admission_ref ||
      canonicalSerialize(packet.originalTexts) !==
        canonicalSerialize(p.originals)
    )
      invalid('EXACT_PUBLISHED_PACKET_SCOPE_REQUIRED');
    if (
      input.mode === 'OFFICIAL_RUNTIME' &&
      packet.genesis.sourceClass !== 'ADMITTED_ORIGINAL'
    )
      invalid('OFFICIAL_ORIGINAL_REQUIRED');
    return packet;
  });
  if (
    originals.length > 70 ||
    new Set(originals.map((p) => p.adoption.countryId)).size !==
      originals.length
  )
    invalid('UNIQUE_BOUNDED_COUNTRIES_REQUIRED');
  const host = one(
    originals.filter((p) => p.adoption.countryId === c.countryId),
  );
  if (
    canonicalSerialize(host.genesis) !== canonicalSerialize(input.genesis) ||
    !host.reasons.some(
      (reason) =>
        canonicalSerialize(reason) === canonicalSerialize(input.reason),
    )
  )
    invalid('CURRENT_HELD_ORIGINAL_DIFFERS');
  const fxOriginals: FinanceSocialFxOriginal[] = row.fx_quotes.map(
    (raw: unknown) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        invalid('EXACT_QUOTE_ROW_REQUIRED');
      const qrow = raw as Record<string, unknown>;
      if (
        typeof qrow.quote_text !== 'string' ||
        Buffer.byteLength(qrow.quote_text) > 4096 ||
        sha(qrow.quote_text) !== qrow.quote_text_sha256
      )
        invalid('EXACT_QUOTE_BYTES_REQUIRED');
      const q = JSON.parse(qrow.quote_text) as FinanceSocialFxOriginal['quote'];
      if (
        canonicalSerialize(q) !== qrow.quote_text ||
        q.worldId !== c.worldId ||
        q.seedFingerprint !== row.seed_fingerprint
      )
        invalid('QUOTE_SCOPE_REQUIRED');
      for (const [id, hash] of [
        [q.financialSourceId, q.financialSourcePayloadHash],
        [q.gcuSourceId, q.gcuSourcePayloadHash],
      ])
        if (
          b.sourceMetadata.filter(
            (s) => s.sourceId === id && s.payloadHash === hash,
          ).length !== 1
        )
          invalid('QUOTE_SOURCE_PIN_REQUIRED');
      const asset = (owner: string) =>
        one(
          b.financialAccounts.filter(
            (a) =>
              a.worldId === q.worldId &&
              a.countryId === q.countryId &&
              a.ownerId === owner &&
              a.counterpartyEntityId === q.centralBankEntityId &&
              a.currency === q.localCurrency &&
              a.accountClass === 'ASSET' &&
              a.claimId !== null,
          ),
        );
      const mirror = (a: FinancialAccount) =>
        one(
          b.financialAccounts.filter(
            (m) =>
              m.worldId === a.worldId &&
              m.countryId === a.countryId &&
              m.ownerId === q.centralBankEntityId &&
              m.counterpartyEntityId === a.ownerId &&
              m.claimId === a.claimId &&
              m.currency === a.currency &&
              m.accountClass === 'LIABILITY',
          ),
        );
      const treasuryAsset = asset(q.governmentEntityId),
        bankSettlementAsset = asset(q.bankEntityId);
      return {
        quote: q,
        treasuryAsset,
        treasuryLiability: mirror(treasuryAsset),
        bankSettlementAsset,
        bankSettlementLiability: mirror(bankSettlementAsset),
        bankGcuAsset: one(
          b.financialAccounts.filter(
            (a) =>
              a.accountId === q.dealerGcuAccountId &&
              a.worldId === q.worldId &&
              a.countryId === q.countryId &&
              a.ownerId === q.bankEntityId &&
              a.currency === 'GCU' &&
              a.accountClass === 'CASH',
          ),
        ),
      };
    },
  );
  const eventRefs: string[] = [];
  let predecessorSnapshotHash: string | null = null;
  for (const frame of prefix.frames) {
    if (frame.command.simTime.ticks > c.simTime.ticks)
      invalid('FUTURE_FRAME_REQUIRED_REJECTION');
    if (frame.command.commandType !== 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1')
      continue;
    const packet = one(
      originals.filter((p) => p.adoption.countryId === frame.command.countryId),
    );
    const intent = JSON.parse(frame.command.canonicalPayload) as {
      reasonFactRef: string;
    };
    const reason = one(
      packet.reasons.filter((r) => r.factRef === intent.reasonFactRef),
    );
    const event = frame.events[0];
    if (!event || frame.events.length !== 1)
      invalid('EXACT_CAPTAIN_FRAME_REQUIRED');
    const payload = JSON.parse(event.canonicalPayload) as {
      source: {
        reasonFact: {
          payload: unknown;
          factRef: string;
          sourceRef: string;
          predecessorFactRefs: readonly string[];
        };
        trace: { snapshot: { snapshotHash: string } };
      };
    };
    const body = JSON.parse(reason.canonicalPayload) as { reason: unknown };
    if (
      canonicalSerialize(payload.source.reasonFact.payload) !==
        canonicalSerialize(body.reason) ||
      payload.source.reasonFact.factRef !== reason.factRef ||
      payload.source.reasonFact.sourceRef !== reason.sourceRef ||
      canonicalSerialize(payload.source.reasonFact.predecessorFactRefs) !==
        canonicalSerialize(reason.predecessorFactRefs)
    )
      invalid('HISTORICAL_REASON_ORIGINAL_MISMATCH');
    for (const original of [packet.genesis, reason])
      if (
        BigInt(original.effectiveFromSimTime) > frame.command.simTime.ticks ||
        (original.effectiveUntilSimTime !== null &&
          frame.command.simTime.ticks >= BigInt(original.effectiveUntilSimTime))
      )
        invalid('HISTORICAL_ORIGINAL_NOT_EFFECTIVE');
    if (frame.command.countryId === c.countryId) {
      eventRefs.push(event.eventId);
      predecessorSnapshotHash = payload.source.trace.snapshot.snapshotHash;
    }
  }
  const beneficialHousingRentReceipts =
    readPostwarBeneficialHousingRentMixedOriginalsForSocialBase(b);
  const result = replayPreparedFinanceSocialFxLedger({
    prepared: b.prepared,
    ...(beneficialHousingRentReceipts === undefined
      ? {}
      : { beneficialHousingRentReceipts }),
    frames: prefix.frames,
    socialCountries: b.document.countries.map((s) => ({
      countryId: s.countryId,
      state: s.state,
      offers: s.offers,
    })),
    openingEncumbrances: projectPostwarOpeningFinancialEncumbrances(b.funding),
    fxOriginals,
    captainCountries: originals.map((p) => ({
      countryId: p.adoption.countryId,
      capital: (
        JSON.parse(p.genesis.canonicalPayload) as CaptainOperatingGenesisV1
      ).capital,
    })),
    expectedHead: prefix.head,
    sha256Hex: sha,
  });
  const state = one(
    (result.captainCountries ?? []).filter((s) => s.countryId === c.countryId),
  ).state;
  return Object.freeze({
    seed: Object.freeze({
      seedId: b.pins.seedRef,
      fingerprint: b.pins.contentHash,
    }),
    headWorldVersion: prefix.head.worldVersion,
    headEventSequence: prefix.head.eventSequence,
    state,
    eventRefs: Object.freeze(eventRefs),
    predecessorSnapshotHash,
  });
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
