import {
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalSerialize,
  countryId,
  officeId,
  workerId,
  type CountryId,
  type OfficeId,
  type WorldWriterCommitAssertion,
} from '@econmind/core';

import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';
import {
  countryReadProjectionScopeKey,
  officePrivateReadProjectionScopeKey,
} from './current-authorization-entitlement-publisher.js';
import { WORLD_READ_PROJECTION_SCHEMA_VERSION } from './world-read-projection-publisher.js';

const RFC3339_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.[0-9]{3}Z$/u;
const NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const MAX_READ_PROJECTION_PAYLOAD_BYTES = 1_000_000;

type ActivityProjectionClassification = 'COUNTRY' | 'OFFICE_PRIVATE';

export const WORLD_ACTIVITY_PROJECTION_SCHEMA_VERSION =
  'world-activity-projection-v1' as const;

export interface AuthoritativeActivityProjectionPublicationResult {
  readonly countryProjections: number;
  readonly eventSequence: string;
  readonly officePrivateProjections: number;
  readonly worldVersion: string;
}

interface GuardRow {
  readonly event_sequence: unknown;
  readonly world_version: unknown;
}

interface CurrentAuthorizationRow {
  readonly country_id: unknown;
  readonly office_id: unknown;
}

interface EventActivityRow {
  readonly country_id: unknown;
  readonly event_count: unknown;
  readonly last_event_sequence: unknown;
  readonly last_event_world_version: unknown;
  readonly office_id: unknown;
}

interface CountRow {
  readonly count: unknown;
}

interface CountryOfficeScope {
  readonly countryId: CountryId;
  readonly officeId: OfficeId;
}

interface ActivitySummary {
  readonly authoritativeEventCount: string;
  readonly lastAuthoritativeEventSequence: string;
  readonly lastAuthoritativeEventWorldVersion: string;
}

interface PreparedProjection {
  readonly canonicalPayload: string;
  readonly classification: ActivityProjectionClassification;
  readonly scopeKey: string;
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
}

function timestamp(value: string): string {
  if (!RFC3339_MILLISECONDS.test(value)) {
    invalid(
      'Activity projection publication time must be canonical RFC3339 milliseconds',
    );
  }
  return value;
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

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(`${label} must be a non-empty string`);
  }
  return value;
}

function nullableOfficeId(value: unknown): OfficeId | null {
  if (value === null) return null;
  try {
    return officeId(requiredString(value, 'office_id'));
  } catch {
    invalid('Authoritative event source has a malformed office identifier');
  }
}

function parseCountryOfficeScope(
  row: CurrentAuthorizationRow,
): CountryOfficeScope {
  try {
    return Object.freeze({
      countryId: countryId(requiredString(row.country_id, 'country_id')),
      officeId: officeId(requiredString(row.office_id, 'office_id')),
    });
  } catch {
    invalid('Current authorization source contains malformed scope evidence');
  }
}

function emptyActivity(): ActivitySummary {
  return Object.freeze({
    authoritativeEventCount: '0',
    lastAuthoritativeEventSequence: '0',
    lastAuthoritativeEventWorldVersion: '0',
  });
}

function parseActivity(row: EventActivityRow): ActivitySummary {
  return Object.freeze({
    authoritativeEventCount: databaseInteger(
      row.event_count,
      'authoritative event count',
    ),
    lastAuthoritativeEventSequence: databaseInteger(
      row.last_event_sequence,
      'last authoritative event sequence',
    ),
    lastAuthoritativeEventWorldVersion: databaseInteger(
      row.last_event_world_version,
      'last authoritative event WorldVersion',
    ),
  });
}

function countryKey(country: CountryId): string {
  return country;
}

function officeKey(input: CountryOfficeScope): string {
  return `${input.countryId}:${input.officeId}`;
}

function prepareProjection(input: {
  readonly classification: ActivityProjectionClassification;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly scopeKey: string;
}): PreparedProjection {
  const canonicalPayload = canonicalSerialize(input.payload);
  if (
    Buffer.byteLength(canonicalPayload, 'utf8') >
    MAX_READ_PROJECTION_PAYLOAD_BYTES
  ) {
    invalid('Activity projection payload exceeds its one MiB limit');
  }
  return Object.freeze({
    canonicalPayload,
    classification: input.classification,
    scopeKey: input.scopeKey,
  });
}

/**
 * Worker-owned V10.1 source-to-projection boundary. It derives compact,
 * labelled activity summaries from append-only authoritative Events joined to
 * their canonical Commands. It deliberately does not infer balances, prices,
 * inventory quantities, or any other economic value from event counts.
 */
export class AuthoritativeActivityReadProjectionPublisher {
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
  }): Promise<Readonly<AuthoritativeActivityProjectionPublicationResult>> {
    if (input.assertion.holderId !== this.#workerId) {
      invalid(
        'Activity projection assertion holder does not match this Worker',
      );
    }
    const observedAtReal = timestamp(input.observedAtReal);

    return this.#database.transaction(async (transaction) => {
      const watermark = await this.#assertCommitGuard(
        transaction,
        input.assertion,
        observedAtReal,
      );
      const scopes = await this.#readCurrentScopes(
        transaction,
        input.assertion.worldId,
      );
      const activity = await this.#readAuthoritativeActivity(
        transaction,
        input.assertion.worldId,
        watermark,
      );
      const projections = this.#deriveProjections(scopes, activity);

      await transaction.query(
        `delete from world_v2.read_projection
          where world_id = $1
            and classification in ('COUNTRY', 'OFFICE_PRIVATE')`,
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
            and classification in ('COUNTRY', 'OFFICE_PRIVATE')
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
          'activity watermark mismatch count',
        ) !== '0'
      ) {
        invalid(
          'Activity projection publication produced a non-head watermark',
        );
      }

      return Object.freeze({
        countryProjections: projections.filter(
          (projection) => projection.classification === 'COUNTRY',
        ).length,
        eventSequence: watermark.eventSequence,
        officePrivateProjections: projections.filter(
          (projection) => projection.classification === 'OFFICE_PRIVATE',
        ).length,
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
    const worldVersion = databaseInteger(
      result.rows[0]?.world_version,
      'guard WorldVersion',
    );
    if (worldVersion !== assertion.expectedWorldVersion) {
      invalid('Activity projection guard returned a different WorldVersion');
    }
    return Object.freeze({
      eventSequence: databaseInteger(
        result.rows[0]?.event_sequence,
        'guard Event sequence',
      ),
      worldVersion,
    });
  }

  async #readCurrentScopes(
    transaction: SqlExecutor,
    worldId: string,
  ): Promise<
    Readonly<{
      countries: readonly CountryId[];
      offices: readonly CountryOfficeScope[];
    }>
  > {
    const result = await transaction.query<CurrentAuthorizationRow>(
      `select country_id, office_id
         from world_v2.current_commit_authorization
        where world_id = $1
          and active
        order by country_id, office_id, auth_subject, capability
        for key share`,
      [worldId],
    );
    const countries = new Map<string, CountryId>();
    const offices = new Map<string, CountryOfficeScope>();
    for (const row of result.rows) {
      const scope = parseCountryOfficeScope(row);
      countries.set(countryKey(scope.countryId), scope.countryId);
      offices.set(officeKey(scope), scope);
    }
    return Object.freeze({
      countries: Object.freeze([...countries.values()].sort()),
      offices: Object.freeze(
        [...offices.values()].sort((left, right) =>
          officeKey(left).localeCompare(officeKey(right)),
        ),
      ),
    });
  }

  async #readAuthoritativeActivity(
    transaction: SqlExecutor,
    worldId: string,
    watermark: Readonly<{ eventSequence: string; worldVersion: string }>,
  ): Promise<
    Readonly<{
      countries: ReadonlyMap<string, ActivitySummary>;
      offices: ReadonlyMap<string, ActivitySummary>;
    }>
  > {
    const result = await transaction.query<EventActivityRow>(
      `select command.country_id,
              command.office_id,
              count(event.event_id)::text as event_count,
              max(event.event_sequence)::text as last_event_sequence,
              max(event.world_version)::text as last_event_world_version
         from world_v2.authoritative_event as event
         inner join world_v2.command_submission as command
           on command.world_id = event.world_id
          and command.command_id = event.causation_command_id
        where event.world_id = $1
        group by command.country_id, command.office_id
        order by command.country_id, command.office_id`,
      [worldId],
    );
    const countries = new Map<string, ActivitySummary>();
    const offices = new Map<string, ActivitySummary>();
    for (const row of result.rows) {
      let country: CountryId;
      try {
        country = countryId(requiredString(row.country_id, 'country_id'));
      } catch {
        invalid(
          'Authoritative event source has a malformed country identifier',
        );
      }
      const summary = parseActivity(row);
      if (
        BigInt(summary.lastAuthoritativeEventSequence) >
          BigInt(watermark.eventSequence) ||
        BigInt(summary.lastAuthoritativeEventWorldVersion) >
          BigInt(watermark.worldVersion)
      ) {
        invalid(
          'Authoritative event source is ahead of the guarded World watermark',
        );
      }
      const existingCountry = countries.get(countryKey(country));
      if (existingCountry === undefined) {
        countries.set(countryKey(country), summary);
      } else {
        countries.set(
          countryKey(country),
          this.#combineActivity(existingCountry, summary),
        );
      }
      const office = nullableOfficeId(row.office_id);
      if (office !== null) {
        const scope = Object.freeze({ countryId: country, officeId: office });
        offices.set(officeKey(scope), summary);
      }
    }
    return Object.freeze({ countries, offices });
  }

  #combineActivity(
    left: ActivitySummary,
    right: ActivitySummary,
  ): ActivitySummary {
    return Object.freeze({
      authoritativeEventCount: (
        BigInt(left.authoritativeEventCount) +
        BigInt(right.authoritativeEventCount)
      ).toString(),
      lastAuthoritativeEventSequence:
        BigInt(left.lastAuthoritativeEventSequence) >=
        BigInt(right.lastAuthoritativeEventSequence)
          ? left.lastAuthoritativeEventSequence
          : right.lastAuthoritativeEventSequence,
      lastAuthoritativeEventWorldVersion:
        BigInt(left.lastAuthoritativeEventWorldVersion) >=
        BigInt(right.lastAuthoritativeEventWorldVersion)
          ? left.lastAuthoritativeEventWorldVersion
          : right.lastAuthoritativeEventWorldVersion,
    });
  }

  #deriveProjections(
    scopes: Readonly<{
      countries: readonly CountryId[];
      offices: readonly CountryOfficeScope[];
    }>,
    activity: Readonly<{
      countries: ReadonlyMap<string, ActivitySummary>;
      offices: ReadonlyMap<string, ActivitySummary>;
    }>,
  ): readonly PreparedProjection[] {
    const countries = scopes.countries.map((country) =>
      prepareProjection({
        classification: 'COUNTRY',
        scopeKey: countryReadProjectionScopeKey(country),
        payload: {
          activity:
            activity.countries.get(countryKey(country)) ?? emptyActivity(),
          countryId: country,
          schemaVersion: WORLD_ACTIVITY_PROJECTION_SCHEMA_VERSION,
        },
      }),
    );
    const offices = scopes.offices.map((scope) =>
      prepareProjection({
        classification: 'OFFICE_PRIVATE',
        scopeKey: officePrivateReadProjectionScopeKey(scope),
        payload: {
          activity: activity.offices.get(officeKey(scope)) ?? emptyActivity(),
          countryId: scope.countryId,
          officeId: scope.officeId,
          schemaVersion: WORLD_ACTIVITY_PROJECTION_SCHEMA_VERSION,
        },
      }),
    );
    return Object.freeze([...countries, ...offices]);
  }
}
