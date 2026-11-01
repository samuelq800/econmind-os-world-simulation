/** Fixed adopted policy -> registered source publication. These immutable rule
 * originals establish no work, maintenance, payment, delivery or output. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SqlExecutor } from './sql-database.js';
import type { PostwarPhysicalSourceContext } from '../preparation/postwar-physical-service-receipt.js';
import { isVerifiedOfficialOpeningDecisionSource } from '../preparation/official-opening-decision-reconciliation.js';
export const INDUSTRY_FIRST_DAY_SOURCE_POLICY_SHA256 =
  '99ede2cbf1bb7b04d3fe5d99cf101c47ed055b2e12b8ca9080cfc2a43b3d086c';
export const INDUSTRY_FIRST_DAY_SOURCE_ADOPTION_SHA256 =
  '8d5fb70a2b2250201d623aa7898a95d48540083d6fa316a1b8e920abca0fd9d6';
export const INDUSTRY_FIRST_DAY_PUBLISH_QUERY =
  'select * from world_v2.publish_postwar_industry_first_day_source($1,$2,$3,$4,$5,$6,$7)';
export const INDUSTRY_FIRST_DAY_READ_QUERY =
  'select * from world_v2.read_postwar_industry_first_day_source($1,$2,$3,$4::bigint,$5::bigint)';
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const POLICIES = new WeakMap<
  object,
  Readonly<{ policy: string; adoption: string }>
>();
declare const policy: unique symbol;
export interface PostwarIndustryFirstDayAdoptedPolicy {
  readonly [policy]: true;
}
export async function loadPostwarIndustryFirstDayAdoptedPolicy(
  repositoryRoot: string,
): Promise<Readonly<PostwarIndustryFirstDayAdoptedPolicy>> {
  if (!path.isAbsolute(repositoryRoot))
    throw Error('INDUSTRY_FIRST_DAY_FIXED_REPOSITORY_ROOT_REQUIRED');
  const [policy, adoption] = await Promise.all([
    readFile(
      path.join(
        repositoryRoot,
        'config/postwar-genesis/industry-first-day.v1.json',
      ),
      'utf8',
    ),
    readFile(
      path.join(
        repositoryRoot,
        'docs/governance/owner-inputs/2026-11-01/INDUSTRY_FIRST_DAY_USER_ADOPTION.original.json',
      ),
      'utf8',
    ),
  ]);
  if (
    sha(policy) !== INDUSTRY_FIRST_DAY_SOURCE_POLICY_SHA256 ||
    sha(adoption) !== INDUSTRY_FIRST_DAY_SOURCE_ADOPTION_SHA256
  )
    throw Error('INDUSTRY_FIRST_DAY_EXACT_ADOPTED_BYTES_REQUIRED');
  const token = Object.freeze({}) as PostwarIndustryFirstDayAdoptedPolicy;
  POLICIES.set(token, Object.freeze({ policy, adoption }));
  return token;
}
export function isPostwarIndustryFirstDayAdoptedPolicy(
  value: unknown,
): value is Readonly<PostwarIndustryFirstDayAdoptedPolicy> {
  return !!value && typeof value === 'object' && POLICIES.has(value);
}
export async function publishPostwarIndustryFirstDaySourceFrom(
  tx: SqlExecutor,
  input: Readonly<{
    worldId: string;
    countryId: 'COUNTRY_02';
    facilityId: 'OPEN-02-REFINED_FUEL';
    adoptedPolicy: Readonly<PostwarIndustryFirstDayAdoptedPolicy>;
    sourceContext: PostwarPhysicalSourceContext;
  }>,
): Promise<Readonly<{ sourceRef: string; sourceSha256: string }>> {
  const bytes = POLICIES.get(input.adoptedPolicy);
  if (
    !bytes ||
    !isVerifiedOfficialOpeningDecisionSource(input.sourceContext?.source)
  )
    throw Error(
      'INDUSTRY_FIRST_DAY_GENUINE_POLICY_AND_PINNED_CONTEXT_REQUIRED',
    );
  const domestic =
    input.sourceContext.sourceBytes.datasets['data/domestic-access.json'];
  if (typeof domestic !== 'string')
    throw Error('INDUSTRY_FIRST_DAY_PINNED_DOMESTIC_SOURCE_REQUIRED');
  const result = await tx.query<{ source_ref: string; source_sha256: string }>(
    INDUSTRY_FIRST_DAY_PUBLISH_QUERY,
    [
      input.worldId,
      input.countryId,
      input.facilityId,
      bytes.policy,
      bytes.adoption,
      input.sourceContext.sourceBytes.checksumsBytes,
      domestic,
    ],
  );
  const r = result.rows[0];
  if (
    result.rows.length !== 1 ||
    !r ||
    !/^INDUSTRY_FIRST_DAY_[A-F0-9]{64}$/u.test(r.source_ref) ||
    !/^[a-f0-9]{64}$/u.test(r.source_sha256)
  )
    throw Error('INDUSTRY_FIRST_DAY_EXACT_PUBLISHED_SOURCE_REQUIRED');
  return Object.freeze({
    sourceRef: r.source_ref,
    sourceSha256: r.source_sha256,
  });
}
export interface PostwarIndustryFirstDaySourceData {
  readonly classification: 'ADOPTED_OPENING_RULE_SOURCE_NOT_EXECUTION_OR_COMMIT_AUTHORITY';
  readonly rawText: string;
  readonly rawSha256: string;
  readonly sourceRef: string;
  readonly head: Readonly<{ worldVersion: string; eventSequence: string }>;
  readonly data: Readonly<Record<string, unknown>>;
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw Error('INDUSTRY_FIRST_DAY_EXACT_SOURCE_RECORD_REQUIRED');
  return v as Record<string, unknown>;
}
/** Exact bytes remain available for hashes; number lexemes become decimal text
 * before any quantity/cost computation. Metadata H is already SQL text. */
function lossless(raw: string): unknown {
  const parse = JSON.parse as (
    text: string,
    reviver: (
      key: string,
      value: unknown,
      context: { source?: string },
    ) => unknown,
  ) => unknown;
  return parse(raw, (_k, value, context) =>
    typeof value === 'number' ? context.source : value,
  );
}
export async function readPostwarIndustryFirstDaySourceFrom(
  tx: SqlExecutor,
  input: Readonly<{
    worldId: string;
    countryId: string;
    facilityId: string;
    head: Readonly<{ worldVersion: string; eventSequence: string }>;
    expectedPins: Readonly<{
      seedId: string;
      seedFingerprint: string;
      admissionRef: string;
    }>;
  }>,
): Promise<Readonly<PostwarIndustryFirstDaySourceData> | null> {
  const result = await tx.query<{
    source_text: string;
    source_sha256: string;
    source_ref: string;
    world_version: string;
    event_sequence: string;
  }>(INDUSTRY_FIRST_DAY_READ_QUERY, [
    input.worldId,
    input.countryId,
    input.facilityId,
    input.head.worldVersion,
    input.head.eventSequence,
  ]);
  if (result.rows.length === 0) return null;
  if (result.rows.length !== 1)
    throw Error('INDUSTRY_FIRST_DAY_EXACT_CURRENT_SOURCE_BYTES_REQUIRED');
  return decodePostwarIndustryFirstDaySourceRow(result.rows[0]!, input);
}
export function decodePostwarIndustryFirstDaySourceRow(
  r: Readonly<{
    source_text: string;
    source_sha256: string;
    source_ref: string;
    world_version: string;
    event_sequence: string;
  }>,
  input: Readonly<{
    worldId: string;
    countryId: string;
    facilityId: string;
    head: Readonly<{ worldVersion: string; eventSequence: string }>;
    expectedPins: Readonly<{
      seedId: string;
      seedFingerprint: string;
      admissionRef: string;
    }>;
  }>,
): Readonly<PostwarIndustryFirstDaySourceData> {
  if (
    !r ||
    typeof r.source_text !== 'string' ||
    Buffer.byteLength(r.source_text) > 65536 ||
    sha(r.source_text) !== r.source_sha256 ||
    r.source_ref !== 'INDUSTRY_FIRST_DAY_' + r.source_sha256.toUpperCase() ||
    r.world_version !== input.head.worldVersion ||
    r.event_sequence !== input.head.eventSequence
  )
    throw Error('INDUSTRY_FIRST_DAY_EXACT_CURRENT_SOURCE_BYTES_REQUIRED');
  const d = record(lossless(r.source_text));
  if (
    d.schemaVersion !== 'postwar-industry-first-day-source-v1' ||
    d.classification !==
      'ADOPTED_OPENING_RULE_SOURCE_NOT_EXECUTION_OR_COMMIT_AUTHORITY' ||
    d.worldId !== input.worldId ||
    d.countryId !== input.countryId ||
    d.facilityId !== input.facilityId ||
    d.seedId !== input.expectedPins.seedId ||
    d.seedFingerprint !== input.expectedPins.seedFingerprint ||
    d.admissionRef !== input.expectedPins.admissionRef ||
    d.policyVersion !== 'INDUSTRY_FIRST_DAY_20261101_V1' ||
    d.policyRawSha256 !== INDUSTRY_FIRST_DAY_SOURCE_POLICY_SHA256 ||
    d.userAdoptionRawSha256 !== INDUSTRY_FIRST_DAY_SOURCE_ADOPTION_SHA256 ||
    d.originalConditionFraction !== '1' ||
    d.openingWindowStartsAtSimTime !== '0' ||
    d.openingWindowEndsAtSimTime !== '86400000'
  )
    throw Error('INDUSTRY_FIRST_DAY_ACTUAL_SEED_POLICY_SCOPE_DIFFERS');
  const execution = record(d.execution);
  if (
    execution.classification !== 'NOT_ESTABLISHED_BY_POLICY_ADOPTION' ||
    [
      'maintenancePerformed',
      'workMinutesBooked',
      'paymentBatchIds',
      'energyConsumed',
      'waterConsumed',
      'logisticsDelivered',
      'outputProduced',
    ].some((k) => execution[k] !== null)
  )
    throw Error('INDUSTRY_FIRST_DAY_POLICY_CANNOT_ASSERT_EXECUTION');
  return Object.freeze({
    classification:
      'ADOPTED_OPENING_RULE_SOURCE_NOT_EXECUTION_OR_COMMIT_AUTHORITY',
    rawText: r.source_text,
    rawSha256: r.source_sha256,
    sourceRef: r.source_ref,
    head: Object.freeze({ ...input.head }),
    data: deepFreeze(d),
  });
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
