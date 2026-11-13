/** Immutable DATA reconstruction for historical water grants. This does not
 * admit a source, create a right or declare current protected claims complete. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  canonicalHashInput,
  canonicalSha256,
  bindAuthoritativeTransition,
  createFinalCommandReceipt,
} from '@econmind/core';
import { parseIndustryUtilityIntent } from '@econmind/core/industry-utility-execution';
import type { IndustryFirstDayWaterReplayOriginal } from '@econmind/core/industry-first-day-water-execution';
import type { FinanceNativeBudgetCanonicalFrame } from '@econmind/core/finance-budget-native';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const hash = (value: unknown) =>
  canonicalSha256(canonicalHashInput(value), sha);
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
function fail(reason: string): never {
  throw Error('POSTWAR_WATER_HISTORY:' + reason);
}

/** Retain each GRANT's exact source snapshot before adding the committed-right
 * and service pins. Core still rederives the full frame; a page is not authority.
 * The private replay continuation retains these originals across page borders. */
export function reconstructPostwarIndustryWaterGrantOriginals(
  original: Readonly<IndustryFirstDayWaterReplayOriginal>,
  frames: readonly FinanceNativeBudgetCanonicalFrame[],
): Readonly<IndustryFirstDayWaterReplayOriginal> {
  const pins = new Map(
      original.source.originals.map((pin) => [
        pin.kind + '\n' + pin.reference,
        pin,
      ]),
    ),
    snapshots = new Map(
      (original.commandSources ?? []).map((item) => [
        item.commandFingerprint,
        item,
      ]),
    );
  let found = false;
  const appendPin = (pin: (typeof original.source.originals)[number]) => {
    const key = pin.kind + '\n' + pin.reference,
      previous = pins.get(key);
    if (previous && !same(previous, pin)) fail('IMMUTABLE_ORIGINAL_CHANGED');
    pins.set(key, Object.freeze(pin));
  };
  for (const frame of frames) {
    const command = frame.command;
    if (
      command.commandType !== 'INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1' ||
      command.worldId !== original.source.worldId ||
      command.countryId !== original.source.countryId
    )
      continue;
    const intent = parseIndustryUtilityIntent(command, sha);
    if (
      intent.facilityId !== original.source.facilityId ||
      intent.runId !== original.source.runId
    )
      continue;
    if (
      intent.sourceRef !== original.source.sourceRef ||
      intent.sourceRawSha256 !== original.source.sourceRawSha256
    )
      fail('EXACT_HISTORICAL_SOURCE_REQUIRED');
    if (intent.operation.action !== 'GRANT_RIGHT') continue;
    bindAuthoritativeTransition({ command, transition: frame.transition }, sha);
    if (
      frame.events.length !== 1 ||
      !same(frame.events, frame.transition.events) ||
      frame.financialPostingBatches.length ||
      frame.inventoryPostings.length ||
      !same(
        frame.receipt,
        createFinalCommandReceipt({
          command,
          transition: frame.transition,
          outcome: 'COMMITTED',
          reasonCode: null,
          simTime: command.simTime,
          recordedAtReal: frame.receipt.recordedAtReal,
        }),
      )
    )
      fail('EXACT_COMMITTED_ZERO_JOURNAL_GRANT_REQUIRED');
    const event = frame.events[0]!,
      payload = JSON.parse(event.canonicalPayload) as Record<string, unknown>,
      source = snapshots.get(command.fingerprint)?.source ?? original.source;
    if (
      event.eventType !== 'INDUSTRY_FIRST_DAY_WATER_EXECUTED_V1' ||
      payload.schemaVersion !== 'industry-first-day-water-execution-v1' ||
      payload.stage !== 'RIGHT_GRANTED' ||
      payload.sourceFingerprint !== hash(source)
    )
      fail('EXACT_IMMUTABLE_GRANT_SOURCE_SNAPSHOT_REQUIRED');
    if (intent.runId === original.source.runId) {
      const snapshot = Object.freeze({
          commandFingerprint: command.fingerprint,
          source,
        }),
        previous = snapshots.get(command.fingerprint);
      if (previous && !same(previous, snapshot))
        fail('IMMUTABLE_COMMAND_SOURCE_CHANGED');
      snapshots.set(command.fingerprint, snapshot);
    }
    appendPin({
      kind: 'WATER_RIGHT_COMMIT',
      reference: event.eventId,
      rawSha256: sha(event.canonicalPayload),
    });
    found = true;
  }
  if (!found) return original;
  if (original.serviceWorkSourceRef && original.serviceWorkSourceRawSha256)
    appendPin({
      kind: 'WATER_SERVICE_WORK_SOURCE',
      reference: original.serviceWorkSourceRef,
      rawSha256: original.serviceWorkSourceRawSha256,
    });
  return Object.freeze({
    ...original,
    source: Object.freeze({
      ...original.source,
      originals: Object.freeze([...pins.values()]),
    }),
    commandSources: Object.freeze([...snapshots.values()]),
  });
}

export const POSTWAR_WATER_COMMAND_EVIDENCE_QUERY =
  'select * from world_v2.read_postwar_industry_water_command_evidence($1,$2,$3,$4,$5::bigint,$6::bigint,$7,$8,$9::jsonb)';

/** RPC rows are immutable source DATA, not authority. The caller holds the
 * exact-head source transaction; Core replays each grant, wage and power effect
 * independently. In particular, missing rows/null are never an empty claim set. */
export async function readPostwarIndustryWaterCommandOriginalFrom(
  tx: import('./sql-database.js').SqlExecutor,
  input: Readonly<{
    original: Readonly<IndustryFirstDayWaterReplayOriginal>;
    command: import('@econmind/core').CanonicalCommand;
    beforeHead: { worldVersion: string; eventSequence: string };
    expectedSourceFingerprint?: string;
  }>,
): Promise<Readonly<IndustryFirstDayWaterReplayOriginal>> {
  const { original, command, beforeHead } = input,
    intent = parseIndustryUtilityIntent(command, sha),
    operation = intent.operation;
  if (
    intent.serviceKind !== 'WATER' ||
    operation.action !== 'DELIVER' ||
    command.worldId !== original.source.worldId ||
    command.countryId !== original.source.countryId ||
    intent.facilityId !== original.source.facilityId ||
    intent.runId !== original.source.runId ||
    intent.sourceRef !== original.source.sourceRef ||
    intent.sourceRawSha256 !== original.source.sourceRawSha256 ||
    command.expectedWorldVersion !== beforeHead.worldVersion ||
    !/^(0|[1-9][0-9]*)$/u.test(beforeHead.eventSequence) ||
    !/^sha256:[a-f0-9]{64}$/u.test(String(operation.workEventFingerprint)) ||
    !Array.isArray(operation.powerEventFingerprints) ||
    !operation.powerEventFingerprints.length ||
    operation.powerEventFingerprints.length > 64 ||
    !operation.powerEventFingerprints.every(
      (v) => typeof v === 'string' && /^sha256:[a-f0-9]{64}$/u.test(v),
    ) ||
    new Set(operation.powerEventFingerprints).size !==
      operation.powerEventFingerprints.length
  )
    fail('EXACT_DELIVERY_COMMAND_AND_BEFORE_HEAD_REQUIRED');
  const result = await tx.query<Record<string, unknown>>(
    POSTWAR_WATER_COMMAND_EVIDENCE_QUERY,
    [
      command.worldId,
      command.countryId,
      intent.facilityId,
      intent.runId,
      beforeHead.worldVersion,
      beforeHead.eventSequence,
      command.simTime.toCanonicalValue(),
      operation.workEventFingerprint,
      canonicalSerialize(operation.powerEventFingerprints),
    ],
  );
  if (result.rows.length !== 1)
    fail('COMPLETE_CURRENT_WATER_EVIDENCE_ROW_REQUIRED');
  const row = result.rows[0]!;
  const record = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      fail('EXACT_WATER_EVIDENCE_RECORD_REQUIRED');
    return value as Record<string, unknown>;
  };
  const pin = (value: unknown, kind: string) => {
    const p = record(value);
    if (
      Object.keys(p).sort().join('|') !== 'kind|rawSha256|reference' ||
      p.kind !== kind ||
      typeof p.reference !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_.:-]{0,255}$/u.test(p.reference) ||
      typeof p.rawSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(p.rawSha256)
    )
      fail('EXACT_WATER_ORIGIN_PIN_REQUIRED');
    return Object.freeze({
      kind,
      reference: p.reference,
      rawSha256: p.rawSha256,
    });
  };
  const grant = pin(row.grant_pin, 'WATER_RIGHT_COMMIT'),
    work = record(row.work_source);
  if (
    !same(work, {
      facilityId: original.serviceFacilityId,
      runId: original.serviceRunId,
      sourceRef: original.serviceWorkSourceRef,
      sourceRawSha256: original.serviceWorkSourceRawSha256,
    })
  )
    fail('EXACT_CURRENT_WATER_SERVICE_WORK_ORIGINAL_REQUIRED');
  if (
    typeof row.from_ticks !== 'string' ||
    !/^(0|[1-9][0-9]*)$/u.test(row.from_ticks) ||
    BigInt(row.from_ticks) >= command.simTime.ticks ||
    command.simTime.ticks > 86400000n
  )
    fail('EXACT_CURRENT_WATER_INTERVAL_REQUIRED');
  if (
    !Array.isArray(row.power_pins) ||
    row.power_pins.length !== operation.powerEventFingerprints.length
  )
    fail('COMPLETE_CURRENT_POWER_ORIGINS_REQUIRED');
  const powers = row.power_pins.map((p) => pin(p, 'POWER_DELIVERY'));
  if (new Set(powers.map((p) => p.reference)).size !== powers.length)
    fail('DISTINCT_CURRENT_POWER_ORIGINS_REQUIRED');
  if (
    !Array.isArray(row.protected_claims) ||
    row.protected_claims.length > 512 ||
    canonicalSerialize(row.protected_claims).length > 65536
  )
    fail('COMPLETE_BOUNDED_CURRENT_PROTECTED_CLAIMS_REQUIRED');
  // The SQL set may contain the same effective claim in overlapping committed
  // intervals. Match Core's exact maximum-per-ref union; never sum duplicates.
  const byRef = new Map<
    string,
    {
      claimRef: string;
      sourceRegionId: string;
      rawReserved: { numerator: string; denominator: string; unit: 'm3' };
    }
  >();
  for (const value of row.protected_claims) {
    const c = record(value),
      volume = record(c.rawReserved);
    if (
      Object.keys(c).sort().join('|') !==
        'claimRef|rawReserved|sourceRegionId' ||
      Object.keys(volume).sort().join('|') !== 'denominator|numerator|unit' ||
      typeof c.claimRef !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_.:-]{0,255}$/u.test(c.claimRef) ||
      typeof c.sourceRegionId !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_.:-]{0,255}$/u.test(c.sourceRegionId) ||
      volume.unit !== 'm3' ||
      typeof volume.numerator !== 'string' ||
      !/^(0|[1-9][0-9]*)$/u.test(volume.numerator) ||
      typeof volume.denominator !== 'string' ||
      !/^[1-9][0-9]*$/u.test(volume.denominator)
    )
      fail('EXACT_CURRENT_PROTECTED_CLAIM_REQUIRED');
    const next = {
        claimRef: c.claimRef,
        sourceRegionId: c.sourceRegionId,
        rawReserved: {
          numerator: volume.numerator,
          denominator: volume.denominator,
          unit: 'm3' as const,
        },
      },
      previous = byRef.get(next.claimRef);
    if (previous && previous.sourceRegionId !== next.sourceRegionId)
      fail('IMMUTABLE_PROTECTED_CLAIM_REGION_REQUIRED');
    if (
      !previous ||
      BigInt(next.rawReserved.numerator) *
        BigInt(previous.rawReserved.denominator) >
        BigInt(previous.rawReserved.numerator) *
          BigInt(next.rawReserved.denominator)
    )
      byRef.set(next.claimRef, next);
  }
  const claims = [...byRef.values()].sort((a, b) =>
    a.claimRef < b.claimRef ? -1 : a.claimRef > b.claimRef ? 1 : 0,
  );
  if (!same(operation.additionalProtectedClaims, claims))
    fail('COMMAND_MUST_MATCH_ACTUAL_CURRENT_PROTECTED_CLAIMS');
  const protectedSha = sha(
    canonicalSerialize({
      worldId: original.source.worldId,
      seedFingerprint: original.source.seedFingerprint,
      head: beforeHead,
      fromTicks: row.from_ticks,
      untilTicks: command.simTime.toCanonicalValue(),
      claims,
    }),
  );
  const additions = [
    grant,
    {
      kind: 'WATER_SERVICE_WORK_SOURCE',
      reference: original.serviceWorkSourceRef!,
      rawSha256: original.serviceWorkSourceRawSha256!,
    },
    ...powers,
    {
      kind: 'WATER_CURRENT_PROTECTED_SET',
      reference: 'WATER_PROTECTED_' + protectedSha.toUpperCase(),
      rawSha256: protectedSha,
    },
  ];
  const pins = new Map(
    original.source.originals.map((p) => [p.kind + '\n' + p.reference, p]),
  );
  for (const p of additions) {
    const key = p.kind + '\n' + p.reference,
      previous = pins.get(key);
    if (previous && !same(previous, p)) fail('IMMUTABLE_ORIGINAL_CHANGED');
    pins.set(key, Object.freeze(p));
  }
  if (pins.size > 64) fail('BOUNDED_WATER_SOURCE_ORIGINALS_REQUIRED');
  const source = Object.freeze({
    ...original.source,
    originals: Object.freeze([...pins.values()]),
  });
  if (
    input.expectedSourceFingerprint !== undefined &&
    input.expectedSourceFingerprint !== hash(source)
  )
    fail('HISTORICAL_DELIVERY_SOURCE_FINGERPRINT_CHANGED');
  const snapshots = new Map(
    (original.commandSources ?? []).map((s) => [s.commandFingerprint, s]),
  );
  const snapshot = Object.freeze({
    commandFingerprint: command.fingerprint,
    source,
  });
  const previous = snapshots.get(command.fingerprint);
  if (previous && !same(previous, snapshot))
    fail('IMMUTABLE_COMMAND_SOURCE_CHANGED');
  snapshots.set(command.fingerprint, snapshot);
  return Object.freeze({
    ...original,
    source,
    commandSources: Object.freeze([...snapshots.values()]),
  });
}
