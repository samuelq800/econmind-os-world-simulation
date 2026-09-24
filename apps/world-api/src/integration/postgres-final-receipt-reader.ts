import type {
  DurableCommandOutcome,
  DurableNarrowTransferReceipt,
} from './authenticated-narrow-transfer-command-handler.js';
import {
  parseSupabaseAuthSubject,
  type SupabaseAuthSubject,
} from './identity.js';
import type {
  ParameterizedPgReadExecutor,
  ParameterizedPgReadRequest,
  ParameterizedPgReadResult,
} from './postgres-read-adapter.js';
import {
  MAX_WORLD_READ_RESPONSE_BYTES,
  WorldReadFailure,
} from './transport.js';

export interface FinalReceiptIdentity {
  readonly worldId: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
}

/** Must be resolved from current server authorization, never request JSON. */
export interface ServerCurrentReceiptScope {
  readonly authSubject: SupabaseAuthSubject;
  readonly countryId: string;
  readonly officeId: string;
}

export interface PostgresFinalCommandReceipt extends DurableNarrowTransferReceipt {
  readonly schemaVersion: 'command-receipt-v2';
  readonly transitionId: string | null;
  readonly worldVersionBefore: string | null;
  readonly simTime: string;
}

export const WORLD_V2_FINAL_RECEIPT_QUERY = `
select
  receipt.world_id as receipt_world_id,
  receipt.command_id as receipt_command_id,
  receipt.idempotency_key as receipt_idempotency_key,
  receipt.schema_version as receipt_schema_version,
  receipt.command_fingerprint as receipt_command_fingerprint,
  receipt.outcome,
  receipt.reason_code,
  receipt.transition_id,
  receipt.world_version_before::text as world_version_before,
  receipt.world_version_after::text as world_version_after,
  receipt.sim_time::text as sim_time,
  receipt.event_ids,
  receipt.recorded_at_real as recorded_at_real,
  submission.world_id as submission_world_id,
  submission.command_id as submission_command_id,
  submission.idempotency_key as submission_idempotency_key,
  submission.command_fingerprint as submission_command_fingerprint,
  submission.auth_subject::text as submission_auth_subject,
  submission.country_id as submission_country_id,
  submission.office_id as submission_office_id
from world_v2.command_receipt as receipt
inner join world_v2.command_submission as submission
  on submission.world_id = receipt.world_id
  and submission.command_id = receipt.command_id
  and submission.command_fingerprint = receipt.command_fingerprint
  and submission.idempotency_key = receipt.idempotency_key
where receipt.world_id = $1
  and receipt.command_id = $2
  and receipt.idempotency_key = $3
  and submission.world_id = $1
  and submission.command_id = $2
  and submission.idempotency_key = $3
  and submission.auth_subject = $4::uuid
  and submission.country_id = $5
  and submission.office_id = $6
limit 2
`.trim();

/**
 * Exact final-receipt recovery query for an already authenticated caller.
 * Country and Office are derived from the durable submission, never request
 * JSON. The existence predicate rechecks that the same caller has a current
 * active authorization for that exact durable scope in the same statement.
 */
export const WORLD_V2_AUTHENTICATED_FINAL_RECEIPT_QUERY = `
select
  receipt.world_id as receipt_world_id,
  receipt.command_id as receipt_command_id,
  receipt.idempotency_key as receipt_idempotency_key,
  receipt.schema_version as receipt_schema_version,
  receipt.command_fingerprint as receipt_command_fingerprint,
  receipt.outcome,
  receipt.reason_code,
  receipt.transition_id,
  receipt.world_version_before::text as world_version_before,
  receipt.world_version_after::text as world_version_after,
  receipt.sim_time::text as sim_time,
  receipt.event_ids,
  receipt.recorded_at_real as recorded_at_real,
  submission.world_id as submission_world_id,
  submission.command_id as submission_command_id,
  submission.idempotency_key as submission_idempotency_key,
  submission.command_fingerprint as submission_command_fingerprint,
  submission.auth_subject::text as submission_auth_subject,
  submission.country_id as submission_country_id,
  submission.office_id as submission_office_id
from world_v2.command_receipt as receipt
inner join world_v2.command_submission as submission
  on submission.world_id = receipt.world_id
  and submission.command_id = receipt.command_id
  and submission.command_fingerprint = receipt.command_fingerprint
  and submission.idempotency_key = receipt.idempotency_key
where receipt.world_id = $1
  and receipt.command_id = $2
  and receipt.idempotency_key = $3
  and submission.world_id = $1
  and submission.command_id = $2
  and submission.idempotency_key = $3
  and submission.auth_subject = $4::uuid
  and exists (
    select 1
    from world_v2.current_commit_authorization as current_authorization
    where current_authorization.world_id = submission.world_id
      and current_authorization.auth_subject = submission.auth_subject
      and current_authorization.country_id = submission.country_id
      and current_authorization.office_id = submission.office_id
      and current_authorization.active
  )
limit 2
`.trim();

interface FinalReceiptRow {
  readonly receipt_world_id: unknown;
  readonly receipt_command_id: unknown;
  readonly receipt_idempotency_key: unknown;
  readonly receipt_schema_version: unknown;
  readonly receipt_command_fingerprint: unknown;
  readonly outcome: unknown;
  readonly reason_code: unknown;
  readonly transition_id: unknown;
  readonly world_version_before: unknown;
  readonly world_version_after: unknown;
  readonly sim_time: unknown;
  readonly event_ids: unknown;
  readonly recorded_at_real: unknown;
  readonly submission_world_id: unknown;
  readonly submission_command_id: unknown;
  readonly submission_idempotency_key: unknown;
  readonly submission_command_fingerprint: unknown;
  readonly submission_auth_subject: unknown;
  readonly submission_country_id: unknown;
  readonly submission_office_id: unknown;
}

const EXPECTED_ROW_KEYS = Object.freeze([
  'event_ids',
  'outcome',
  'reason_code',
  'receipt_command_fingerprint',
  'receipt_command_id',
  'receipt_idempotency_key',
  'receipt_schema_version',
  'receipt_world_id',
  'recorded_at_real',
  'sim_time',
  'submission_auth_subject',
  'submission_command_fingerprint',
  'submission_command_id',
  'submission_country_id',
  'submission_idempotency_key',
  'submission_office_id',
  'submission_world_id',
  'transition_id',
  'world_version_after',
  'world_version_before',
]);
const CANONICAL_ID = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;
const NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const POSITIVE_INTEGER = /^[1-9]\d*$/u;
const REASON_CODE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u;
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const OUTCOMES = new Set<DurableCommandOutcome>([
  'COMMITTED',
  'REJECTED',
  'AUTHORIZATION_REVOKED',
]);

function protocol(message: string): never {
  throw new WorldReadFailure('PROTOCOL_ERROR', message, false);
}

function canonicalId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !CANONICAL_ID.test(value)) {
    protocol(`${label} must be a canonical identifier`);
  }
  return value;
}

function fingerprint(value: unknown, label: string): string {
  if (typeof value !== 'string' || !FINGERPRINT.test(value)) {
    protocol(`${label} must be canonical SHA-256`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    protocol(`${label} must be null or a non-empty string`);
  }
  return value;
}

function postgresInteger(
  value: unknown,
  label: string,
  positive = false,
): string {
  if (
    typeof value !== 'string' ||
    !(positive ? POSITIVE_INTEGER : NON_NEGATIVE_INTEGER).test(value) ||
    BigInt(value) > POSTGRES_BIGINT_MAX
  ) {
    protocol(`${label} must be a canonical PostgreSQL bigint`);
  }
  return value;
}

function timestamp(value: unknown): string {
  const rendered = value instanceof Date ? value.toISOString() : value;
  if (typeof rendered !== 'string') {
    protocol('recorded_at_real must be a timestamp');
  }
  const parsed = new Date(rendered);
  if (Number.isNaN(parsed.valueOf())) {
    protocol('recorded_at_real must be a valid timestamp');
  }
  return parsed.toISOString();
}

function receiptRow(value: unknown): FinalReceiptRow {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    protocol('PostgreSQL final receipt row must be an object');
  }
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row).sort();
  if (
    keys.length !== EXPECTED_ROW_KEYS.length ||
    keys.some((key, index) => key !== EXPECTED_ROW_KEYS[index])
  ) {
    protocol('PostgreSQL final receipt row shape is invalid');
  }
  return row as unknown as FinalReceiptRow;
}

function resultRows(value: unknown): readonly unknown[] {
  if (
    value === null ||
    typeof value !== 'object' ||
    !Array.isArray((value as { readonly rows?: unknown }).rows)
  ) {
    protocol('PostgreSQL final receipt query result is invalid');
  }
  return (value as { readonly rows: readonly unknown[] }).rows;
}

function eventIds(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 1_000) {
    protocol('PostgreSQL final receipt Event IDs are invalid');
  }
  const parsed = value.map((identity) =>
    canonicalId(identity, 'receipt Event ID'),
  );
  if (new Set(parsed).size !== parsed.length) {
    protocol('PostgreSQL final receipt Event IDs are not unique');
  }
  return Object.freeze(parsed);
}

function finalOutcome(value: unknown): DurableCommandOutcome {
  if (
    typeof value !== 'string' ||
    !OUTCOMES.has(value as DurableCommandOutcome)
  ) {
    protocol('PostgreSQL final receipt outcome is unsupported');
  }
  return value as DurableCommandOutcome;
}

function mapFinalReceipt(
  value: unknown,
  identity: FinalReceiptIdentity,
  scope: ServerCurrentReceiptScope,
): PostgresFinalCommandReceipt {
  const row = receiptRow(value);
  const receiptFingerprint = fingerprint(
    row.receipt_command_fingerprint,
    'receipt command fingerprint',
  );
  const submissionFingerprint = fingerprint(
    row.submission_command_fingerprint,
    'submission command fingerprint',
  );
  if (
    row.receipt_world_id !== identity.worldId ||
    row.submission_world_id !== identity.worldId ||
    row.receipt_command_id !== identity.commandId ||
    row.submission_command_id !== identity.commandId ||
    row.receipt_idempotency_key !== identity.idempotencyKey ||
    row.submission_idempotency_key !== identity.idempotencyKey ||
    receiptFingerprint !== submissionFingerprint ||
    row.submission_auth_subject !== scope.authSubject ||
    row.submission_country_id !== scope.countryId ||
    row.submission_office_id !== scope.officeId
  ) {
    protocol('PostgreSQL final receipt row does not match identity and scope');
  }
  if (row.receipt_schema_version !== 'command-receipt-v2') {
    protocol('PostgreSQL final receipt schema version is unsupported');
  }

  const outcome = finalOutcome(row.outcome);
  const reasonCode = nullableString(row.reason_code, 'receipt reason code');
  const transitionId =
    row.transition_id === null
      ? null
      : canonicalId(row.transition_id, 'receipt transition ID');
  const worldVersionBefore =
    row.world_version_before === null
      ? null
      : postgresInteger(row.world_version_before, 'world_version_before');
  const worldVersionAfter =
    row.world_version_after === null
      ? null
      : postgresInteger(row.world_version_after, 'world_version_after', true);
  const simTime = postgresInteger(row.sim_time, 'sim_time');
  const receiptEventIds = eventIds(row.event_ids);
  const committed = outcome === 'COMMITTED';
  if (
    (committed &&
      (reasonCode !== null ||
        transitionId !== identity.commandId ||
        worldVersionBefore === null ||
        worldVersionAfter === null ||
        BigInt(worldVersionAfter) !== BigInt(worldVersionBefore) + 1n ||
        receiptEventIds.length === 0)) ||
    (!committed &&
      (reasonCode === null ||
        !REASON_CODE.test(reasonCode) ||
        transitionId !== null ||
        worldVersionBefore !== null ||
        worldVersionAfter !== null ||
        receiptEventIds.length !== 0))
  ) {
    protocol('PostgreSQL final receipt outcome is internally inconsistent');
  }

  const receipt: PostgresFinalCommandReceipt = Object.freeze({
    source: 'DURABLE_FINAL_COMMAND_RECEIPT',
    schemaVersion: 'command-receipt-v2',
    worldId: identity.worldId,
    commandId: identity.commandId,
    idempotencyKey: identity.idempotencyKey,
    commandFingerprint: receiptFingerprint,
    outcome,
    reasonCode,
    transitionId,
    worldVersionBefore,
    worldVersionAfter,
    simTime,
    eventIds: receiptEventIds,
    recordedAtReal: timestamp(row.recorded_at_real),
  });
  if (
    Buffer.byteLength(JSON.stringify(receipt), 'utf8') >
    MAX_WORLD_READ_RESPONSE_BYTES
  ) {
    protocol('PostgreSQL final receipt exceeds the response byte limit');
  }
  return receipt;
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

async function awaitQuery<T>(
  operation: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (signal === undefined) return operation;
  if (signal.aborted) {
    throw new WorldReadFailure(
      'CANCELLED',
      'Final receipt read cancelled',
      false,
    );
  }
  return new Promise<T>((resolve, reject) => {
    const cancel = () =>
      reject(
        new WorldReadFailure(
          'CANCELLED',
          'Final receipt read cancelled',
          false,
        ),
      );
    signal.addEventListener('abort', cancel, { once: true });
    void operation.then(
      (result) => {
        signal.removeEventListener('abort', cancel);
        if (signal.aborted) cancel();
        else resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', cancel);
        if (signal.aborted) cancel();
        else reject(error);
      },
    );
  });
}

/**
 * Reads an immutable final receipt only when its durable submission matches
 * both the requested command identity and the server-current actor scope.
 */
export async function readPostgresFinalCommandReceipt(input: {
  readonly executor: ParameterizedPgReadExecutor;
  readonly identity: FinalReceiptIdentity;
  readonly serverScope: ServerCurrentReceiptScope;
  readonly signal?: AbortSignal;
}): Promise<PostgresFinalCommandReceipt | null> {
  const identity = Object.freeze({
    worldId: canonicalId(input.identity.worldId, 'worldId'),
    commandId: canonicalId(input.identity.commandId, 'commandId'),
    idempotencyKey: canonicalId(
      input.identity.idempotencyKey,
      'idempotencyKey',
    ),
  });
  let authSubject: SupabaseAuthSubject;
  try {
    authSubject = parseSupabaseAuthSubject(input.serverScope.authSubject);
  } catch {
    protocol('server-current authSubject is invalid');
  }
  const serverScope = Object.freeze({
    authSubject,
    countryId: canonicalId(input.serverScope.countryId, 'countryId'),
    officeId: canonicalId(input.serverScope.officeId, 'officeId'),
  });
  if (isAborted(input.signal)) {
    throw new WorldReadFailure(
      'CANCELLED',
      'Final receipt read cancelled',
      false,
    );
  }

  const queryRequest: ParameterizedPgReadRequest = {
    text: WORLD_V2_FINAL_RECEIPT_QUERY,
    values: Object.freeze([
      identity.worldId,
      identity.commandId,
      identity.idempotencyKey,
      serverScope.authSubject,
      serverScope.countryId,
      serverScope.officeId,
    ]),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  };
  let result: ParameterizedPgReadResult;
  try {
    result = await awaitQuery(input.executor.query(queryRequest), input.signal);
  } catch {
    if (isAborted(input.signal)) {
      throw new WorldReadFailure(
        'CANCELLED',
        'Final receipt read cancelled',
        false,
      );
    }
    throw new WorldReadFailure(
      'UPSTREAM_UNAVAILABLE',
      'Final receipt database unavailable',
      true,
    );
  }

  const rows = resultRows(result);
  if (rows.length === 0) return null;
  if (rows.length !== 1) {
    protocol('PostgreSQL final receipt query returned conflicting rows');
  }
  return mapFinalReceipt(rows[0], identity, serverScope);
}

/**
 * Reads a final receipt for a verified caller without accepting Country or
 * Office from the browser. The durable submission supplies that scope and the
 * same PostgreSQL statement requires a current active authorization match.
 */
export async function readAuthenticatedPostgresFinalCommandReceipt(input: {
  readonly executor: ParameterizedPgReadExecutor;
  readonly identity: FinalReceiptIdentity;
  readonly authSubject: SupabaseAuthSubject;
  readonly signal?: AbortSignal;
}): Promise<PostgresFinalCommandReceipt | null> {
  const identity = Object.freeze({
    worldId: canonicalId(input.identity.worldId, 'worldId'),
    commandId: canonicalId(input.identity.commandId, 'commandId'),
    idempotencyKey: canonicalId(
      input.identity.idempotencyKey,
      'idempotencyKey',
    ),
  });
  let authSubject: SupabaseAuthSubject;
  try {
    authSubject = parseSupabaseAuthSubject(input.authSubject);
  } catch {
    protocol('authenticated authSubject is invalid');
  }
  if (isAborted(input.signal)) {
    throw new WorldReadFailure(
      'CANCELLED',
      'Final receipt read cancelled',
      false,
    );
  }

  const queryRequest: ParameterizedPgReadRequest = {
    text: WORLD_V2_AUTHENTICATED_FINAL_RECEIPT_QUERY,
    values: Object.freeze([
      identity.worldId,
      identity.commandId,
      identity.idempotencyKey,
      authSubject,
    ]),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  };
  let result: ParameterizedPgReadResult;
  try {
    result = await awaitQuery(input.executor.query(queryRequest), input.signal);
  } catch {
    if (isAborted(input.signal)) {
      throw new WorldReadFailure(
        'CANCELLED',
        'Final receipt read cancelled',
        false,
      );
    }
    throw new WorldReadFailure(
      'UPSTREAM_UNAVAILABLE',
      'Final receipt database unavailable',
      true,
    );
  }
  const rows = resultRows(result);
  if (rows.length === 0) return null;
  if (rows.length !== 1) {
    protocol(
      'PostgreSQL authenticated final receipt query returned conflicting rows',
    );
  }
  const row = receiptRow(rows[0]);
  return mapFinalReceipt(rows[0], identity, {
    authSubject,
    countryId: canonicalId(row.submission_country_id, 'submission countryId'),
    officeId: canonicalId(row.submission_office_id, 'submission officeId'),
  });
}
