import { observePostwarSocialMaterialization } from './postwar-social-materialization.js';
import type { PreparedPostwarSocialSource } from './prepared-postwar-social-source.js';
/** Fixed local/host construction for lawful GOV position + offer creation.
 * Reads registered originals and full prefix, never request-supplied wages,
 * balances, Ready flags or authorization DTOs. No production registration. */
import { createHash } from 'node:crypto';
import {
  SOCIAL_POSITION_OFFER_CREATE_COMMAND,
  SOCIAL_POSITION_OFFER_CREATED_EVENT,
  SOCIAL_POSITION_OFFER_POLICY,
  parseSocialPositionOfferCreateIntent,
  prepareAuthorizedSocialPositionOfferCreate,
  authorizeOfficeCapability,
  canonicalSerialize,
  canonicalHashInput,
  canonicalSha256,
  Money,
  parseAuthoritativeEvent,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createWorldWriterCommitAssertion,
  parseWorldWriterLease,
  teamId,
  officeId,
  validateCanonicalCommand,
  bindAuthoritativeTransition,
  isCommitAuthorizationProof,
  type AuthorizedOfficeContext,
  type AuthenticatedPrincipal,
  type CanonicalCommand,
  type CommitAuthorizationProof,
  type DecisionResultHead,
  type AuthoritativeTransition,
  type SocialPositionOfferReadFacts,
} from '@econmind/core';
import {
  SOCIAL_OPERATING_CUSTODY_ROLES,
  createPostgresSocialOperatingOriginalReader,
} from './postgres-social-operating-custody.js';
import { replayPostwarSocialEmploymentLineage } from './postwar-social-employment-lineage.js';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import {
  WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY,
  WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY,
} from './worker-authorization-sql.js';
import type {
  AtomicTransitionCandidateFactory,
  AtomicTransitionDraft,
} from './atomic-transition-repository.js';
import type { FinanceNativeBudgetCapacityEncumbrance } from '@econmind/core/finance-budget-native';
import { SOCIAL_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY } from './social-intake-authorization.js';
export const SOCIAL_POSITION_SOURCE_PURPOSE =
  'SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_SOURCE_EVALUATION_V1' as const;
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), digest);
function invalid(reason: string): never {
  throw Error(`POSTWAR_SOCIAL_POSITION_RUNTIME:${reason}`);
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
export interface SocialPositionSourceReadBinding {
  readonly schemaVersion: 'social-position-offer-source-read-binding-v1';
  readonly purpose: typeof SOCIAL_POSITION_SOURCE_PURPOSE;
  readonly commandFingerprint: string;
  readonly readHead: DecisionResultHead;
  readonly seedFingerprint: string;
  readonly registrationRef: string;
  readonly admissionRef: string;
  readonly sourceId: string;
  readonly sourcePayloadHash: string;
  readonly completePrefixFingerprint: string;
  readonly lifecycleStateHash: string;
  readonly readFactsHash: string;
  readonly socialAuthorization: Readonly<{
    subject: string;
    team: string;
    revision: string;
  }>;
  readonly financeAuthorization: Readonly<{
    subject: string;
    team: string;
    revision: string;
  }>;
}
export interface SocialPositionSourceCommitRequest {
  readonly phase: 'BEFORE_EVENTS';
  readonly purpose: typeof SOCIAL_POSITION_SOURCE_PURPOSE;
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly currentHead: DecisionResultHead;
  readonly observedAtReal: string;
  readonly readBinding: unknown;
  readonly commitAuthorization: CommitAuthorizationProof;
}
export interface SocialPositionSourceCommitAudit {
  readonly status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY';
  readonly purpose: typeof SOCIAL_POSITION_SOURCE_PURPOSE;
  readonly commandFingerprint: string;
  readonly currentHead: DecisionResultHead;
  readonly readBindingFingerprint: string;
  readonly protectionMode: 'HELD_SOURCE_GUARDS';
}
const issuedSourcePorts = new WeakSet<object>();
export function isPostwarSocialPositionSourceCommitProtectionPort(
  value: unknown,
): value is SocialPositionSourceCommitProtectionPort {
  return (
    typeof value === 'object' && value !== null && issuedSourcePorts.has(value)
  );
}
export interface SocialPositionSourceCommitProtectionPort {
  assertCurrentFrom(
    tx: SqlExecutor,
    request: Readonly<SocialPositionSourceCommitRequest>,
  ): Promise<Readonly<SocialPositionSourceCommitAudit>>;
}
/** The audit anchor is the already authenticated durable command subject. All
 * membership/identity resolution is the actual transaction's fixed SQL source. */
async function currentAuthorization(
  tx: SqlExecutor,
  command: CanonicalCommand,
  office: 'SOCIAL' | 'FINANCE',
  roles?: ReturnType<typeof createPostwarSocialSourceRoleScope>,
): Promise<AuthorizedOfficeContext> {
  const capability = office === 'SOCIAL' ? 'SOCIAL_LABOUR' : 'FINANCE_BUDGET';
  const resolve = async () => {
    const parameters = [
      command.worldId,
      command.authSubject,
      command.countryId,
      office,
      capability,
    ];
    const r = roles
      ? await roles.withSourceReaderFrom(tx, () =>
          tx.query<{ team_id: string; authorization_version: string }>(
            'select team_id,authorization_version from world_v2.lock_social_operating_current_authorization($1,$2,$3::uuid,$4,$5)',
            [
              command.worldId,
              command.countryId,
              command.authSubject,
              office,
              capability,
            ],
          ),
        )
      : await tx.query<{
          team_id: string;
          authorization_version: string;
        }>(
          `select a.team_id,a.authorization_version from world_v2.current_commit_authorization a
      where a.world_id=$1 and a.auth_subject=$2::uuid and a.country_id=$3 and a.office_id=$4 and a.capability=$5 and a.active
      and not exists(select 1 from world_v2.current_commit_authorization conflict where conflict.world_id=a.world_id and conflict.auth_subject=a.auth_subject and conflict.active and (conflict.country_id is distinct from a.country_id or conflict.team_id is distinct from a.team_id or conflict.authorization_version is distinct from a.authorization_version))`,
          parameters,
        );
    if (r.rows.length !== 1 || !r.rows[0]) return null;
    return {
      authSubject: command.authSubject,
      worldId: command.worldId,
      countryId: command.countryId,
      teamId: teamId(r.rows[0].team_id),
      authorizationVersion: r.rows[0].authorization_version,
      officeAssignments: [officeId(office)],
      active: true,
      suspended: false,
      isWorldAdmin: false,
      negotiationPartyIds: [],
    };
  };
  const principal: AuthenticatedPrincipal = {
    authSubject: command.authSubject,
    facts: {
      user_id: command.authSubject,
      display_name: null,
      school_id: null,
    },
    token: {
      subject: command.authSubject,
      issuer: 'urn:world-v2:durable-command-audit',
      audience: 'world-worker',
      issuedAt: command.submittedAtReal,
      expiresAt: command.submittedAtReal,
    },
  };
  return authorizeOfficeCapability({
    principal,
    resolver: {
      resolveCurrentIdentity: async () =>
        (await resolve()) ? command.authSubject : null,
      resolveCurrentMembership: resolve,
    },
    worldId: command.worldId,
    requestedCountryId: command.countryId,
    requestedOfficeId: officeId(office),
    capability,
  });
}
function capturedCommand(command: CanonicalCommand) {
  const c = validateCanonicalCommand(command, digest);
  if (
    c.commandType !== SOCIAL_POSITION_OFFER_CREATE_COMMAND ||
    c.officeId !== 'SOCIAL' ||
    c.countryId === null ||
    c.expectedWorldVersion === null
  )
    invalid('exact funded Social position command required');
  return c;
}
/** Stable outer transaction only. The actual writer role is unchanged. */
export function createPostwarSocialPositionRuntimeDatabase(
  database: SqlDatabase,
  configuration: { readonly workerRole: string },
): SqlDatabase {
  const roles = createPostwarSocialSourceRoleScope(configuration);
  return Object.freeze({
    query: database.query.bind(database),
    transaction: <Result>(consume: (tx: SqlExecutor) => Promise<Result>) =>
      database.transaction(async (tx) => {
        await tx.query('set transaction isolation level repeatable read');
        const scoped: SqlExecutor = Object.freeze({
          async query<Row extends object>(
            statement: string,
            args: readonly unknown[] = [],
          ) {
            if (
              statement === SOCIAL_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY &&
              args[3] === 'SOCIAL'
            ) {
              if (
                args.length !== 5 ||
                args[4] !== 'SOCIAL_LABOUR' ||
                args.some((v) => typeof v !== 'string')
              )
                invalid('fixed Social manual claim parameters differ');
              return roles.withSourceReaderFrom(tx, () =>
                tx.query<Row>(
                  'select team_id,authorization_version from world_v2.lock_social_operating_current_authorization($1,$2,$3::uuid,$4,$5)',
                  [args[0], args[2], args[1], args[3], args[4]],
                ),
              );
            }
            if (
              statement === WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY ||
              statement === WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY
            ) {
              const positive =
                statement === WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY;
              if (
                args.length !== (positive ? 5 : 4) ||
                args.some((v) => typeof v !== 'string')
              )
                invalid('fixed authority lock parameters differ');
              return roles.withSourceReaderFrom(tx, () =>
                tx.query<Row>(
                  positive
                    ? 'select auth_subject,world_id,country_id,office_id,capability,team_id,authorization_version from world_v2.lock_social_operating_current_authorization($1,$2,$3::uuid,$4,$5)'
                    : 'select 1 from world_v2.lock_social_operating_active_office($1,$2,$3::uuid,$4)',
                  [
                    args[0],
                    args[2],
                    args[1],
                    args[3],
                    ...(positive ? [args[4]] : []),
                  ],
                ),
              );
            }
            return tx.query<Row>(statement, args);
          },
        });
        return consume(scoped);
      }),
  });
}

/** Fixed host role delegation, not a GRANT. The source reader never receives
 * economic writes. Locks survive the finally-restoration to the same writer. */
export function createPostwarSocialSourceRoleScope(configuration: {
  readonly workerRole: string;
}) {
  const role = configuration.workerRole;
  if (
    !/^[a-z][a-z0-9_]{0,62}$/u.test(role) ||
    [
      'postgres',
      'anon',
      'authenticated',
      'service_role',
      'world_v2_api_reader',
      'world_v2_api_login',
      ...Object.values(SOCIAL_OPERATING_CUSTODY_ROLES),
      'world_v2_social_source_owner',
    ].includes(role)
  )
    invalid('separated fixed worker role required');
  const assertWorker = async (tx: SqlExecutor) => {
    const r = (
      await tx.query<Record<string, unknown>>(
        `select current_user as role_name,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication,pg_has_role(current_user,'world_v2_social_source_reader','MEMBER')as source_member,pg_has_role(current_user,'world_v2_social_source_owner','MEMBER')as owner_member,pg_has_role(current_user,'world_v2_social_source_publisher','MEMBER')as publisher_member from pg_roles r where r.rolname=current_user`,
      )
    ).rows;
    if (
      r.length !== 1 ||
      !r[0] ||
      r[0].role_name !== role ||
      r[0].rolsuper !== false ||
      r[0].rolbypassrls !== false ||
      r[0].rolcreaterole !== false ||
      r[0].rolcreatedb !== false ||
      r[0].rolreplication !== false ||
      r[0].source_member !== true ||
      r[0].owner_member !== false ||
      r[0].publisher_member !== false
    )
      invalid('actual separated worker/source role delegation required');
  };
  return Object.freeze({
    async withSourceReaderFrom<Result>(
      tx: SqlExecutor,
      consume: () => Promise<Result>,
    ): Promise<Result> {
      await assertWorker(tx);
      await tx.query(`set local role ${SOCIAL_OPERATING_CUSTODY_ROLES.reader}`);
      let outcome: { ok: true; value: Result } | { ok: false; error: unknown };
      try {
        outcome = { ok: true, value: await consume() };
      } catch (error) {
        outcome = { ok: false, error };
      }
      // Always restore after either synchronous/asynchronous consumer failure.
      // Propagate only after restoration, preserving both errors if it fails.
      try {
        await tx.query(`set local role ${role}`);
        await assertWorker(tx);
      } catch (restore) {
        if (!outcome.ok)
          throw new AggregateError(
            [outcome.error, restore],
            'source role restoration failed; outer transaction must rollback',
            { cause: restore },
          );
        throw restore;
      }
      if (!outcome.ok) throw outcome.error;
      return outcome.value;
    },
  });
}
/** Pure DTO projection only, never source admission or a budget grant. The
 * caller is the held-originals runtime after complete shared Core replay.
 * A LINE spends its envelope's capacity and creates no additional cap here. */
export function projectPostwarSocialBudgetReservations(
  caps: readonly FinanceNativeBudgetCapacityEncumbrance[],
  funding: Readonly<{
    accountRef: string;
    countryId: string;
    claimId: string;
    payerEntityId: string;
    payerRole: string;
    currency: string;
  }>,
) {
  if (funding.payerRole !== 'GOV')
    invalid('actual GOV Budget capacity required');
  const seen = new Set<string>();
  return Object.freeze(
    caps
      .filter((cap) => cap.accountId === funding.accountRef)
      .map((cap) => {
        if (
          cap.countryId !== funding.countryId ||
          cap.claimId !== funding.claimId ||
          cap.governmentEntityId !== funding.payerEntityId ||
          cap.currency !== funding.currency ||
          seen.has(cap.reference)
        )
          invalid(
            'exact unique canonical Budget capacity account and owner required',
          );
        seen.add(cap.reference);
        return Object.freeze({
          reservationId: cap.reference,
          sourceRef: cap.eventId,
          amount: Money.from(cap.amount, cap.currency).toCanonicalValue()
            .amount,
        });
      }),
  );
}
export function createPostwarSocialPositionRuntime(configuration: {
  readonly preparedSource?: PreparedPostwarSocialSource;
  readonly database: SqlDatabase;
  readonly workerId: string;
  readonly workerRole: string;
}) {
  const roles = createPostwarSocialSourceRoleScope(configuration);
  const originals = createPostgresSocialOperatingOriginalReader(configuration);
  const durable = new DurableV08LedgerLineageReader({
    database: configuration.database,
    sha256Hex: digest,
  });
  const deriveFrom = async (tx: SqlExecutor, command: CanonicalCommand) => {
    const source = await roles.withSourceReaderFrom(tx, () =>
      originals.withOriginalsFrom(
        tx,
        { worldId: command.worldId, countryId: command.countryId! },
        async (value) => value,
      ),
    );
    const { lineage, document, registration } = source;
    if (lineage.headWorldVersion !== command.expectedWorldVersion)
      invalid('stale actual source prefix');
    if (command.simTime.ticks >= 86400000n)
      invalid(
        'opening wage/funding/service source expired after its initial simulation day',
      );
    if (
      lineage.transitions.some((t) =>
        t.transition.events.some(
          (e) => e.simTime.ticks > command.simTime.ticks,
        ),
      )
    )
      invalid('command precedes actual committed prefix');
    const intent = parseSocialPositionOfferCreateIntent(
      JSON.parse(command.canonicalPayload),
    );
    const replay = replayPostwarSocialEmploymentLineage({
      document,
      lineage,
    });
    const country = replay.countries.find(
      (c) => c.countryId === command.countryId,
    );
    const originalCountry = document.countries.find(
      (c) => c.countryId === command.countryId,
    );
    const wage = document.inputs.labour.positions.find(
      (p) => p.positionId === intent.wageScheduleRef,
    );
    const funding = document.inputs.fundingAccounts.find(
      (a) =>
        a.accountRef === intent.fundingAccountId &&
        a.countryId === command.countryId &&
        a.payerRole === 'GOV',
    );
    if (
      !country ||
      !originalCountry ||
      !wage ||
      !funding ||
      wage.countryId !== command.countryId ||
      wage.owner !== 'PUBLIC_SERVICE' ||
      wage.employerRole !== 'GOV' ||
      wage.employerId !== funding.payerEntityId ||
      wage.skill !== intent.skill ||
      wage.classificationId !== intent.publicService ||
      wage.occupation !== intent.occupation ||
      wage.wagePeriod !== 'SIM_YEAR'
    )
      invalid('actual GOV wage schedule/funding scope missing');
    const position = lineage.ledgers.financial.positions.find(
      (p) => p.account.accountId === funding.accountRef,
    );
    if (!position) invalid('actual canonical TGA asset missing');
    const budgetReservations = projectPostwarSocialBudgetReservations(
      replay.budgetEncumbrances,
      funding,
    );
    const { offer: _validationOnlyOffer, ...employment } =
      originalCountry.validationReadFacts.facts;
    void _validationOnlyOffer;
    const facts: SocialPositionOfferReadFacts = {
      policyVersion: SOCIAL_POSITION_OFFER_POLICY,
      sourceRevision: document.sourceRevision,
      governmentEntityId: funding.payerEntityId,
      centralBankEntityId: funding.issuerEntityId,
      employment: {
        ...employment,
        simTime: command.simTime.toCanonicalValue(),
      },
      wageSchedule: {
        scheduleId: wage.positionId,
        countryId: wage.countryId,
        skill: wage.skill,
        publicService: intent.publicService,
        occupation: wage.occupation,
        amount: Money.from(
          wage.wageAmount,
          wage.wageCurrency,
        ).toCanonicalValue().amount,
        currency: wage.wageCurrency,
        period: wage.wagePeriod,
        wageVersion: wage.wageVersion,
        validFromDayIndex: originalCountry.minimumWage.validFromDayIndex,
        validUntilDayIndex: originalCountry.minimumWage.validUntilDayIndex,
      },
      funding: {
        accountId: funding.accountRef,
        countryId: funding.countryId,
        ownerId: funding.payerEntityId,
        currency: funding.currency,
        liquidBalance: Money.from(
          position.netDebitBalance.toCanonicalValue().amount,
          funding.currency,
        ).toCanonicalValue().amount,
        priorReservations: [
          {
            reservationId: `POSTWAR_OPENING_RESERVED_${funding.accountRef}`,
            sourceRef: funding.sourceBalanceRef,
            amount: Money.from(
              funding.reservedAmount,
              funding.currency,
            ).toCanonicalValue().amount,
          },
          ...budgetReservations,
        ],
      },
    };
    const social = await currentAuthorization(tx, command, 'SOCIAL', roles),
      finance = await currentAuthorization(tx, command, 'FINANCE', roles);
    const operation = await prepareAuthorizedSocialPositionOfferCreate({
      command,
      state: country.lifecycle,
      readFacts: facts,
      sha256Hex: digest,
      socialAuthorization: social,
      financeAuthorization: finance,
      financialLedger: lineage.ledgers.financial,
    });
    if (operation.source !== 'APPLIED')
      invalid('a committed position cannot become a fresh candidate');
    const binding: SocialPositionSourceReadBinding = freeze({
      schemaVersion: 'social-position-offer-source-read-binding-v1',
      purpose: SOCIAL_POSITION_SOURCE_PURPOSE,
      commandFingerprint: command.fingerprint,
      readHead: {
        worldId: lineage.worldId,
        worldVersion: lineage.headWorldVersion,
        eventSequence: lineage.headEventSequence,
      },
      seedFingerprint: lineage.seed.fingerprint,
      registrationRef: String(registration.registration_ref),
      admissionRef: String(registration.admission_ref),
      sourceId: source.source.sourceId,
      sourcePayloadHash: source.source.payloadHash,
      completePrefixFingerprint: hash(lineage.transitions),
      lifecycleStateHash: hash(country.lifecycle),
      readFactsHash: hash(facts),
      socialAuthorization: {
        subject: social.authSubject,
        team: social.teamId,
        revision: social.authorizationVersion,
      },
      financeAuthorization: {
        subject: finance.authSubject,
        team: finance.teamId,
        revision: finance.authorizationVersion,
      },
    });
    return { operation, binding, lineage };
  };
  const sourceCommitProtectionPort: SocialPositionSourceCommitProtectionPort =
    Object.freeze({
      async assertCurrentFrom(
        tx: SqlExecutor,
        request: Readonly<SocialPositionSourceCommitRequest>,
      ): Promise<Readonly<SocialPositionSourceCommitAudit>> {
        const command = capturedCommand(request.command);
        if (
          request.phase !== 'BEFORE_EVENTS' ||
          request.purpose !== SOCIAL_POSITION_SOURCE_PURPOSE ||
          !isCommitAuthorizationProof(request.commitAuthorization) ||
          request.commitAuthorization.commandFingerprint !==
            command.fingerprint ||
          request.commitAuthorization.capability !== 'SOCIAL_LABOUR'
        )
          invalid(
            'exact independent source purpose and genuine Social commit proof required',
          );
        bindAuthoritativeTransition(
          { command, transition: request.transition },
          digest,
        );
        const fresh = await deriveFrom(tx, command);
        if (
          request.commitAuthorization.authSubject !==
            fresh.binding.socialAuthorization.subject ||
          request.commitAuthorization.teamId !==
            fresh.binding.socialAuthorization.team ||
          request.commitAuthorization.authorizationVersion !==
            fresh.binding.socialAuthorization.revision
        )
          invalid('Social commit proof differs from held dual authorization');
        if (
          !same(request.currentHead, fresh.binding.readHead) ||
          !same(request.readBinding, fresh.binding) ||
          request.transition.events.length !== 1 ||
          request.transition.events[0]!.eventType !==
            SOCIAL_POSITION_OFFER_CREATED_EVENT ||
          request.transition.events[0]!.canonicalPayload !==
            canonicalSerialize(fresh.operation.eventPayload)
        )
          invalid(
            'candidate source/dual authorization/current prefix differs at commit cutoff',
          );
        return freeze({
          status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY',
          purpose: SOCIAL_POSITION_SOURCE_PURPOSE,
          commandFingerprint: command.fingerprint,
          currentHead: request.currentHead,
          readBindingFingerprint: hash(fresh.binding),
          protectionMode: 'HELD_SOURCE_GUARDS',
        });
      },
    });
  const candidateFactory: AtomicTransitionCandidateFactory = Object.freeze({
    async prepare(
      input: Parameters<AtomicTransitionCandidateFactory['prepare']>[0],
    ) {
      const command = capturedCommand(input.command);
      if (
        !isCommitAuthorizationProof(input.commitAuthorization) ||
        input.commitAuthorization.capability !== 'SOCIAL_LABOUR' ||
        input.commitAuthorization.commandFingerprint !== command.fingerprint
      )
        invalid('genuine command-bound commit authorization required');
      return configuration.database.transaction(async (tx) => {
        await tx.query(
          'select command_id from world_v2.command_submission where world_id=$1 and command_id=$2 for update',
          [command.worldId, command.commandId],
        );
        if (
          !same(
            await durable.readCommandFrom(
              tx,
              command.worldId,
              command.commandId,
            ),
            command,
          )
        )
          invalid('actual durable submission differs');
        const leaseRows = await tx.query<Record<string, unknown>>(
          'select world_id,holder_id,fencing_token::text,acquired_at_real,renewed_at_real,lease_expires_at_real from world_v2.world_writer_lease where world_id=$1 and holder_id=$2 and lease_expires_at_real>$3::timestamptz for share',
          [command.worldId, configuration.workerId, input.observedAtReal],
        );
        if (leaseRows.rows.length !== 1 || !leaseRows.rows[0])
          invalid('actual active writer lease required');
        const l = leaseRows.rows[0];
        const time = (v: unknown) =>
          v instanceof Date ? v.toISOString() : String(v);
        const lease = parseWorldWriterLease({
          schemaVersion: 'world-writer-lease-v1',
          worldId: String(l.world_id),
          holderId: String(l.holder_id),
          fencingToken: String(l.fencing_token),
          acquiredAtReal: time(l.acquired_at_real),
          renewedAtReal: time(l.renewed_at_real),
          expiresAtReal: time(l.lease_expires_at_real),
        });
        const fresh = await deriveFrom(tx, command);
        const q = await tx.query<Record<string, unknown>>(
          'select authority_kind,queue_state,claimed_by,claim_fencing_token::text,available_at_sim_time::text from world_v2.command_queue where world_id=$1 and command_id=$2 for share',
          [command.worldId, command.commandId],
        );
        if (
          q.rows.length !== 1 ||
          q.rows[0]!.authority_kind !== 'DISCRETIONARY_USER' ||
          q.rows[0]!.queue_state !== 'CLAIMED' ||
          q.rows[0]!.claimed_by !== lease.holderId ||
          q.rows[0]!.claim_fencing_token !== lease.fencingToken ||
          BigInt(String(q.rows[0]!.available_at_sim_time)) >
            command.simTime.ticks
        )
          invalid('actual claimed discretionary queue/fence required');
        const event = parseAuthoritativeEvent(
          {
            schemaVersion: 'event-v1',
            eventId: `SOCIAL_POSITION_EVENT_${command.commandId}`,
            eventType: SOCIAL_POSITION_OFFER_CREATED_EVENT,
            worldId: command.worldId,
            causationCommandId: command.commandId,
            correlationId: command.correlationId,
            worldVersion: (
              BigInt(command.expectedWorldVersion!) + 1n
            ).toString(),
            sequence: (BigInt(fresh.lineage.headEventSequence) + 1n).toString(),
            simTime: command.simTime.toCanonicalValue(),
            recordedAtReal: input.observedAtReal,
            correctsEventId: null,
            payload: fresh.operation.eventPayload,
          },
          digest,
        );
        const transition = createAuthoritativeTransition({
          command,
          worldVersionBefore: command.expectedWorldVersion!,
          worldVersionAfter: event.worldVersion,
          events: [event],
        });
        const materializationObservation =
          await observePostwarSocialMaterialization({
            executor: tx,
            lineage: fresh.lineage,
            countryId: command.countryId!,
            kind: 'POSITION',
          });
        const draft: AtomicTransitionDraft & {
          readonly officeOperatingSourceReadBinding: SocialPositionSourceReadBinding;
        } = freeze({
          transition,
          inventoryPostings: [],
          financialPostingBatches: [],
          receipt: createFinalCommandReceipt({
            command,
            outcome: 'COMMITTED',
            reasonCode: null,
            transition,
            simTime: command.simTime,
            recordedAtReal: input.observedAtReal,
          }),
          outboxMessages: [],
          currentMaterializations: [
            {
              key: `SOCIAL_POSITION_LIFECYCLE_${command.countryId}`,
              payload: fresh.operation.state,
              observation: materializationObservation,
            },
          ],
          authorityKind: 'DISCRETIONARY_USER',
          commitAssertion: createWorldWriterCommitAssertion(
            lease,
            command.expectedWorldVersion!,
          ),
          observedAtReal: input.observedAtReal,
          officeOperatingSourceReadBinding: fresh.binding,
        });
        return draft;
      });
    },
  });
  issuedSourcePorts.add(sourceCommitProtectionPort);
  return Object.freeze({
    candidateFactory,
    sourceCommitProtectionPort,
    /** Pre-claim source/dual-authorization check only; issues no lease or proof. */
    async assertSourceBeforeClaim(request: {
      readonly command: CanonicalCommand;
      readonly observedAtReal: string;
    }): Promise<void> {
      const command = capturedCommand(request.command);
      if (
        !Number.isFinite(Date.parse(request.observedAtReal)) ||
        new Date(request.observedAtReal).toISOString() !==
          request.observedAtReal ||
        Date.parse(request.observedAtReal) < Date.parse(command.submittedAtReal)
      )
        invalid('valid current pre-claim observation required');
      await configuration.database.transaction(async (tx) => {
        await deriveFrom(tx, command);
      });
    },
    authorizeIntake(command: CanonicalCommand) {
      return currentAuthorization(
        configuration.database,
        capturedCommand(command),
        'SOCIAL',
      );
    },
  });
}
