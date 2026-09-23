import {
  DOMAIN_ERROR_CODES,
  DomainError,
  type WorldWriterCommitAssertion,
} from '@econmind/core';

import type { SqlDatabase } from '../persistence/sql-database.js';

export const WORLD_READ_PROJECTION_SCHEMA_VERSION =
  'world-projection-read-v1' as const;

/**
 * `NEGOTIATION_PARTY` rows used to be accepted at this low-level Worker
 * boundary as caller-supplied payloads. Migration 0014 gives that
 * classification a current server-membership source, so the generic writer is
 * deliberately retained only as a fail-closed compatibility surface. The sole
 * party writer is CurrentNegotiationPartyReadPublisher.
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

/**
 * Retired generic party publication boundary. It must never begin a database
 * transaction, so caller-provided party scopes or payloads cannot replace the
 * source-bound materialization or its entitlements.
 */
export class WorldReadProjectionPublisher {
  constructor(input: {
    readonly database: SqlDatabase;
    readonly workerId: string;
  }) {
    void input;
  }

  async replace(input: {
    readonly assertion: WorldWriterCommitAssertion;
    readonly observedAtReal: string;
    readonly projections: readonly WorldReadProjectionInput[];
  }): Promise<Readonly<WorldReadProjectionPublicationResult>> {
    void input;
    throw new DomainError(
      DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
      'Generic negotiation-party publication is retired; use the source-bound current membership publisher',
    );
  }
}
