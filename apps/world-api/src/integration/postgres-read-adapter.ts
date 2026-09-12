import {
  createWorldReadRequest,
  parseWorldProjectionDto,
  WORLD_READ_API_SCHEMA_VERSION,
  type ProjectionClassification,
  type WorldProjectionDto,
  type WorldReadRequestEnvelope,
} from './contracts.js';
import type { ReadProjectionRow } from './generated/world-v2-read-model.js';
import {
  parseSupabaseAuthSubject,
  type SupabaseAuthSubject,
} from './identity.js';
import { WorldReadFailure } from './transport.js';

export type EntitledProjectionClassification = Extract<
  ProjectionClassification,
  'COUNTRY' | 'OFFICE_PRIVATE'
>;

export interface ParameterizedPgReadRequest {
  readonly text: string;
  readonly values: readonly string[];
  readonly signal?: AbortSignal;
}

export interface ParameterizedPgReadResult {
  readonly rows: readonly unknown[];
}

/**
 * Injected, already-managed PostgreSQL query surface. Implementations own pool,
 * transaction, role and cancellation wiring; this adapter never connects.
 */
export interface ParameterizedPgReadExecutor {
  query(
    request: ParameterizedPgReadRequest,
  ): Promise<ParameterizedPgReadResult>;
}

export interface MinimumProjectionWatermark {
  readonly worldVersion: string;
  readonly eventSequence: string;
}

export const WORLD_V2_ENTITLED_PROJECTION_QUERY = `
select
  projection.world_id,
  projection.classification,
  projection.scope_key,
  projection.schema_version,
  projection.world_version::text as world_version,
  projection.event_sequence::text as event_sequence,
  projection.payload,
  projection.generated_at::text as generated_at
from world_v2.read_projection as projection
inner join world_v2.projection_entitlement as entitlement
  on entitlement.world_id = projection.world_id
  and entitlement.classification = projection.classification
  and entitlement.scope_key = projection.scope_key
where entitlement.auth_subject = $1::uuid
  and entitlement.active
  and entitlement.revoked_at is null
  and projection.world_id = $2
  and projection.classification = $3
  and projection.scope_key = $4
  and (
    projection.world_version > $5::bigint
    or (
      projection.world_version = $5::bigint
      and projection.event_sequence >= $6::bigint
    )
  )
limit 2
`.trim();

const NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const EXPECTED_ROW_KEYS = Object.freeze([
  'classification',
  'event_sequence',
  'generated_at',
  'payload',
  'schema_version',
  'scope_key',
  'world_id',
  'world_version',
]);

function protocol(message: string): never {
  throw new WorldReadFailure('PROTOCOL_ERROR', message, false);
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function postgresInteger(value: unknown, label: string): string {
  if (typeof value !== 'string' || !NON_NEGATIVE_INTEGER.test(value)) {
    protocol(`${label} must be a canonical non-negative integer`);
  }
  if (BigInt(value) > POSTGRES_BIGINT_MAX) {
    protocol(`${label} exceeds PostgreSQL bigint`);
  }
  return value;
}

function timestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string') protocol('generated_at must be a timestamp');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    protocol('generated_at must be a valid timestamp');
  }
  return parsed.toISOString();
}

function record(value: unknown): ReadProjectionRow {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    protocol('PostgreSQL projection row must be an object');
  }
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row).sort();
  if (
    keys.length !== EXPECTED_ROW_KEYS.length ||
    keys.some((key, index) => key !== EXPECTED_ROW_KEYS[index])
  ) {
    protocol('PostgreSQL projection row shape is invalid');
  }
  return row as unknown as ReadProjectionRow;
}

function resultRows(value: unknown): readonly unknown[] {
  if (
    value === null ||
    typeof value !== 'object' ||
    !Array.isArray((value as { readonly rows?: unknown }).rows)
  ) {
    protocol('PostgreSQL query result rows are invalid');
  }
  return (value as { readonly rows: readonly unknown[] }).rows;
}

function validateRequest(
  request: WorldReadRequestEnvelope,
): WorldReadRequestEnvelope & {
  readonly payload: {
    readonly classification: EntitledProjectionClassification;
  };
} {
  if (
    request.schemaVersion !== WORLD_READ_API_SCHEMA_VERSION ||
    request.operation !== 'READ_WORLD_PROJECTION'
  ) {
    protocol('World read request envelope is unsupported');
  }

  let validated: WorldReadRequestEnvelope;
  try {
    validated = createWorldReadRequest({
      requestId: request.requestId,
      worldId: request.payload.worldId,
      classification: request.payload.classification,
      scopeKey: request.payload.scopeKey,
    });
  } catch {
    protocol('World read request envelope is invalid');
  }

  if (
    validated.payload.classification !== 'COUNTRY' &&
    validated.payload.classification !== 'OFFICE_PRIVATE'
  ) {
    protocol('Only COUNTRY and OFFICE_PRIVATE projections are supported');
  }
  return validated as WorldReadRequestEnvelope & {
    readonly payload: {
      readonly classification: EntitledProjectionClassification;
    };
  };
}

function mapProjectionRow(
  value: unknown,
  expected: WorldReadRequestEnvelope,
): WorldProjectionDto {
  const row = record(value);
  if (
    row.world_id !== expected.payload.worldId ||
    row.classification !== expected.payload.classification ||
    row.scope_key !== expected.payload.scopeKey
  ) {
    protocol('PostgreSQL projection row does not match the request scope');
  }

  try {
    return parseWorldProjectionDto({
      schemaVersion: row.schema_version,
      worldId: row.world_id,
      classification: row.classification,
      scopeKey: row.scope_key,
      watermark: {
        worldVersion: postgresInteger(row.world_version, 'world_version'),
        eventSequence: postgresInteger(row.event_sequence, 'event_sequence'),
        generatedAt: timestamp(row.generated_at),
      },
      payload: row.payload,
      receipts: [],
      events: [],
    });
  } catch (error) {
    if (error instanceof WorldReadFailure) throw error;
    protocol('PostgreSQL projection row failed DTO validation');
  }
}

export async function readEntitledWorldProjection(input: {
  readonly executor: ParameterizedPgReadExecutor;
  readonly authSubject: SupabaseAuthSubject;
  readonly request: WorldReadRequestEnvelope;
  readonly minimumWatermark?: MinimumProjectionWatermark;
  readonly signal?: AbortSignal;
}): Promise<WorldProjectionDto | null> {
  const request = validateRequest(input.request);
  let authSubject: SupabaseAuthSubject;
  try {
    authSubject = parseSupabaseAuthSubject(input.authSubject);
  } catch {
    protocol('Supabase auth subject is invalid');
  }
  const minimum = input.minimumWatermark ?? {
    worldVersion: '0',
    eventSequence: '0',
  };
  const worldVersion = postgresInteger(
    minimum.worldVersion,
    'minimum worldVersion',
  );
  const eventSequence = postgresInteger(
    minimum.eventSequence,
    'minimum eventSequence',
  );

  if (isAborted(input.signal)) {
    throw new WorldReadFailure('CANCELLED', 'World read cancelled', false);
  }

  const queryRequest: ParameterizedPgReadRequest = {
    text: WORLD_V2_ENTITLED_PROJECTION_QUERY,
    values: Object.freeze([
      authSubject,
      request.payload.worldId,
      request.payload.classification,
      request.payload.scopeKey,
      worldVersion,
      eventSequence,
    ]),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  };

  let result: ParameterizedPgReadResult;
  try {
    result = await input.executor.query(queryRequest);
  } catch {
    if (isAborted(input.signal)) {
      throw new WorldReadFailure('CANCELLED', 'World read cancelled', false);
    }
    throw new WorldReadFailure(
      'UPSTREAM_UNAVAILABLE',
      'World read database unavailable',
      true,
    );
  }

  const rows = resultRows(result);
  if (rows.length === 0) return null;
  if (rows.length !== 1) {
    protocol('PostgreSQL query returned duplicate projection rows');
  }
  return mapProjectionRow(rows[0], request);
}
