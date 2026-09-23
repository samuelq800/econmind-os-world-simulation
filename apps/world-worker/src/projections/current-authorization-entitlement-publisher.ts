import {
  DOMAIN_ERROR_CODES,
  DomainError,
  authSubject,
  countryId,
  officeId,
  workerId,
  type AuthSubject,
  type CountryId,
  type OfficeId,
  type WorldWriterCommitAssertion,
} from '@econmind/core';

import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';

const RFC3339_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.[0-9]{3}Z$/u;
const NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;

export const V10_1_ENTITLEMENT_CLASSIFICATIONS = Object.freeze([
  'COUNTRY',
  'OFFICE_PRIVATE',
] as const);

type V10_1EntitlementClassification =
  (typeof V10_1_ENTITLEMENT_CLASSIFICATIONS)[number];

export interface CurrentAuthorizationEntitlementPublicationResult {
  readonly countryEntitlements: number;
  readonly officePrivateEntitlements: number;
  readonly worldVersion: string;
}

interface CurrentAuthorizationRow {
  readonly auth_subject: unknown;
  readonly authorization_version: unknown;
  readonly country_id: unknown;
  readonly office_id: unknown;
}

interface GuardRow {
  readonly world_version: unknown;
}

interface CountRow {
  readonly count: unknown;
}

interface CurrentAuthorization {
  readonly authSubject: AuthSubject;
  readonly authorizationVersion: string;
  readonly countryId: CountryId;
  readonly officeId: OfficeId;
}

interface ProjectionEntitlement {
  readonly authSubject: AuthSubject;
  readonly authorizationVersion: string;
  readonly classification: V10_1EntitlementClassification;
  readonly scopeKey: string;
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
}

function canonicalTimestamp(value: string): string {
  if (!RFC3339_MILLISECONDS.test(value)) {
    invalid(
      'Entitlement publication time must be canonical RFC3339 milliseconds',
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

function parseCurrentAuthorization(
  row: CurrentAuthorizationRow,
): CurrentAuthorization {
  try {
    return Object.freeze({
      authSubject: authSubject(
        requiredString(row.auth_subject, 'auth_subject'),
      ),
      authorizationVersion: requiredString(
        row.authorization_version,
        'authorization_version',
      ),
      countryId: countryId(requiredString(row.country_id, 'country_id')),
      officeId: officeId(requiredString(row.office_id, 'office_id')),
    });
  } catch {
    invalid('Current authorization source contains malformed evidence');
  }
}

function scopeComponent(value: string): string {
  return Buffer.from(value, 'utf8').toString('hex').toUpperCase();
}

/**
 * Country scope keys intentionally remain the canonical country identifier so
 * the API request contract and the server-held authorization fact agree.
 */
export function countryReadProjectionScopeKey(country: CountryId): string {
  return country;
}

/**
 * The private-office key is injective over two canonical identifiers. It
 * avoids ambiguous delimiter concatenation when either identifier contains an
 * underscore or hyphen, and it is derived only by server code.
 */
export function officePrivateReadProjectionScopeKey(input: {
  readonly countryId: CountryId;
  readonly officeId: OfficeId;
}): string {
  return `OFFICE_${scopeComponent(input.countryId)}_${scopeComponent(input.officeId)}`;
}

function deriveEntitlements(
  rows: readonly CurrentAuthorizationRow[],
): readonly ProjectionEntitlement[] {
  const byKey = new Map<string, ProjectionEntitlement>();
  for (const row of rows) {
    const source = parseCurrentAuthorization(row);
    const candidates: readonly ProjectionEntitlement[] = [
      Object.freeze({
        authSubject: source.authSubject,
        authorizationVersion: source.authorizationVersion,
        classification: 'COUNTRY',
        scopeKey: countryReadProjectionScopeKey(source.countryId),
      }),
      Object.freeze({
        authSubject: source.authSubject,
        authorizationVersion: source.authorizationVersion,
        classification: 'OFFICE_PRIVATE',
        scopeKey: officePrivateReadProjectionScopeKey(source),
      }),
    ];
    for (const candidate of candidates) {
      const key = `${candidate.authSubject}:${candidate.classification}:${candidate.scopeKey}`;
      const prior = byKey.get(key);
      if (
        prior !== undefined &&
        prior.authorizationVersion !== candidate.authorizationVersion
      ) {
        invalid(
          'Current authorization source has conflicting revisions for one read entitlement',
        );
      }
      byKey.set(key, candidate);
    }
  }
  return Object.freeze(
    [...byKey.values()].sort((left, right) =>
      `${left.authSubject}:${left.classification}:${left.scopeKey}`.localeCompare(
        `${right.authSubject}:${right.classification}:${right.scopeKey}`,
      ),
    ),
  );
}

/**
 * Worker-owned entitlement replacement for the V10.1 Country and
 * Office-private read classifications. Its only input source is the existing
 * server-held current authorization projection; it never accepts browser
 * identity or portable Office claims. Negotiation-party and admin rows are
 * deliberately preserved until their own authoritative membership sources
 * exist.
 */
export class CurrentAuthorizationEntitlementPublisher {
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
  }): Promise<Readonly<CurrentAuthorizationEntitlementPublicationResult>> {
    if (input.assertion.holderId !== this.#workerId) {
      invalid(
        'Entitlement publication assertion holder does not match this Worker',
      );
    }
    const observedAtReal = canonicalTimestamp(input.observedAtReal);

    return this.#database.transaction(async (transaction) => {
      const worldVersion = await this.#assertCommitGuard(
        transaction,
        input.assertion,
        observedAtReal,
      );
      const current = await transaction.query<CurrentAuthorizationRow>(
        `select auth_subject::text as auth_subject,
                authorization_version,
                country_id,
                office_id
           from world_v2.current_commit_authorization
          where world_id = $1
            and active
          order by auth_subject, country_id, office_id, capability
          for key share`,
        [input.assertion.worldId],
      );
      const entitlements = deriveEntitlements(current.rows);

      await transaction.query(
        `delete from world_v2.projection_entitlement
          where world_id = $1
            and classification in ('COUNTRY', 'OFFICE_PRIVATE')`,
        [input.assertion.worldId],
      );
      for (const entitlement of entitlements) {
        await transaction.query(
          `insert into world_v2.projection_entitlement
             (world_id, auth_subject, classification, scope_key,
              authorization_version, granted_at)
           values ($1, $2::uuid, $3, $4, $5, $6::timestamptz)`,
          [
            input.assertion.worldId,
            entitlement.authSubject,
            entitlement.classification,
            entitlement.scopeKey,
            entitlement.authorizationVersion,
            observedAtReal,
          ],
        );
      }
      const count = await transaction.query<CountRow>(
        `select count(*) as count
           from world_v2.projection_entitlement
          where world_id = $1
            and classification in ('COUNTRY', 'OFFICE_PRIVATE')`,
        [input.assertion.worldId],
      );
      if (
        databaseInteger(count.rows[0]?.count, 'entitlement count') !==
        String(entitlements.length)
      ) {
        invalid('Entitlement publication produced an unexpected row count');
      }

      return Object.freeze({
        countryEntitlements: entitlements.filter(
          (value) => value.classification === 'COUNTRY',
        ).length,
        officePrivateEntitlements: entitlements.filter(
          (value) => value.classification === 'OFFICE_PRIVATE',
        ).length,
        worldVersion,
      });
    });
  }

  async #assertCommitGuard(
    transaction: SqlExecutor,
    assertion: WorldWriterCommitAssertion,
    observedAtReal: string,
  ): Promise<string> {
    const result = await transaction.query<GuardRow>(
      `select world_version
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
      invalid('Entitlement guard returned a different WorldVersion');
    }
    return worldVersion;
  }
}
