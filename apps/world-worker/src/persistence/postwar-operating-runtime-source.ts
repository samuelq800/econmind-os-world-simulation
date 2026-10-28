/** Server-owned admitted opening source, not an admission publisher, live-domain
 * replay, command authority, browser DTO or source-custody replacement. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  OFFICE_DEFINITIONS,
  type AuthorizationCapability,
  type OpeningSeed,
  countryId,
  officeId,
  reauthorizeOfficeCapability,
  worldId,
  type AuthorizedOfficeContext,
} from '@econmind/core';
import {
  readPostwarOperatingGenesisFromSeed,
  type PostwarOperatingGenesisFacts,
} from '../preparation/postwar-operating-genesis-adoption.js';
import {
  selectPostwarSocialEmploymentCountry,
  type PostwarSocialEmploymentCountrySource,
} from '../preparation/postwar-social-employment-state.js';
import { officePrivateReadProjectionScopeKey } from '../projections/current-authorization-entitlement-publisher.js';
import {
  DurableV08LedgerLineageReader,
  type DurableV08LedgerLineageSnapshot,
} from './durable-v08-ledger-lineage-reader.js';
import { WorldOpeningSeedStore } from './opening-seed-store.js';
import {
  RuntimeReadBindingStore,
  RuntimeReadBindingStoreError,
  type RuntimeSeatReference,
  type ImmutableOpeningAdmissionReference,
} from './runtime-read-binding-store.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';

export const POSTWAR_RUNTIME_SOURCE_MODE_QUERY =
  `select current_setting('transaction_read_only') as read_only,
  current_setting('transaction_isolation') as isolation`.trim();
export const POSTWAR_RUNTIME_SOURCE_AUTHORIZATION_QUERY =
  `select a.authorization_version, a.team_id
from world_v2.current_commit_authorization a
join world_v2.projection_entitlement e
  on e.world_id=a.world_id and e.auth_subject=a.auth_subject
  and e.authorization_version=a.authorization_version
where a.world_id=$1 and a.auth_subject=$2::uuid and a.country_id=$3 and a.office_id=$4
  and a.team_id=$5 and a.authorization_version=$6 and a.capability=$7 and a.active
  and e.classification='OFFICE_PRIVATE' and e.scope_key=$8 and e.active and e.revoked_at is null
limit 2`.trim();
export const POSTWAR_RUNTIME_SOURCE_HEAD_QUERY =
  `select world_version::text as world_version, event_sequence::text as event_sequence
from world_v2.world_head where world_id=$1 limit 2`.trim();

type FailureCode =
  | 'READ_TRANSACTION_REQUIRED'
  | 'AUTHORIZATION_DENIED'
  | 'SOURCE_SCOPE_MISMATCH'
  | 'SOURCE_NOT_ADMITTED'
  | 'OPERATING_SOURCE_UNAVAILABLE'
  | 'REPLAY_UNAVAILABLE'
  | 'SOURCE_UNAVAILABLE'
  | 'SOURCE_SCOPE_EXPIRED';
export class PostwarOperatingRuntimeSourceError extends Error {
  constructor(readonly code: FailureCode) {
    super(code);
    this.name = 'PostwarOperatingRuntimeSourceError';
  }
}
export interface PostwarOperatingRuntimeSource {
  readonly schemaVersion: 'postwar-operating-runtime-source-v1';
  readonly status: 'ADMITTED_OPENING_AT_H0';
  readonly classification: 'SERVER_ONLY_EXACT_OFFICE_SCOPE';
  readonly scope: Readonly<{
    worldId: string;
    countryId: string;
    officeId: 'SOCIAL';
    authSubject: string;
    teamId: string;
    authorizationVersion: string;
    scopeKey: string;
    seatRef: string;
  }>;
  readonly boundary: Readonly<{
    seedId: string;
    seedFingerprint: string;
    admissionRef: string;
    modelVersion: string;
    replayBinding: string;
    headWorldVersion: '0';
    headEventSequence: '0';
    carrierSHA256: string;
    policySHA256: string;
    outputSHA256: string;
    bindingFingerprint: string;
  }>;
  readonly facts: PostwarOperatingGenesisFacts;
  readonly socialEmployment: Readonly<PostwarSocialEmploymentCountrySource>;
  readonly replayCoverage: 'IMMUTABLE_OPENING_ONLY_NO_POST_H0_SOCIAL_REPLAY';
}
interface Lease {
  readonly executor: SqlExecutor;
  active: boolean;
}
const sources = new WeakMap<object, Lease>();
const sha = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const unavailable = async (): Promise<never> => {
  throw new Error('EXPLICIT_STABLE_READ_EXECUTOR_REQUIRED');
};
const isolatedDatabase: SqlDatabase = {
  query: unavailable,
  transaction: unavailable,
};
function failure(code: FailureCode): never {
  throw new PostwarOperatingRuntimeSourceError(code);
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function subset(
  facts: PostwarOperatingGenesisFacts,
  country: string,
): PostwarOperatingGenesisFacts {
  const regions = facts.regions.filter(
    (region) => region.countryId === country,
  );
  if (!regions.length) failure('SOURCE_SCOPE_MISMATCH');
  const regionIds = new Set(regions.map((region) => region.regionId));
  const obligations = facts.obligations.filter((obligation) =>
    regionIds.has(obligation.regionId),
  );
  const obligationIds = new Set(
    obligations.map((obligation) => obligation.obligationId),
  );
  return freeze({
    regions,
    people: facts.people.filter((cohort) => regionIds.has(cohort.regionId)),
    positions: facts.positions.filter((position) =>
      regionIds.has(position.regionId),
    ),
    services: facts.services.filter((service) =>
      regionIds.has(service.regionId),
    ),
    housing: facts.housing.filter((housing) => regionIds.has(housing.regionId)),
    funding: facts.funding.filter((funding) => funding.countryId === country),
    obligations,
    events: facts.events.filter((event) =>
      obligationIds.has(event.obligationId),
    ),
  });
}
/** Valid only in the original held transaction and lexical source-consumer
 * lifetime. A saved/copied result cannot become a new authorization/cache grant. */
export function consumePostwarOperatingRuntimeSourceFrom(
  executor: SqlExecutor,
  source: PostwarOperatingRuntimeSource,
): Readonly<PostwarOperatingRuntimeSource> {
  const lease = sources.get(source);
  if (!lease?.active || lease.executor !== executor)
    failure('SOURCE_SCOPE_EXPIRED');
  return source;
}
export interface PostwarOperatingRuntimeSourcePort {
  withSourceFrom<Result>(
    executor: SqlExecutor,
    authorization: AuthorizedOfficeContext,
    consume: (
      source: Readonly<PostwarOperatingRuntimeSource>,
    ) => Promise<Result>,
  ): Promise<Result>;
}
/** Raw originals never leave this trusted server callback. Office consumers
 * must select only their exact country/domain facts before returning a DTO. */
export interface AuthorizedAdmittedOpeningSource {
  readonly schemaVersion: 'authorized-admitted-opening-source-v1';
  readonly classification: 'SERVER_ONLY_ORIGINALS_REQUIRE_EXACT_OFFICE_COUNTRY_MAPPER';
  readonly scope: Readonly<
    Omit<PostwarOperatingRuntimeSource['scope'], 'officeId'> & {
      officeId: string;
    }
  >;
  readonly boundary: PostwarOperatingRuntimeSource['boundary'];
  readonly authorization: AuthorizedOfficeContext;
  readonly seat: Readonly<RuntimeSeatReference>;
  readonly admission: Readonly<ImmutableOpeningAdmissionReference>;
  readonly seed: Readonly<OpeningSeed>;
  readonly replayed: Readonly<DurableV08LedgerLineageSnapshot>;
  readonly heldHead: Readonly<{ worldVersion: '0'; eventSequence: '0' }>;
  readonly operating: ReturnType<typeof readPostwarOperatingGenesisFromSeed>;
}
export interface AuthorizedAdmittedOpeningSourcePort {
  withSourceFrom<Result>(
    executor: SqlExecutor,
    authorization: AuthorizedOfficeContext,
    consume: (
      source: Readonly<AuthorizedAdmittedOpeningSource>,
    ) => Promise<Result>,
  ): Promise<Result>;
}
class SourceConsumerFailure extends Error {
  constructor(cause: unknown) {
    super('SOURCE_CONSUMER_FAILED', { cause });
  }
}
export function consumeAuthorizedAdmittedOpeningSourceFrom(
  executor: SqlExecutor,
  source: AuthorizedAdmittedOpeningSource,
): Readonly<AuthorizedAdmittedOpeningSource> {
  const lease = sources.get(source);
  if (!lease?.active || lease.executor !== executor)
    failure('SOURCE_SCOPE_EXPIRED');
  return source;
}
/** Explicit nonactivated server installation point. Uses the existing current
 * seat/admission/entitlement/seed/lineage implementations. No environment, pool,
 * SET ROLE, GUC mutation, transaction opening, generic SQL or I/O callback loader.
 * The host supplies its already verified-subject READ ONLY transaction. */
export function createAuthorizedAdmittedOpeningSource(input: {
  readonly scope: Readonly<{
    worldId: string;
    countryId: string;
    officeId: string;
  }>;
  readonly capabilities: readonly AuthorizationCapability[];
  readonly authorizationPublisherRole: string;
  readonly runtimeReaderRole: string;
}): Readonly<AuthorizedAdmittedOpeningSourcePort> {
  const scope = freeze({
    worldId: worldId(input.scope.worldId),
    countryId: countryId(input.scope.countryId),
    officeId: officeId(input.scope.officeId),
  });
  const defined =
    OFFICE_DEFINITIONS[scope.officeId as keyof typeof OFFICE_DEFINITIONS];
  const capabilities = Object.freeze([...input.capabilities]);
  if (
    !defined ||
    !capabilities.length ||
    new Set(capabilities).size !== capabilities.length ||
    capabilities.some(
      (capability) =>
        !(defined.capabilities as readonly string[]).includes(capability),
    )
  )
    failure('SOURCE_SCOPE_MISMATCH');
  const references = new RuntimeReadBindingStore({
    database: isolatedDatabase,
    authorizationPublisherRole: input.authorizationPublisherRole,
    runtimeReaderRole: input.runtimeReaderRole,
  });
  const opening = new WorldOpeningSeedStore({
    database: isolatedDatabase,
    sha256Hex: sha,
  });
  const lineage = new DurableV08LedgerLineageReader({
    database: isolatedDatabase,
    sha256Hex: sha,
  });
  const assertScope = (authorization: AuthorizedOfficeContext) => {
    if (
      authorization.worldId !== scope.worldId ||
      authorization.countryId !== scope.countryId ||
      authorization.officeId !== scope.officeId ||
      !capabilities.includes(authorization.capability)
    )
      failure('SOURCE_SCOPE_MISMATCH');
  };
  return Object.freeze({
    async withSourceFrom<Result>(
      executor: SqlExecutor,
      original: AuthorizedOfficeContext,
      consume: (
        source: Readonly<AuthorizedAdmittedOpeningSource>,
      ) => Promise<Result>,
    ): Promise<Result> {
      let lease: Lease | undefined;
      try {
        let authorization: AuthorizedOfficeContext;
        try {
          authorization = await reauthorizeOfficeCapability(original);
        } catch {
          return failure('AUTHORIZATION_DENIED');
        }
        assertScope(authorization);
        const mode = await executor.query<{
          read_only: unknown;
          isolation: unknown;
        }>(POSTWAR_RUNTIME_SOURCE_MODE_QUERY);
        if (
          mode.rows.length !== 1 ||
          mode.rows[0]?.read_only !== 'on' ||
          !['repeatable read', 'serializable'].includes(
            String(mode.rows[0].isolation),
          )
        )
          failure('READ_TRANSACTION_REQUIRED');
        const seat = await references.readCurrentSeatFrom({
          executor,
          verifiedSubject: authorization.authSubject,
          worldId: scope.worldId,
          countryId: scope.countryId,
          officeId: scope.officeId,
        });
        if (
          !seat ||
          seat.teamId !== authorization.teamId ||
          seat.authorizationRevision !== authorization.authorizationVersion
        )
          failure('AUTHORIZATION_DENIED');
        const scopeKey = officePrivateReadProjectionScopeKey({
          countryId: scope.countryId,
          officeId: scope.officeId,
        });
        const entitlement = await executor.query<{
          authorization_version: unknown;
          team_id: unknown;
        }>(POSTWAR_RUNTIME_SOURCE_AUTHORIZATION_QUERY, [
          scope.worldId,
          authorization.authSubject,
          scope.countryId,
          scope.officeId,
          authorization.teamId,
          authorization.authorizationVersion,
          authorization.capability,
          scopeKey,
        ]);
        if (
          entitlement.rows.length !== 1 ||
          entitlement.rows[0]?.authorization_version !==
            authorization.authorizationVersion ||
          entitlement.rows[0]?.team_id !== authorization.teamId
        )
          failure('AUTHORIZATION_DENIED');
        const admission = await references.readImmutableAdmissionFrom({
          executor,
          verifiedSubject: authorization.authSubject,
          worldId: scope.worldId,
        });
        if (!admission) failure('SOURCE_NOT_ADMITTED');
        const seed = await opening.loadFrom(executor, scope.worldId);
        if (
          seed.seedId !== admission.seedRef ||
          seed.fingerprint !== admission.contentHash ||
          canonicalSerialize(seed.replayBinding) !== admission.replayBinding ||
          seed.replayBinding.modelVersion !== admission.modelVersion
        )
          failure('SOURCE_NOT_ADMITTED');
        const heads = await executor.query<{
          world_version: unknown;
          event_sequence: unknown;
        }>(POSTWAR_RUNTIME_SOURCE_HEAD_QUERY, [scope.worldId]);
        const head = heads.rows[0];
        if (
          heads.rows.length !== 1 ||
          !head ||
          typeof head.world_version !== 'string' ||
          typeof head.event_sequence !== 'string' ||
          !/^(?:0|[1-9][0-9]*)$/u.test(head.world_version) ||
          !/^(?:0|[1-9][0-9]*)$/u.test(head.event_sequence)
        )
          failure('SOURCE_UNAVAILABLE');
        // A valid financial replay does not replay social cohorts/services.
        // Deny before exposing any H0 facts at a subsequent World head.
        if (head.world_version !== '0') failure('REPLAY_UNAVAILABLE');
        if (head.event_sequence !== '0') failure('SOURCE_UNAVAILABLE');
        const replayed = await lineage.rebuildReadOnlyFrom(
          executor,
          scope.worldId,
        );
        if (
          replayed.headWorldVersion !== '0' ||
          replayed.headEventSequence !== '0' ||
          replayed.ledgers.seedFingerprint !== seed.fingerprint
        )
          failure('SOURCE_UNAVAILABLE');
        let view: ReturnType<typeof readPostwarOperatingGenesisFromSeed>;
        try {
          view = readPostwarOperatingGenesisFromSeed(seed);
        } catch {
          return failure('OPERATING_SOURCE_UNAVAILABLE');
        }
        if (
          view.worldId !== scope.worldId ||
          view.seedFingerprint !== seed.fingerprint
        )
          failure('SOURCE_UNAVAILABLE');
        const boundScope = {
          ...scope,
          authSubject: authorization.authSubject,
          teamId: authorization.teamId,
          authorizationVersion: authorization.authorizationVersion,
          scopeKey,
          seatRef: seat.seatRef,
        };
        const boundary = {
          seedId: seed.seedId,
          seedFingerprint: seed.fingerprint,
          admissionRef: admission.admissionRef,
          modelVersion: admission.modelVersion,
          replayBinding: admission.replayBinding,
          headWorldVersion: '0' as const,
          headEventSequence: '0' as const,
          carrierSHA256: view.carrierSha256,
          policySHA256: view.policySha256,
          outputSHA256: view.outputSha256,
        };
        const completeBoundary = {
          ...boundary,
          bindingFingerprint: `sha256:${sha(canonicalSerialize({ scope: boundScope, boundary }))}`,
        };
        const source: AuthorizedAdmittedOpeningSource = freeze({
          schemaVersion: 'authorized-admitted-opening-source-v1',
          classification:
            'SERVER_ONLY_ORIGINALS_REQUIRE_EXACT_OFFICE_COUNTRY_MAPPER',
          scope: boundScope,
          boundary: completeBoundary,
          authorization,
          seat,
          admission,
          seed,
          replayed,
          heldHead: { worldVersion: '0', eventSequence: '0' },
          operating: view,
        });
        lease = { executor, active: true };
        sources.set(source, lease);
        let result: Result;
        try {
          result = await consume(source);
        } catch (error) {
          throw new SourceConsumerFailure(error);
        }
        // Do not return a result after an identity/seat/role switch during the
        // consumer. The next transaction always independently reloads facts.
        let current: AuthorizedOfficeContext;
        try {
          current = await reauthorizeOfficeCapability(original);
        } catch {
          return failure('AUTHORIZATION_DENIED');
        }
        assertScope(current);
        if (
          current.authSubject !== authorization.authSubject ||
          current.teamId !== authorization.teamId ||
          current.authorizationVersion !== authorization.authorizationVersion
        )
          failure('AUTHORIZATION_DENIED');
        const heldSeat = await references.readCurrentSeatFrom({
          executor,
          verifiedSubject: current.authSubject,
          worldId: scope.worldId,
          countryId: scope.countryId,
          officeId: scope.officeId,
        });
        if (
          !heldSeat ||
          heldSeat.seatRef !== seat.seatRef ||
          heldSeat.authorizationRevision !== seat.authorizationRevision
        )
          failure('AUTHORIZATION_DENIED');
        const currentEntitlement = await executor.query<{
          authorization_version: unknown;
          team_id: unknown;
        }>(POSTWAR_RUNTIME_SOURCE_AUTHORIZATION_QUERY, [
          scope.worldId,
          current.authSubject,
          scope.countryId,
          scope.officeId,
          current.teamId,
          current.authorizationVersion,
          current.capability,
          scopeKey,
        ]);
        if (
          currentEntitlement.rows.length !== 1 ||
          currentEntitlement.rows[0]?.authorization_version !==
            current.authorizationVersion ||
          currentEntitlement.rows[0]?.team_id !== current.teamId
        )
          failure('AUTHORIZATION_DENIED');
        return result;
      } catch (error) {
        if (error instanceof SourceConsumerFailure) throw error.cause;
        if (error instanceof PostwarOperatingRuntimeSourceError) throw error;
        if (
          error instanceof RuntimeReadBindingStoreError &&
          error.code === 'RUNTIME_BINDING_ROLE_OR_SUBJECT_DENIED'
        )
          return failure('AUTHORIZATION_DENIED');
        return failure('SOURCE_UNAVAILABLE');
      } finally {
        if (lease) lease.active = false;
      }
    },
  });
}

/** Social-specific installation: only the exact country source is returned;
 * the complete world seed/inputs remain inside the server-only source mapper. */
export function createPostwarOperatingRuntimeSource(input: {
  readonly scope: Readonly<{
    worldId: string;
    countryId: string;
    officeId: 'SOCIAL';
  }>;
  readonly authorizationPublisherRole: string;
  readonly runtimeReaderRole: string;
}): Readonly<PostwarOperatingRuntimeSourcePort> {
  if (input.scope.officeId !== 'SOCIAL') failure('SOURCE_SCOPE_MISMATCH');
  const raw = createAuthorizedAdmittedOpeningSource({
    ...input,
    capabilities: ['SOCIAL_LABOUR', 'SOCIAL_EDUCATION', 'SOCIAL_DEVELOPMENT'],
  });
  return Object.freeze({
    withSourceFrom<Result>(
      executor: SqlExecutor,
      authorization: AuthorizedOfficeContext,
      consume: (
        source: Readonly<PostwarOperatingRuntimeSource>,
      ) => Promise<Result>,
    ): Promise<Result> {
      return raw.withSourceFrom(executor, authorization, async (held) => {
        consumeAuthorizedAdmittedOpeningSourceFrom(executor, held);
        if (held.operating.socialEmployment === null)
          failure('OPERATING_SOURCE_UNAVAILABLE');
        const socialEmployment = selectPostwarSocialEmploymentCountry(
          held.operating.socialEmployment,
          held.scope.countryId,
        );
        if (
          socialEmployment.worldId !== held.scope.worldId ||
          socialEmployment.seedId !== held.seed.seedId ||
          socialEmployment.countryId !== held.scope.countryId
        )
          failure('SOURCE_SCOPE_MISMATCH');
        const source: PostwarOperatingRuntimeSource = freeze({
          schemaVersion: 'postwar-operating-runtime-source-v1',
          status: 'ADMITTED_OPENING_AT_H0',
          classification: 'SERVER_ONLY_EXACT_OFFICE_SCOPE',
          scope: { ...held.scope, officeId: 'SOCIAL' },
          boundary: held.boundary,
          facts: subset(held.operating.facts, held.scope.countryId),
          socialEmployment,
          replayCoverage: 'IMMUTABLE_OPENING_ONLY_NO_POST_H0_SOCIAL_REPLAY',
        });
        sources.set(source, sources.get(held)!);
        return consume(source);
      });
    },
  });
}
