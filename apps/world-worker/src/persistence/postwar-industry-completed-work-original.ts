/** Fixed committed WORK original DATA, not a work/admission/actor issuer. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  DomainError,
  DOMAIN_ERROR_CODES,
} from '@econmind/core';
import type { IndustryCompletedWorkData } from '@econmind/core/industry-first-day-work';
import {
  consumePreparedPostwarSocialFinancialReplayBase,
  type PreparedPostwarSocialFinancialReplayBase,
} from './prepared-postwar-social-source.js';
import { type PostwarIndustryFirstDaySourceData } from './postwar-industry-first-day-source.js';
import { decodePostwarIndustryRunSourceRow } from './postwar-industry-run-originals.js';
import type { SqlExecutor } from './sql-database.js';
export const INDUSTRY_COMPLETED_WORK_ORIGINAL_QUERY =
  'select * from world_v2.read_postwar_industry_completed_work_original($1,$2,$3,$4,$5,$6,$7::bigint,$8::bigint,$9,$10)';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(s: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'INDUSTRY_COMPLETED_WORK_ORIGINAL:' + s,
  );
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('EXACT_BODY_REQUIRED');
  return v as Record<string, unknown>;
}
function string(v: unknown): string {
  if (typeof v !== 'string' || !v || v.trim() !== v || v.length > 65536)
    invalid('EXACT_TEXT_REQUIRED');
  return v;
}
function integer(v: unknown) {
  if (!/^(0|[1-9]\d*)$/u.test(string(v))) invalid('EXACT_INTEGER_REQUIRED');
}
/** Closed inert DTO decoder, never restores the Core WORK token. */
export function decodeIndustryCompletedWorkOriginalBody(
  raw: string,
): Readonly<IndustryCompletedWorkData> {
  if (Buffer.byteLength(raw) > 65536) invalid('BOUNDED_WORK_BODY_REQUIRED');
  const d = record(JSON.parse(raw) as unknown);
  if (
    canonicalSerialize(d) !== raw ||
    d.schemaVersion !== 'postwar-industry-completed-work-v1'
  )
    invalid('CANONICAL_WORK_BODY_REQUIRED');
  for (const k of [
    'worldId',
    'countryId',
    'locationId',
    'facilityId',
    'operatorId',
    'runId',
    'seedId',
    'seedFingerprint',
    'admissionRef',
  ])
    string(d[k]);
  integer(d.completedAtSimTime);
  const schedule = record(d.schedule),
    policy = record(d.policy);
  for (const k of [
    'commandId',
    'commandFingerprint',
    'eventId',
    'eventFingerprint',
  ])
    string(schedule[k]);
  for (const k of [
    'version',
    'rawSha256',
    'userAdoptionRawSha256',
    'sourceRef',
    'sourceRawSha256',
  ])
    string(policy[k]);
  if (
    !Array.isArray(d.allocations) ||
    !d.allocations.length ||
    d.allocations.length > 64
  )
    invalid('ACTUAL_BOUNDED_ALLOCATIONS_REQUIRED');
  for (const raw of d.allocations) {
    const a = record(raw);
    for (const k of ['positionId', 'poolId', 'cohortRef', 'regionId'])
      string(a[k]);
    for (const k of [
      'sourceStartOrdinal',
      'startOrdinal',
      'count',
      'startsAtSimTime',
      'endsAtSimTime',
      'personMilliseconds',
    ])
      integer(a[k]);
    if (
      !['LOW', 'MEDIUM', 'HIGH'].includes(string(a.skill)) ||
      a.populationLineage !== 'POSTWAR_REGIONAL_POPULATION_ORDINAL_V1'
    )
      invalid('EXACT_COORDINATE_AND_SKILL_REQUIRED');
    const minutes = record(a.personMinutes);
    if (
      minutes.numerator !== a.personMilliseconds ||
      minutes.denominator !== '60000'
    )
      invalid('EXACT_PERSON_TIME_REQUIRED');
  }
  // Structural DATA conversion only. Actual Core token/state is independently
  // issued by full ordered RUN/WORK replay in the current or historical fold.
  return d as unknown as Readonly<IndustryCompletedWorkData>;
}
export interface IndustryCompletedWorkOriginalData {
  readonly classification: 'COMMITTED_WORK_ORIGINAL_DATA_NOT_AUTHORITY';
  readonly body: Readonly<IndustryCompletedWorkData>;
  readonly firstdayOriginal: Readonly<PostwarIndustryFirstDaySourceData>;
  readonly maximumExpense: Readonly<{ amount: string; currency: string }>;
  readonly commandId: string;
  readonly commandFingerprint: string;
  readonly eventId: string;
  readonly eventFingerprint: string;
  readonly worldVersion: string;
  readonly eventSequence: string;
}
export async function readPostwarIndustryCompletedWorkOriginalFrom(
  tx: SqlExecutor,
  input: {
    baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>;
    worldId: string;
    hostCountryId: string;
    officeId: 'SOCIAL' | 'FINANCE';
    sourceCountryId: string;
    workEventId: string;
    workEventFingerprint: string;
    expectedHead: Readonly<{ worldVersion: string; eventSequence: string }>;
  },
): Promise<Readonly<IndustryCompletedWorkOriginalData>> {
  const b = consumePreparedPostwarSocialFinancialReplayBase(input.baseline);
  if (b.pins.worldId !== input.worldId)
    invalid('GENUINE_SAME_WORLD_BASE_REQUIRED');
  const r = await tx.query<Record<string, unknown>>(
    INDUSTRY_COMPLETED_WORK_ORIGINAL_QUERY,
    [
      input.worldId,
      input.hostCountryId,
      input.officeId,
      input.sourceCountryId,
      input.workEventId,
      input.workEventFingerprint,
      input.expectedHead.worldVersion,
      input.expectedHead.eventSequence,
      b.pins.contentHash,
      b.pins.admissionRef,
    ],
  );
  if (r.rows.length !== 1 || !r.rows[0])
    invalid('ACTUAL_COMMITTED_WORK_MISSING');
  const row = r.rows[0],
    raw = string(row.work_body_text),
    body = decodeIndustryCompletedWorkOriginalBody(raw);
  if (
    row.work_body_sha256 !== 'sha256:' + sha('SHA-256\n' + raw) ||
    row.work_event_id !== input.workEventId ||
    row.work_event_fingerprint !== input.workEventFingerprint ||
    row.world_version !== input.expectedHead.worldVersion ||
    row.event_sequence !== input.expectedHead.eventSequence ||
    body.worldId !== input.worldId ||
    body.countryId !== input.sourceCountryId ||
    body.seedId !== b.pins.seedRef ||
    body.seedFingerprint !== b.pins.contentHash ||
    body.admissionRef !== b.pins.admissionRef
  )
    invalid('ACTUAL_WORK_HEAD_HASH_OR_ADMISSION_DIFFERS');
  const firstdayOriginal = decodePostwarIndustryRunSourceRow(
    {
      source_text: string(row.source_text),
      source_sha256: string(row.source_sha256),
      source_ref: string(row.source_ref),
      world_version: string(row.world_version),
      event_sequence: string(row.event_sequence),
    },
    {
      baseline: input.baseline,
      worldId: input.worldId,
      countryId: input.sourceCountryId,
      facilityId: body.facilityId,
      head: input.expectedHead,
      expectedPins: {
        seedId: b.pins.seedRef,
        seedFingerprint: b.pins.contentHash,
        admissionRef: b.pins.admissionRef,
      },
    },
  );
  return Object.freeze({
    classification: 'COMMITTED_WORK_ORIGINAL_DATA_NOT_AUTHORITY',
    body,
    maximumExpense: Object.freeze({
      amount: string(row.run_maximum_expense_amount),
      currency: string(row.run_maximum_expense_currency),
    }),
    firstdayOriginal,
    commandId: string(row.work_command_id),
    commandFingerprint: string(row.work_command_fingerprint),
    eventId: input.workEventId,
    eventFingerprint: input.workEventFingerprint,
    worldVersion: string(row.work_world_version),
    eventSequence: string(row.work_event_sequence),
  });
}
