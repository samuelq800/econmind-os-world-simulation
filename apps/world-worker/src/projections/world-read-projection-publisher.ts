import {
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalSerialize,
  workerId,
  type WorldWriterCommitAssertion,
} from '@econmind/core';

import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';

const NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const CANONICAL_SCOPE_KEY = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const RFC3339_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.[0-9]{3}Z$/u;
const MAX_READ_PROJECTION_PAYLOAD_BYTES = 1_000_000;

export const WORLD_READ_PROJECTION_SCHEMA_VERSION =
  'world-projection-read-v1' as const;

/**
 * This generic publisher is now reserved for `NEGOTIATION_PARTY`. Country and
 * Office-private projections have source-bound owners; PUBLIC and ADMIN
 * remain preserved for their future owners.
 */
export const V10_1_READ_PROJECTION_CLASSIFICATIONS = Object.freeze([
  'NEGOTIATION_PARTY',
] as const);

export type V10_1ReadProjectionClassification =
  (typeof V10_1_READ_PROJECTION_CLASSIFICATIONS)[number];

export interface WorldReadProjectionInput {
  readonly classification: V10_1ReadProjectionClassification;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly scopeKey: string;
}

export interface WorldReadProjectionPublicationResult {
  readonly eventSequence: string;
  readonly publishedCount: number;
  readonly worldVersion: string;
}

interface GuardRow {
  readonly event_sequence: unknown;
  readonly world_version: unknown;
}

interface CountRow {
  readonly count: unknown;
}

interface PreparedProjection {
  readonly classification: V10_1ReadProjectionClassification;
  readonly canonicalPayload: string;
  readonly scopeKey: string;
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
}

function databaseInteger(value: unknown, label: string): string {
  const rendered =
    typeof value === 'number' || typeof value === 'bigint'
      ? String(value)
      : value;
  if (typeof rendered !== 'string' || !NON_NEGATIVE_INTEGER.test(rendered)) {
    invalid(`${label} must be a canonical non-negative integer`);
  }
  return rendered;
}

function timestamp(value: string): string {
  if (!RFC3339_MILLISECONDS.test(value)) {
    invalid(
      'Read projection publication time must be canonical RFC3339 milliseconds',
    );
  }
  return value;
}

function prepareProjection(
  input: WorldReadProjectionInput,
): PreparedProjection {
  if (
    !V10_1_READ_PROJECTION_CLASSIFICATIONS.includes(input.classification) ||
    !CANONICAL_SCOPE_KEY.test(input.scopeKey)
  ) {
    invalid('Read projection classification or scope key is invalid');
  }
  const canonicalPayload = canonicalSerialize(input.payload);
  const parsed = JSON.parse(canonicalPayload) as unknown;
  if (
    parsed === null ||
    Array.isArray(parsed) ||
    typeof parsed !== 'object' ||
    Buffer.byteLength(canonicalPayload, 'utf8') >
      MAX_READ_PROJECTION_PAYLOAD_BYTES
  ) {
    invalid('Read projection payload must be a bounded canonical object');
  }
  return Object.freeze({
    classification: input.classification,
    canonicalPayload,
    scopeKey: input.scopeKey,
  });
}

function prepareProjections(
  projections: readonly WorldReadProjectionInput[],
): readonly PreparedProjection[] {
  if (projections.length === 0) {
    invalid('Read projection publication requires at least one projection');
  }
  const keys = new Set<string>();
  const prepared = projections.map((projection) => {
    const result = prepareProjection(projection);
    const key = `${result.classification}:${result.scopeKey}`;
    if (keys.has(key))
      invalid('Read projection publication contains a duplicate scope');
    keys.add(key);
    return result;
  });
  return Object.freeze(prepared);
}

/**
 * Worker-owned replacement boundary for V10.1's non-authoritative
 * negotiation-party read model. The caller must derive its input from locked
 * authoritative facts. Country and Office-private projections deliberately
 * cannot enter this generic boundary: their source-bound publishers own them.
 */
export class WorldReadProjectionPublisher {
  readonly #database: SqlDatabase;
  readonly #workerId: ReturnType<typeof workerId>;

  constructor(input: {
    readonly database: SqlDatabase;
    readonly workerId: string;
  }) {
    this.#database = input.database;
    this.#workerId = workerId(input.workerId);
  }

  async replace(input: {
    readonly assertion: WorldWriterCommitAssertion;
    readonly observedAtReal: string;
    readonly projections: readonly WorldReadProjectionInput[];
  }): Promise<Readonly<WorldReadProjectionPublicationResult>> {
    if (input.assertion.holderId !== this.#workerId) {
      invalid(
        'Read projection publication assertion holder does not match this Worker',
      );
    }
    const observedAtReal = timestamp(input.observedAtReal);
    const projections = prepareProjections(input.projections);

    return this.#database.transaction(async (transaction) => {
      const watermark = await this.#assertCommitGuard(
        transaction,
        input.assertion,
        observedAtReal,
      );
      await transaction.query(
        `delete from world_v2.read_projection
          where world_id = $1
            and classification = 'NEGOTIATION_PARTY'`,
        [input.assertion.worldId],
      );
      for (const projection of projections) {
        await transaction.query(
          `insert into world_v2.read_projection
             (world_id, classification, scope_key, schema_version, world_version,
              event_sequence, payload, generated_at)
           values ($1, $2, $3, $4, $5::bigint, $6::bigint, $7::jsonb, $8::timestamptz)
           on conflict (world_id, classification, scope_key) do update
             set schema_version = excluded.schema_version,
                 world_version = excluded.world_version,
                 event_sequence = excluded.event_sequence,
                 payload = excluded.payload,
                 generated_at = excluded.generated_at`,
          [
            input.assertion.worldId,
            projection.classification,
            projection.scopeKey,
            WORLD_READ_PROJECTION_SCHEMA_VERSION,
            watermark.worldVersion,
            watermark.eventSequence,
            projection.canonicalPayload,
            observedAtReal,
          ],
        );
      }
      const verification = await transaction.query<CountRow>(
        `select count(*) as count
           from world_v2.read_projection
          where world_id = $1
            and classification = 'NEGOTIATION_PARTY'
            and (world_version <> $2::bigint or event_sequence <> $3::bigint)`,
        [
          input.assertion.worldId,
          watermark.worldVersion,
          watermark.eventSequence,
        ],
      );
      if (
        databaseInteger(
          verification.rows[0]?.count,
          'read projection watermark mismatch count',
        ) !== '0'
      ) {
        invalid('Read projection publication produced a non-head watermark');
      }
      return Object.freeze({
        eventSequence: watermark.eventSequence,
        publishedCount: projections.length,
        worldVersion: watermark.worldVersion,
      });
    });
  }

  async #assertCommitGuard(
    transaction: SqlExecutor,
    assertion: WorldWriterCommitAssertion,
    observedAtReal: string,
  ): Promise<Readonly<{ eventSequence: string; worldVersion: string }>> {
    const result = await transaction.query<GuardRow>(
      `select world_version, event_sequence
         from world_v2.assert_world_writer_commit_guard($1, $2, $3, $4, $5)`,
      [
        assertion.worldId,
        assertion.holderId,
        assertion.fencingToken,
        assertion.expectedWorldVersion,
        observedAtReal,
      ],
    );
    const row = result.rows[0];
    const worldVersion = databaseInteger(
      row?.world_version,
      'guard WorldVersion',
    );
    if (worldVersion !== assertion.expectedWorldVersion) {
      invalid('Read projection guard returned a different WorldVersion');
    }
    return Object.freeze({
      eventSequence: databaseInteger(
        row?.event_sequence,
        'guard Event sequence',
      ),
      worldVersion,
    });
  }
}
