import {
  DOMAIN_ERROR_CODES,
  DomainError,
  authSubject,
  canonicalSerialize,
  countryId,
  officeId,
  workerId,
  type AuthSubject,
  type CountryId,
  type OfficeId,
  type WorldWriterCommitAssertion,
} from '@econmind/core';

import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';
import { WORLD_READ_PROJECTION_SCHEMA_VERSION } from './world-read-projection-publisher.js';

const RFC3339_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.[0-9]{3}Z$/u;
const NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const CANONICAL_PARTY_ID = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const MAX_READ_PROJECTION_PAYLOAD_BYTES = 1_000_000;

export const WORLD_NEGOTIATION_PARTY_PROJECTION_SCHEMA_VERSION =
  'world-negotiation-party-membership-v1' as const;

export interface CurrentNegotiationPartyReadPublicationResult {
  readonly entitlementCount: number;
  readonly eventSequence: string;
  readonly partyProjections: number;
  readonly worldVersion: string;
}

interface GuardRow {
  readonly event_sequence: unknown;
  readonly world_version: unknown;
}

interface CountRow {
  readonly count: unknown;
}

interface CurrentPartyMembershipRow {
  readonly auth_subject: unknown;
  readonly authorization_version: unknown;
  readonly country_id: unknown;
  readonly office_id: unknown;
  readonly party_id: unknown;
}

interface CurrentPartyMembership {
  readonly authSubject: AuthSubject;
  readonly authorizationVersion: string;
  readonly countryId: CountryId;
  readonly officeId: OfficeId;
  readonly partyId: string;
}

interface NegotiationPartyEntitlement {
  readonly authSubject: AuthSubject;
  readonly authorizationVersion: string;
  readonly partyId: string;
}

interface PartyMember {
  readonly countryId: CountryId;
  readonly officeId: OfficeId;
}

interface NegotiationPartyProjection {
  readonly canonicalPayload: string;
  readonly partyId: string;
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(`${label} must be a non-empty string`);
  }
  return value;
}

function canonicalTimestamp(value: string): string {
  if (!RFC3339_MILLISECONDS.test(value)) {
    invalid(
      'Negotiation-party publication time must be canonical RFC3339 milliseconds',
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

function parseCurrentPartyMembership(
  row: CurrentPartyMembershipRow,
): CurrentPartyMembership {
  try {
    const partyId = requiredString(row.party_id, 'party_id');
    if (!CANONICAL_PARTY_ID.test(partyId)) {
      invalid('party_id must use canonical scope-key grammar');
    }
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
      partyId,
    });
  } catch {
    invalid('Current negotiation-party source contains malformed evidence');
  }
}

function partyMemberKey(member: PartyMember): string {
  return `${member.countryId}:${member.officeId}`;
}

function entitlementKey(entitlement: NegotiationPartyEntitlement): string {
  return `${entitlement.authSubject}:${entitlement.partyId}`;
}

function deriveMaterialization(rows: readonly CurrentPartyMembershipRow[]): {
  readonly entitlements: readonly NegotiationPartyEntitlement[];
  readonly projections: readonly NegotiationPartyProjection[];
} {
  const entitlements = new Map<string, NegotiationPartyEntitlement>();
  const membersByParty = new Map<string, Map<string, PartyMember>>();
  for (const row of rows) {
    const source = parseCurrentPartyMembership(row);
    const entitlement = Object.freeze({
      authSubject: source.authSubject,
      authorizationVersion: source.authorizationVersion,
      partyId: source.partyId,
    });
    const key = entitlementKey(entitlement);
    const prior = entitlements.get(key);
    if (
      prior !== undefined &&
      prior.authorizationVersion !== entitlement.authorizationVersion
    ) {
      invalid(
        'Current negotiation-party source has conflicting revisions for one party entitlement',
      );
    }
    entitlements.set(key, entitlement);

    const members = membersByParty.get(source.partyId) ?? new Map();
    members.set(
      partyMemberKey(source),
      Object.freeze({ countryId: source.countryId, officeId: source.officeId }),
    );
    membersByParty.set(source.partyId, members);
  }

  const projections = [...membersByParty.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([partyId, members]) => {
      const sortedMembers = [...members.values()].sort((left, right) =>
        partyMemberKey(left).localeCompare(partyMemberKey(right)),
      );
      const canonicalPayload = canonicalSerialize({
        members: sortedMembers.map((member) => ({
          countryId: member.countryId,
          officeId: member.officeId,
        })),
        partyId,
        schemaVersion: WORLD_NEGOTIATION_PARTY_PROJECTION_SCHEMA_VERSION,
      });
      if (
        Buffer.byteLength(canonicalPayload, 'utf8') >
        MAX_READ_PROJECTION_PAYLOAD_BYTES
      ) {
        invalid(
          'Negotiation-party projection payload exceeds its one MiB limit',
        );
      }
      return Object.freeze({ canonicalPayload, partyId });
    });

  return Object.freeze({
    entitlements: Object.freeze(
      [...entitlements.values()].sort((left, right) =>
        entitlementKey(left).localeCompare(entitlementKey(right)),
      ),
    ),
    projections: Object.freeze(projections),
  });
}

/**
 * Worker-owned V10.1 named-party read boundary. It can materialize only the
 * current server-owned membership source introduced by migration 0014. The
 * source deliberately has no school field or school-isolation rule. Until a
 * separately authorized server workflow populates it, replacement clears any
 * stale party rows and leaves negotiation-party reads unavailable.
 */
export class CurrentNegotiationPartyReadPublisher {
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
  }): Promise<Readonly<CurrentNegotiationPartyReadPublicationResult>> {
    if (input.assertion.holderId !== this.#workerId) {
      invalid(
        'Negotiation-party publication assertion holder does not match this Worker',
      );
    }
    const observedAtReal = canonicalTimestamp(input.observedAtReal);

    return this.#database.transaction(async (transaction) => {
      const watermark = await this.#assertCommitGuard(
        transaction,
        input.assertion,
        observedAtReal,
      );
      const source = await transaction.query<CurrentPartyMembershipRow>(
        `select party_id,
                auth_subject::text as auth_subject,
                country_id,
                office_id,
                authorization_version
           from world_v2.current_negotiation_party_membership
          where world_id = $1
            and active
          order by party_id, auth_subject, country_id, office_id
          for key share`,
        [input.assertion.worldId],
      );
      const materialization = deriveMaterialization(source.rows);

      await transaction.query(
        `delete from world_v2.projection_entitlement
          where world_id = $1
            and classification = 'NEGOTIATION_PARTY'`,
        [input.assertion.worldId],
      );
      await transaction.query(
        `delete from world_v2.read_projection
          where world_id = $1
            and classification = 'NEGOTIATION_PARTY'`,
        [input.assertion.worldId],
      );
      for (const entitlement of materialization.entitlements) {
        await transaction.query(
          `insert into world_v2.projection_entitlement
             (world_id, auth_subject, classification, scope_key,
              authorization_version, granted_at)
           values ($1, $2::uuid, 'NEGOTIATION_PARTY', $3, $4, $5::timestamptz)`,
          [
            input.assertion.worldId,
            entitlement.authSubject,
            entitlement.partyId,
            entitlement.authorizationVersion,
            observedAtReal,
          ],
        );
      }
      for (const projection of materialization.projections) {
        await transaction.query(
          `insert into world_v2.read_projection
             (world_id, classification, scope_key, schema_version, world_version,
              event_sequence, payload, generated_at)
           values ($1, 'NEGOTIATION_PARTY', $2, $3, $4::bigint, $5::bigint, $6::jsonb, $7::timestamptz)`,
          [
            input.assertion.worldId,
            projection.partyId,
            WORLD_READ_PROJECTION_SCHEMA_VERSION,
            watermark.worldVersion,
            watermark.eventSequence,
            projection.canonicalPayload,
            observedAtReal,
          ],
        );
      }

      const entitlementCount = await this.#count(
        transaction,
        `select count(*) as count
           from world_v2.projection_entitlement
          where world_id = $1
            and classification = 'NEGOTIATION_PARTY'`,
        input.assertion.worldId,
        'negotiation-party entitlement count',
      );
      if (entitlementCount !== materialization.entitlements.length) {
        invalid(
          'Negotiation-party publication produced an unexpected entitlement count',
        );
      }
      const projectionCount = await this.#count(
        transaction,
        `select count(*) as count
           from world_v2.read_projection
          where world_id = $1
            and classification = 'NEGOTIATION_PARTY'
            and (world_version <> $2::bigint or event_sequence <> $3::bigint)`,
        input.assertion.worldId,
        'negotiation-party watermark mismatch count',
        watermark,
      );
      if (projectionCount !== 0) {
        invalid('Negotiation-party publication produced a non-head watermark');
      }

      return Object.freeze({
        entitlementCount,
        eventSequence: watermark.eventSequence,
        partyProjections: materialization.projections.length,
        worldVersion: watermark.worldVersion,
      });
    });
  }

  async #count(
    transaction: SqlExecutor,
    statement: string,
    worldId: string,
    label: string,
    watermark?: Readonly<{ eventSequence: string; worldVersion: string }>,
  ): Promise<number> {
    const parameters =
      watermark === undefined
        ? [worldId]
        : [worldId, watermark.worldVersion, watermark.eventSequence];
    const result = await transaction.query<CountRow>(statement, parameters);
    const count = databaseInteger(result.rows[0]?.count, label);
    return Number(count);
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
      invalid('Negotiation-party guard returned a different WorldVersion');
    }
    return Object.freeze({
      eventSequence: databaseInteger(
        result.rows[0]?.event_sequence,
        'guard Event sequence',
      ),
      worldVersion,
    });
  }
}
