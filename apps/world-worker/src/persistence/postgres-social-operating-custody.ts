/** Fixed SQL issuer/reader protocol over admitted canonical full-E03 originals.
 * No snapshot/request facts, admission signature, registry or production install. */
import { createHash } from 'node:crypto';
import { DatabaseError } from 'pg';
import {
  canonicalSerialize,
  DomainError,
  DOMAIN_ERROR_CODES,
  canonicalHashInput,
  canonicalSha256,
  type OpeningSeed,
  parseIndustryPersistenceSchemaBoundaryContext,
} from '@econmind/core';
import {
  readPostwarOperatingGenesisFromSeed,
  POSTWAR_OPERATING_USER_RECEIPT,
} from '../preparation/postwar-operating-genesis-adoption.js';
import { validatePostwarSocialEmploymentStateDocument } from '../preparation/postwar-social-employment-state.js';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import {
  replayPostwarSocialEmploymentLineage,
  type SocialOfferCommittedOrigin,
} from './postwar-social-employment-lineage.js';
import { WorldOpeningSeedStore } from './opening-seed-store.js';
import {
  SOCIAL_SOURCE_MATERIAL_PATHS,
  type SocialOperatingCustodyPort,
  type SocialOperatingSnapshotRequest,
  type SocialSourceRole,
} from './social-employment-source-input.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import type { SocialEmploymentRuntimeSnapshotReaderConstruction } from './social-employment-runtime-snapshot-reader.js';

export const SOCIAL_OPERATING_CUSTODY_ROLES = Object.freeze({
  publisher: 'world_v2_social_source_publisher',
  reader: 'world_v2_social_source_reader',
});
export const SOCIAL_OPERATING_CUSTODY_PROPOSAL =
  'database/proposals/social-operating-custody.sql';
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const hash = (value: unknown) =>
  canonicalSha256(canonicalHashInput(value), sha);
type Row = Record<string, unknown>;
function invalid(reason: string): never {
  throw Error(`SOCIAL_OPERATING_CUSTODY: ${reason}`);
}
const SOURCE_REGISTRATION_LOCK_QUERY =
  'select world_id,country_id,registration_ref,seed_fingerprint,source_id,source_payload_hash,admission_ref,issuer_role,revision::text from world_v2.lock_social_operating_source($1,$2)';
type SourceDenialReason =
  | 'REGISTERED_SOURCE_UNAVAILABLE'
  | 'OPENING_ADMISSION_UNAVAILABLE'
  | 'OPENING_ADMISSION_REVOKED';
class SocialOperatingSourceUnavailable extends DomainError {
  override readonly cause: DatabaseError;
  constructor(
    readonly reason: SourceDenialReason,
    cause: DatabaseError,
  ) {
    super(
      DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
      `SOCIAL_OPERATING_SOURCE_UNAVAILABLE:${reason}`,
    );
    this.name = 'SocialOperatingSourceUnavailable';
    this.cause = cause;
  }
}
function sourceDenial(error: unknown): SourceDenialReason | null {
  // Interpret only actual PostgreSQL RAISE evidence from this fixed lock call.
  // Caller-shaped objects, ordinary errors, permission/network failures and
  // other SQLSTATE 55000 conditions remain operational failures.
  if (
    !(error instanceof DatabaseError) ||
    error.code !== '55000' ||
    error.severity !== 'ERROR'
  )
    return null;
  const known = {
    SOCIAL_SOURCE_NOT_REGISTERED_OR_REVOKED: [
      'REGISTERED_SOURCE_UNAVAILABLE',
      'lock_social_operating_source\\(text,text\\)',
    ],
    SOCIAL_REAL_IMMUTABLE_ADMISSION_REQUIRED: [
      'OPENING_ADMISSION_UNAVAILABLE',
      'social_source_admission\\(text\\)',
    ],
    SOCIAL_REAL_SIGNED_ADMISSION_REVOKED_OR_MISSING: [
      'OPENING_ADMISSION_REVOKED',
      'social_source_admission\\(text\\)',
    ],
  } as const;
  if (!Object.hasOwn(known, error.message)) return null;
  const [reason, routine] = known[error.message as keyof typeof known];
  return new RegExp(
    `(?:^|\\n)PL/pgSQL function (?:world_v2\\.)?${routine} line [0-9]+ at RAISE(?:\\n|$)`,
    'u',
  ).test(error.where ?? '')
    ? reason
    : null;
}
async function lockRegisteredSourceFrom(
  tx: SqlExecutor,
  world: string,
  country: string,
) {
  await tx.query('savepoint social_operating_source_lock');
  try {
    const result = await tx.query<Row>(SOURCE_REGISTRATION_LOCK_QUERY, [
      world,
      country,
    ]);
    await tx.query('release savepoint social_operating_source_lock');
    return result;
  } catch (error) {
    const reason = sourceDenial(error);
    if (reason === null || !(error instanceof DatabaseError)) throw error;
    // A PostgreSQL exception aborts its subtransaction. Recover that exact
    // lock scope so RoleScope can genuinely restore the writer before the
    // outer adapter confirms rollback and exposes the semantic denial.
    await tx.query('rollback to savepoint social_operating_source_lock');
    await tx.query('release savepoint social_operating_source_lock');
    throw new SocialOperatingSourceUnavailable(reason, error);
  }
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function ref(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(value)
  )
    invalid('canonical reference required');
  return value;
}
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
export const SOCIAL_CUSTODY_SESSION_QUERY = `select current_user as role_name,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication,
 current_setting('transaction_isolation') as isolation,current_setting('transaction_read_only') as read_only,
 pg_has_role(current_user,'world_v2_social_source_publisher','MEMBER') as publisher_member,
 pg_has_role(current_user,'world_v2_social_source_owner','MEMBER') as owner_member
 from pg_roles r where r.rolname=current_user`;
async function session(tx: SqlExecutor, expected: string) {
  const result = await tx.query<Row>(SOCIAL_CUSTODY_SESSION_QUERY),
    r = result.rows[0];
  if (
    result.rows.length !== 1 ||
    !r ||
    r.role_name !== expected ||
    r.rolsuper !== false ||
    r.rolbypassrls !== false ||
    r.rolcreaterole !== false ||
    r.rolcreatedb !== false ||
    r.rolreplication !== false ||
    r.owner_member !== false ||
    !['repeatable read', 'serializable'].includes(String(r.isolation)) ||
    r.read_only !== 'off' ||
    (expected === SOCIAL_OPERATING_CUSTODY_ROLES.reader &&
      r.publisher_member !== false)
  )
    invalid('fixed separated role and stable cooperating transaction required');
}
function sourceFrom(seed: OpeningSeed) {
  const view = readPostwarOperatingGenesisFromSeed(seed);
  if (!view.socialEmployment) invalid('canonical full E03 absent');
  const employment = validatePostwarSocialEmploymentStateDocument(
    view.socialEmployment,
  );
  const sources = seed.sources.filter(
    (s) =>
      (JSON.parse(s.canonicalPayload) as Row).schemaVersion ===
      'postwar-operating-genesis-seed-source-v1',
  );
  if (sources.length !== 1) invalid('exact source original required');
  return { view, employment, source: sources[0]! };
}
/** Only the fixed SQL publisher can register. All source identifiers, hashes and
 * originals come from the actual stored seed, never caller economic data. */
export function createPostgresSocialOperatingSourcePublisher(configuration: {
  readonly database: SqlDatabase;
}) {
  const opening = new WorldOpeningSeedStore({
    database: configuration.database,
    sha256Hex: sha,
  });
  return Object.freeze({
    /** One canonical full-E03 validation and one controlled SQL parse for the
     * complete country set. This is original registration, never command auth. */
    async registerWorldFrom(tx: SqlExecutor, selection: { worldId: string }) {
      await session(tx, SOCIAL_OPERATING_CUSTODY_ROLES.publisher);
      const world = ref(selection.worldId);
      const seed = await opening.loadFrom(tx, world);
      const original = sourceFrom(seed);
      const countries = new Set(
        original.employment.countries.map((c) => c.countryId),
      );
      const registered = await tx.query<Row>(
        'select world_id,country_id,registration_ref,seed_fingerprint,source_id,source_payload_hash,admission_ref,issuer_role,revision::text from world_v2.register_social_operating_source_world($1)',
        [world],
      );
      if (
        registered.rows.length !== countries.size ||
        new Set(registered.rows.map((r) => r.country_id)).size !==
          countries.size ||
        registered.rows.some(
          (r) =>
            r.world_id !== world ||
            !countries.has(String(r.country_id)) ||
            r.source_id !== original.source.sourceId ||
            r.source_payload_hash !== original.source.payloadHash ||
            r.seed_fingerprint !== seed.fingerprint ||
            r.issuer_role !== SOCIAL_OPERATING_CUSTODY_ROLES.publisher ||
            r.revision !== '1',
        )
      )
        invalid('SQL world issuer binding differs');
      return freeze({
        classification:
          'REGISTERED_ORIGINALS_NOT_COMMAND_AUTHORIZATION' as const,
        registrations: registered.rows,
      });
    },
    async registerFrom(
      tx: SqlExecutor,
      selection: { worldId: string; countryId: string },
    ) {
      await session(tx, SOCIAL_OPERATING_CUSTODY_ROLES.publisher);
      const world = ref(selection.worldId),
        country = ref(selection.countryId);
      const seed = await opening.loadFrom(tx, world),
        original = sourceFrom(seed);
      if (!original.employment.countries.some((c) => c.countryId === country))
        invalid('country absent from canonical source');
      const registered = await tx.query<Row>(
        'select world_id,country_id,registration_ref,seed_fingerprint,source_id,source_payload_hash,admission_ref,issuer_role,revision::text from world_v2.register_social_operating_source($1,$2)',
        [world, country],
      );
      const r = registered.rows[0];
      if (
        registered.rows.length !== 1 ||
        !r ||
        r.source_id !== original.source.sourceId ||
        r.source_payload_hash !== original.source.payloadHash ||
        r.seed_fingerprint !== seed.fingerprint ||
        r.issuer_role !== SOCIAL_OPERATING_CUSTODY_ROLES.publisher
      )
        invalid('SQL issuer binding differs');
      return freeze({
        ...r,
        classification: 'REGISTERED_ORIGINALS_NOT_COMMAND_AUTHORIZATION',
      });
    },
    async revokeFrom(
      tx: SqlExecutor,
      selection: { worldId: string; countryId: string; reasonRef: string },
    ) {
      await session(tx, SOCIAL_OPERATING_CUSTODY_ROLES.publisher);
      await tx.query(
        'select world_v2.revoke_social_operating_source($1,$2,$3)',
        [
          ref(selection.worldId),
          ref(selection.countryId),
          ref(selection.reasonRef),
        ],
      );
    },
  });
}

/** Concrete same-transaction SQL delegation, never synthesized head rows.
 * Only D's exact head-lock query is replaced by the fixed definer that checks
 * the same registered country/admission and locks/returns the actual H. */
export function createPostgresSocialOperatingLineageExecutor(
  tx: SqlExecutor,
  scope: { worldId: string; countryId: string },
): SqlExecutor {
  const world = ref(scope.worldId),
    country = ref(scope.countryId);
  return Object.freeze({
    async query<Row extends object>(
      statement: string,
      parameters: readonly unknown[] = [],
    ) {
      if (
        statement.replace(/\s+/gu, ' ').trim() ===
        'select world_version, event_sequence from world_v2.world_head where world_id = $1 for share'
      ) {
        if (parameters.length !== 1 || parameters[0] !== world)
          invalid('fixed source head-lock scope differs');
        return tx.query<Row>(
          'select world_version,event_sequence from world_v2.lock_social_operating_lineage_head($1,$2)',
          [world, country],
        );
      }
      return tx.query<Row>(statement, parameters);
    },
  });
}

/** Protected original reader for the position/offer publisher path. Unlike the
 * PLAN snapshot it does not require an already existing ACTIVE offer. The SQL
 * source/admission locks still survive until the caller's outer COMMIT. */
export function createPostgresSocialOperatingOriginalReader(configuration: {
  readonly database: SqlDatabase;
}) {
  const reader = new DurableV08LedgerLineageReader({
    database: configuration.database,
    sha256Hex: sha,
  });
  return Object.freeze({
    async withOriginalsFrom<Result>(
      tx: SqlExecutor,
      selection: { worldId: string; countryId: string },
      consume: (
        originals: Readonly<{
          lineage: Awaited<
            ReturnType<
              DurableV08LedgerLineageReader['readValidatedLineageFrom']
            >
          >;
          document: ReturnType<typeof sourceFrom>['employment'];
          source: ReturnType<typeof sourceFrom>['source'];
          registration: Row;
        }>,
      ) => Promise<Result>,
    ): Promise<Result> {
      await session(tx, SOCIAL_OPERATING_CUSTODY_ROLES.reader);
      const world = ref(selection.worldId),
        country = ref(selection.countryId);
      const lock = async () => {
        const result = await lockRegisteredSourceFrom(tx, world, country);
        if (
          result.rows.length !== 1 ||
          !result.rows[0] ||
          result.rows[0].issuer_role !==
            SOCIAL_OPERATING_CUSTODY_ROLES.publisher ||
          result.rows[0].revision !== '1'
        )
          invalid('real registered issuer/admission lock required');
        return result.rows[0];
      };
      const registration = await lock();
      const lineage =
        await DurableV08LedgerLineageReader.prototype.readValidatedLineageFrom.call(
          reader,
          createPostgresSocialOperatingLineageExecutor(tx, {
            worldId: world,
            countryId: country,
          }),
          world,
        );
      const original = sourceFrom(lineage.seed);
      if (
        registration.seed_fingerprint !== lineage.seed.fingerprint ||
        registration.source_id !== original.source.sourceId ||
        registration.source_payload_hash !== original.source.payloadHash ||
        !original.employment.countries.some((c) => c.countryId === country)
      )
        invalid('actual original registration/source/country differs');
      const result = await consume(
        Object.freeze({
          lineage,
          document: original.employment,
          source: original.source,
          registration,
        }),
      );
      if (!same(await lock(), registration))
        invalid('held original registration changed');
      await session(tx, SOCIAL_OPERATING_CUSTODY_ROLES.reader);
      return result;
    },
  });
}

/** Holds actual source/admission/permit row SHARE locks until the caller's outer
 * transaction settles. SQL publisher/revocation functions acquire conflicting
 * locks. Existing snapshot reader owns complete H-prefix semantic replay. */
export function createPostgresSocialOperatingCustody(configuration: {
  readonly database: SqlDatabase;
  readonly industryProtectedRead?: SocialEmploymentRuntimeSnapshotReaderConstruction['industryProtectedRead'];
}): Readonly<SocialOperatingCustodyPort> {
  const protectedRead = configuration.industryProtectedRead;
  if (
    protectedRead &&
    typeof protectedRead.historicalReadGuard.assertReadFrom !== 'function'
  )
    invalid('fixed Industry historical guard required');
  const profile = protectedRead
    ? (JSON.parse(
        canonicalSerialize({
          target: protectedRead.target,
          build: protectedRead.build,
        }),
      ) as {
        target: NonNullable<
          SocialEmploymentRuntimeSnapshotReaderConstruction['industryProtectedRead']
        >['target'];
        build: NonNullable<
          SocialEmploymentRuntimeSnapshotReaderConstruction['industryProtectedRead']
        >['build'];
      })
    : undefined;
  const reader = new DurableV08LedgerLineageReader({
    database: configuration.database,
    sha256Hex: sha,
    ...(protectedRead
      ? { industryReadGuard: protectedRead.historicalReadGuard }
      : {}),
  });
  return Object.freeze({
    async withSnapshotFrom<Result>(
      tx: SqlExecutor,
      suppliedRequest: Readonly<SocialOperatingSnapshotRequest>,
      consume: (snapshot: unknown) => Promise<Result>,
    ): Promise<Result> {
      const request: Readonly<SocialOperatingSnapshotRequest> = freeze(
        JSON.parse(canonicalSerialize(suppliedRequest)),
      );
      await session(tx, SOCIAL_OPERATING_CUSTODY_ROLES.reader);
      if (
        request.purpose !==
          'SOCIAL_EMPLOYMENT_SERVICE_PLAN_SOURCE_EVALUATION_V1' ||
        !same(request.requiredMaterialPaths, SOCIAL_SOURCE_MATERIAL_PATHS)
      )
        invalid('closed Social material purpose required');
      const locked = await lockRegisteredSourceFrom(
          tx,
          ref(request.publicationHead.worldId),
          ref(request.commandBinding.countryId),
        ),
        registration = locked.rows[0];
      if (
        locked.rows.length !== 1 ||
        !registration ||
        registration.issuer_role !== SOCIAL_OPERATING_CUSTODY_ROLES.publisher ||
        registration.revision !== '1'
      )
        invalid('real registered issuer/admission lock required');
      const industryContext = profile
        ? parseIndustryPersistenceSchemaBoundaryContext({
            schemaVersion: 'industry-persistence-schema-read-context-v1',
            purpose: 'INDUSTRY_PRODUCTION_CANONICAL_HISTORY_READ',
            worldId: request.publicationHead.worldId,
            expectedHead: {
              worldVersion: request.publicationHead.worldVersion,
              eventSequence: request.publicationHead.eventSequence,
            },
            target: profile.target,
            build: profile.build,
          })
        : undefined;
      if (
        industryContext !== undefined &&
        industryContext.schemaVersion !==
          'industry-persistence-schema-read-context-v1'
      )
        invalid(
          'Industry historical read context required; commit context is forbidden',
        );
      const lineage =
        await DurableV08LedgerLineageReader.prototype.readValidatedLineageFrom.call(
          reader,
          createPostgresSocialOperatingLineageExecutor(tx, {
            worldId: request.publicationHead.worldId,
            countryId: request.commandBinding.countryId,
          }),
          request.publicationHead.worldId,
          industryContext,
        );
      const { seed } = lineage,
        original = sourceFrom(seed);
      if (
        registration.seed_fingerprint !== seed.fingerprint ||
        registration.source_id !== original.source.sourceId ||
        registration.source_payload_hash !== original.source.payloadHash ||
        !same(request.publicationHead, {
          worldId: lineage.worldId,
          worldVersion: lineage.headWorldVersion,
          eventSequence: lineage.headEventSequence,
        }) ||
        !same(request.worldBinding, {
          seedId: seed.seedId,
          seedFingerprint: seed.fingerprint,
          modelVersion: seed.replayBinding.modelVersion,
          replayBindingFingerprint: hash(seed.replayBinding),
        })
      )
        invalid('current held canonical lineage/source differs');
      const countryIndex = original.employment.countries.findIndex(
          (c) => c.countryId === request.commandBinding.countryId,
        ),
        country = original.employment.countries[countryIndex];
      if (!country) invalid('country outside canonical source');
      const fullLifecycle = replayPostwarSocialEmploymentLineage({
        document: original.employment,
        lineage,
      });
      const lifecycle = fullLifecycle.countries.find(
        (c) => c.countryId === country.countryId,
      );
      if (!lifecycle) invalid('canonical country lifecycle absent');
      const offerIndex = lifecycle.lifecycle.offers.findIndex(
        (o) =>
          o.positionId === request.commandBinding.positionId &&
          o.locationId === request.commandBinding.locationId &&
          o.skill === request.commandBinding.skill &&
          o.state === 'ACTIVE',
      );
      // A REVOKED Core validation witness cannot create a vacancy or active offer.
      if (offerIndex < 0) invalid('no actual canonical vacancy offer');
      const offer = lifecycle.lifecycle.offers[offerIndex]!;
      const committedOrigin = lifecycle.offerOrigins.find(
        (o) => o.positionId === offer.positionId,
      );
      const bodyIndex = country.physicalDayBodies.findIndex(
        (b) =>
          b.locationId === request.commandBinding.locationId &&
          b.dayIndex === request.commandBinding.dueDayIndex &&
          b.pools.some(
            (p) =>
              p.poolId === request.commandBinding.servicePoolId &&
              p.skill === request.commandBinding.skill,
          ),
      );
      if (bodyIndex < 0) invalid('no existing finite physical day original');
      const body = country.physicalDayBodies[bodyIndex]!,
        headless = country.physicalOriginalBodies[bodyIndex];
      if (
        !headless ||
        Object.hasOwn(headless, 'headWorldVersion') ||
        Object.hasOwn(headless, 'headEventSequence') ||
        BigInt(request.commandBinding.simTime) >= 86400000n
      )
        invalid('initial day source expired or immutable body missing');
      const pointer = `/carrier/socialEmployment/countries/${countryIndex}`;
      const binding = {
        sourceId: original.source.sourceId,
        sourceRevision: '1',
        sourceFingerprint: original.source.payloadHash,
        ownerAdoptionRef: POSTWAR_OPERATING_USER_RECEIPT.reference,
        ownerAdoptionFingerprint: hash(POSTWAR_OPERATING_USER_RECEIPT),
        admissionRef: ref(registration.admission_ref),
        admissionRevision: '1',
      };
      const records: Row[] = [];
      const add = (
        suffix: string,
        role: SocialSourceRole,
        fieldPaths: readonly string[],
        sourcePointer: string,
        value: unknown,
        committedOrigin?: SocialOfferCommittedOrigin,
      ) => {
        const recordId = `SOCIAL_ORIGINAL_${sha(canonicalSerialize([registration.registration_ref, suffix])).toUpperCase()}`;
        const record = {
          schemaVersion: 'social-operating-source-record-v1',
          recordId,
          revision: '1',
          role,
          sourceBinding: binding,
          worldId: seed.worldId,
          fieldPaths: [...fieldPaths].sort(),
          semanticRevision: country.sourceRevision,
          value,
          effectivity: {
            fromSimTime: committedOrigin?.fromSimTime ?? '0',
            untilSimTime: '86400000',
            fromHead: committedOrigin?.fromHead ?? {
              worldVersion: '0',
              eventSequence: '0',
            },
            untilHead: null,
          },
          predecessorRevision: null,
          supersededByRevision: null,
          revokedAt: null,
          sourceUnits: ['SOCIAL-U0201', 'SOCIAL-U0210'],
          originProof: committedOrigin
            ? {
                kind: 'COMMITTED_EVENT_PAYLOAD',
                eventId: committedOrigin.eventId,
                pointer: committedOrigin.pointer,
                payloadHash: committedOrigin.payloadHash,
              }
            : {
                kind: 'ADMITTED_OPENING_SOURCE',
                sourceId: original.source.sourceId,
                pointer: sourcePointer,
                payloadHash: original.source.payloadHash,
              },
        };
        records.push(record);
        return record;
      };
      add(
        'GENESIS_REVISION',
        'GENESIS_HISTORICAL',
        ['/admittedGenesis/semanticRevision'],
        `${pointer}/sourceRevision`,
        country.sourceRevision,
      );
      add(
        'GENESIS_STATE',
        'GENESIS_HISTORICAL',
        ['/admittedGenesis/state'],
        `${pointer}/state`,
        country.state,
      );
      const facts = country.validationReadFacts.facts;
      add(
        'BOUNDARY',
        'CURRENT_EFFECTIVE',
        ['/currentReadFacts/boundary'],
        `${pointer}/validationReadFacts/facts/boundary`,
        facts.boundary,
      );
      add(
        'MINIMUM_WAGE',
        'CURRENT_EFFECTIVE',
        ['/currentReadFacts/minimumWage'],
        `${pointer}/validationReadFacts/facts/minimumWage`,
        facts.minimumWage,
      );
      add(
        'POPULATION',
        'CURRENT_EFFECTIVE',
        ['/currentReadFacts/populationAvailability'],
        `${pointer}/validationReadFacts/facts/populationAvailability`,
        facts.populationAvailability,
      );
      add(
        `OFFER_${offer.positionId}`,
        'CURRENT_EFFECTIVE',
        ['/currentReadFacts/offer'],
        `${pointer}/offers/${offerIndex}`,
        offer,
        committedOrigin,
      );
      // Retain all same-country day bodies, including the complete resource scope.
      country.physicalOriginalBodies.forEach((value, index) =>
        add(
          `BODY_${index}`,
          'PHYSICAL_ORIGINAL_BODY',
          ['/physicalAttemptEnvelope'],
          `${pointer}/physicalOriginalBodies/${index}`,
          value,
        ),
      );
      add(
        'ELIGIBILITY',
        'CURRENT_ELIGIBILITY',
        ['/physicalAttemptEnvelope'],
        `${pointer}/physicalOriginalBodies/${bodyIndex}`,
        headless,
      );
      records.sort((a, b) =>
        String(a.recordId) < String(b.recordId) ? -1 : 1,
      );
      const selected = (path: string) =>
        records.find(
          (r) =>
            (r.fieldPaths as string[]).includes(path) &&
            r.role !== 'CURRENT_ELIGIBILITY' &&
            (path !== '/physicalAttemptEnvelope' || same(r.value, headless)),
        )!;
      const graph = {
        schemaVersion: 'SOCIAL_RESOLVED_SOURCE_INPUT_V3',
        scope: {
          worldId: seed.worldId,
          countryId: country.countryId,
          commandId: request.commandBinding.commandId,
          commandFingerprint: request.commandBinding.commandFingerprint,
          headWorldVersion: lineage.headWorldVersion,
          headEventSequence: lineage.headEventSequence,
          simTime: request.commandBinding.simTime,
        },
        admittedGenesis: {
          openingSeedId: seed.seedId,
          openingSeedFingerprint: seed.fingerprint,
          modelVersion: seed.replayBinding.modelVersion,
          replayBinding: seed.replayBinding,
          socialSourceId: original.source.sourceId,
          socialSourcePayloadHash: original.source.payloadHash,
          semanticRevision: country.sourceRevision,
          adoptionBindingRef: binding.ownerAdoptionRef,
          state: country.state,
        },
        currentReadFacts: {
          ...facts,
          offer,
          simTime: request.commandBinding.simTime,
        },
        historyCoverage: {
          openingVersion: '0',
          heldHead: {
            worldVersion: lineage.headWorldVersion,
            eventSequence: lineage.headEventSequence,
          },
          taxonomyRevision: fullLifecycle.checkpoints.length
            ? 'SOCIAL_SOURCE_EFFECTS_V2'
            : 'SOCIAL_SOURCE_EFFECTS_V1',
          completePrefixBinding: hash({
            worldId: seed.worldId,
            seedFingerprint: seed.fingerprint,
            transitions: lineage.transitions,
          }),
          sourceRevisionSet: records.map((r) => ({
            recordId: r.recordId,
            revision: r.revision,
            payloadHash: hash(r),
            role: r.role,
            fieldPaths: r.fieldPaths,
            revocationRevision: null,
          })),
        },
        sourceWitnesses: SOCIAL_SOURCE_MATERIAL_PATHS.map((fieldPath) => {
          const r = selected(fieldPath);
          return {
            fieldPath,
            sourceId: binding.sourceId,
            sourceRevision: '1',
            locator: original.source.locator,
            payloadHash: hash(r),
            pointer: '/value',
            effectiveBindingRef: ref(registration.registration_ref),
            adoptionOrCommitBindingRef: binding.ownerAdoptionRef,
            role: r.role,
            effectiveFromSimTime: String((r.effectivity as Row).fromSimTime),
            effectiveUntilSimTime: '86400000',
            predecessorRevision: null,
            supersededByRevision: null,
            revokedByRevision: null,
          };
        }),
        physicalAttemptEnvelope: {
          ...body,
          headWorldVersion: lineage.headWorldVersion,
          headEventSequence: lineage.headEventSequence,
        },
      };
      const bytes = records.map((r) => ({
        recordId: String(r.recordId),
        revision: '1',
        bytes: new TextEncoder().encode(canonicalSerialize(r)),
      }));
      const content = {
        manifestId: ref(registration.registration_ref),
        revision: '1',
        purpose: request.purpose,
        publicationHead: request.publicationHead,
        commandBinding: request.commandBinding,
        entries: bytes.map((b, index) => ({
          recordId: b.recordId,
          revision: '1',
          rawByteLength: String(b.bytes.length),
          rawSHA256: sha(new TextDecoder().decode(b.bytes)),
          role: records[index]!.role,
          fieldPaths: records[index]!.fieldPaths,
        })),
      };
      const snapshot = freeze({
        schemaVersion: 'social-operating-custodied-snapshot-v1',
        publicationHead: request.publicationHead,
        worldBinding: request.worldBinding,
        sourceAuthority: {
          issuerId: SOCIAL_OPERATING_CUSTODY_ROLES.publisher,
          custodianId: SOCIAL_OPERATING_CUSTODY_ROLES.reader,
          ...binding,
        },
        manifest: {
          ...content,
          contentFingerprint: hash({
            schemaVersion: 'SOCIAL_OPERATING_ORIGINAL_MANIFEST_CONTENT_V1',
            ...content,
          }),
        },
        graphBytes: canonicalSerialize(graph),
        records: bytes,
      });
      const result = await consume(snapshot);
      // Recheck the same originals, admission and append-only revocation predicates.
      // The outer atomic operation may advance H; do not mistake its own H advance for a source revision.
      const after = await tx.query<Row>(
        'select world_id,country_id,registration_ref,seed_fingerprint,source_id,source_payload_hash,admission_ref,issuer_role,revision::text from world_v2.lock_social_operating_source($1,$2)',
        [seed.worldId, country.countryId],
      );
      if (after.rows.length !== 1 || !same(after.rows[0], registration))
        invalid('source changed before outer commit');
      await session(tx, SOCIAL_OPERATING_CUSTODY_ROLES.reader);
      return result;
    },
  });
}
