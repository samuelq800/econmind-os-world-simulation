/** Historical immutable DATA only. It cannot grant Captain authority, source
 * currentness, actor membership, lease or a substitute opening ledger. */
import { createHash } from 'node:crypto';
import { canonicalSerialize } from '@econmind/core';
import type { FinanceNativeBudgetCanonicalFrame } from '@econmind/core/finance-budget-native';
import { validateCaptainSourcePublicationPacket } from './postwar-captain-source-publication.js';
import type { CaptainOperatingGenesisV1 } from './captain-operating-source-custody.js';
import type { SqlExecutor } from './sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(s: string): never {
  throw Error('CAPTAIN_HISTORY_ORIGINALS:' + s);
}
export interface PostwarCaptainHistoryScope {
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly frames: readonly FinanceNativeBudgetCanonicalFrame[];
}
export function decodePostwarCaptainHistoryPackets(
  raw: unknown,
  scope: PostwarCaptainHistoryScope,
) {
  if (!Array.isArray(raw) || raw.length > 70)
    invalid('BOUNDED_PACKET_SET_REQUIRED');
  let bytes = 0;
  const packets = raw.map((row: unknown) => {
    if (!row || typeof row !== 'object' || Array.isArray(row))
      invalid('PACKET_ROW_REQUIRED');
    const r = row as Record<string, unknown>;
    if (
      typeof r.packet_text !== 'string' ||
      Buffer.byteLength(r.packet_text) > 65536 ||
      sha(r.packet_text) !== r.packet_sha256
    )
      invalid('EXACT_PACKET_BYTES_REQUIRED');
    bytes += Buffer.byteLength(r.packet_text);
    if (bytes > 1048576) invalid('BOUNDED_TOTAL_BYTES_REQUIRED');
    const p = validateCaptainSourcePublicationPacket(JSON.parse(r.packet_text));
    if (
      canonicalSerialize(p) !== r.packet_text ||
      p.adoption.worldId !== scope.worldId ||
      p.adoption.seedFingerprint !== scope.seedFingerprint ||
      p.adoption.worldAdmissionRef !== scope.admissionRef ||
      canonicalSerialize(p.originalTexts) !== canonicalSerialize(r.originals)
    )
      invalid('EXACT_PUBLISHED_SCOPE_REQUIRED');
    return p;
  });
  if (new Set(packets.map((p) => p.adoption.countryId)).size !== packets.length)
    invalid('UNIQUE_COUNTRY_ORIGINAL_REQUIRED');
  for (const f of scope.frames) {
    if (f.command.commandType !== 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1')
      continue;
    const p = packets.filter(
      (p) => p.adoption.countryId === f.command.countryId,
    );
    if (p.length !== 1) invalid('COUNTRY_ORIGINAL_REQUIRED');
    const terms = JSON.parse(f.command.canonicalPayload) as {
      reasonFactRef: string;
    };
    const reasons = p[0]!.reasons.filter(
      (r) => r.factRef === terms.reasonFactRef,
    );
    if (reasons.length !== 1) invalid('EXACT_REASON_REQUIRED');
    const r = reasons[0]!,
      e = f.events[0];
    if (f.events.length !== 1 || !e) invalid('EXACT_EVENT_REQUIRED');
    const data = JSON.parse(e.canonicalPayload) as {
      source: {
        reasonFact: {
          payload: unknown;
          factRef: string;
          sourceRef: string;
          predecessorFactRefs: readonly string[];
        };
      };
    };
    if (
      canonicalSerialize(data.source.reasonFact.payload) !==
        canonicalSerialize(JSON.parse(r.canonicalPayload).reason) ||
      data.source.reasonFact.factRef !== r.factRef ||
      data.source.reasonFact.sourceRef !== r.sourceRef ||
      canonicalSerialize(data.source.reasonFact.predecessorFactRefs) !==
        canonicalSerialize(r.predecessorFactRefs)
    )
      invalid('HISTORICAL_REASON_DIFFERS');
    for (const original of [p[0]!.genesis, r])
      if (
        BigInt(original.effectiveFromSimTime) > f.command.simTime.ticks ||
        (original.effectiveUntilSimTime !== null &&
          f.command.simTime.ticks >= BigInt(original.effectiveUntilSimTime))
      )
        invalid('HISTORICAL_ORIGINAL_NOT_EFFECTIVE');
  }
  return Object.freeze({
    packets: Object.freeze(packets),
    captainCountries: Object.freeze(
      packets.map((p) =>
        Object.freeze({
          countryId: p.adoption.countryId,
          capital: (
            JSON.parse(p.genesis.canonicalPayload) as CaptainOperatingGenesisV1
          ).capital,
        }),
      ),
    ),
  });
}
async function readOriginalsFrom(
  tx: SqlExecutor,
  input: PostwarCaptainHistoryScope & {
    readonly hostCountryId: string;
    readonly officeId: 'SOCIAL' | 'FINANCE' | 'TREASURY_FX';
    readonly expectedHead: {
      readonly worldVersion: string;
      readonly eventSequence: string;
    };
  },
) {
  const r = await tx.query<Record<string, unknown>>(
    'select * from world_v2.read_postwar_captain_history_originals($1,$2,$3,$4,$5,$6)',
    [
      input.worldId,
      input.hostCountryId,
      input.officeId,
      input.seedFingerprint,
      input.admissionRef,
      input.expectedHead.worldVersion,
    ],
  );
  const row = r.rows[0];
  if (
    r.rows.length !== 1 ||
    !row ||
    row.world_version !== input.expectedHead.worldVersion ||
    row.event_sequence !== input.expectedHead.eventSequence ||
    row.seed_fingerprint !== input.seedFingerprint ||
    row.admission_ref !== input.admissionRef
  )
    invalid('ACTUAL_CURRENT_HEAD_ADMISSION_REQUIRED');
  return {
    captainCountries: decodePostwarCaptainHistoryPackets(
      row.captain_packets,
      input,
    ).captainCountries,
    status: row.host_original_status,
  };
}

export type PostwarCaptainOriginalStatus =
  'NO_REGISTERED_CAPTAIN_ORIGINAL' | 'PRESENT' | 'REVOKED';
export async function readPostwarCaptainHistoryOriginalsFrom(
  tx: SqlExecutor,
  input: Parameters<typeof readOriginalsFrom>[1],
) {
  return (await readOriginalsFrom(tx, input)).captainCountries;
}
export async function readPostwarCaptainCurrentOriginalsFrom(
  tx: SqlExecutor,
  input: Parameters<typeof readOriginalsFrom>[1],
): Promise<
  Readonly<{
    captainCountries: Awaited<
      ReturnType<typeof readPostwarCaptainHistoryOriginalsFrom>
    >;
    status: PostwarCaptainOriginalStatus;
  }>
> {
  const r = await readOriginalsFrom(tx, input);
  if (
    !['NO_REGISTERED_CAPTAIN_ORIGINAL', 'PRESENT', 'REVOKED'].includes(
      String(r.status),
    )
  )
    invalid('ACTUAL_CUSTODY_PRESENCE_REQUIRED');
  const host = r.captainCountries.some(
    (c) => c.countryId === input.hostCountryId,
  );
  if ((r.status === 'NO_REGISTERED_CAPTAIN_ORIGINAL') === host)
    invalid('CUSTODY_PRESENCE_DIFFERS_FROM_REGISTERED_ROWS');
  return Object.freeze({
    captainCountries: r.captainCountries,
    status: r.status as PostwarCaptainOriginalStatus,
  });
}
