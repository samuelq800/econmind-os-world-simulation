/** One isolated Social office. Commands, events and both ledgers remain the original truth. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import * as C from '@econmind/core';
import {
  PostgresSqlDatabase,
  PostgresTransactionError,
} from './postgres-sql-database.js';
import type { SqlExecutor } from './sql-database.js';
import { withSocialOfficeSimulatedTransaction } from './social-office-resource-protection.js';
import { readFinalReceiptFrom } from './atomic-transition-repository.js';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import {
  withValidatedCanonicalLineageFrom,
  readValidatedCanonicalLineageFrom,
} from './validated-canonical-lineage.js';
import {
  readSocialOfficeExecutionIdentity,
  socialOfficeExecutionIdentityFromPublication,
  replaySocialOfficeDurableGroups,
  type SocialOfficeLineageIdentity,
} from './social-office-simulated-lineage.js';
import { readSocialOfficeSimulatedRevisionFrom } from './social-office-simulated-source-custody.js';
import {
  bindSocialOfficeSimulatedReadFacts,
  SOCIAL_DEMO_EXECUTION_IDENTITY_V1 as ORIGINAL,
} from '../social-office-demo/source-facts.js';

export interface SocialOfficeSimulatedRepositoryConfig {
  readonly database: PostgresSqlDatabase;
  readonly schemaVersion: 'social-office-simulated-repository-v1';
  readonly sourceClass: 'SIMULATED_OPENING';
  readonly selectionFingerprint: string;
  readonly identity: {
    readonly simulationId: string;
    readonly worldId: string;
    readonly countryId: string;
    readonly locationId: string;
  };
  readonly seed: {
    readonly seedId: string;
    readonly seedFingerprint: C.CanonicalSha256;
  };
  readonly worker: { readonly holderId: string; readonly fencingToken: string };
  readonly manual: {
    readonly authSubject: string;
    readonly actorId: string;
    readonly expectedIssuer: string;
    readonly expectedAudience: string;
  };
  readonly publisher: {
    readonly issuerRef: string;
    readonly publisherVersion: string;
    readonly actorId: string;
    readonly authSubject: string;
    readonly ruleVersion: string;
  };
}
export type SocialOfficeAtomicResult = Readonly<
  | { status: 'FINAL'; receipt: C.FinalCommandReceipt }
  | {
      status: 'QUEUED' | 'PENDING';
      commandId: string;
      commandFingerprint: C.CanonicalSha256;
    }
  | {
      status: 'UNKNOWN';
      commandId: string;
      commandFingerprint: C.CanonicalSha256;
      retryable: false;
    }
>;
export interface SocialOfficeSimulatedProjection {
  readonly schemaVersion: string;
  readonly sourceClass: string;
  readonly scope: SocialOfficeSimulatedRepositoryConfig['identity'];
  readonly head: {
    readonly worldVersion: string;
    readonly eventSequence: string;
  };
  readonly source: {
    readonly generation: string;
    readonly manifestHash: string;
    readonly asOf: { readonly simTime: string };
  };
  readonly social: C.SocialOfficeStateV1;
  readonly inventory: C.InventoryLedgerState;
  readonly financial: C.FinancialLedgerState;
}
export interface SocialOfficeSimulatedAtomicRepository {
  readDueMatchPlan(): Promise<SocialOfficeDueMatchContext | null>;
  submitManual(input: {
    command: C.CanonicalCommand;
    principal: C.AuthenticatedPrincipal;
  }): Promise<SocialOfficeAtomicResult>;
  executeManual(input: {
    command: C.CanonicalCommand;
    principal: C.AuthenticatedPrincipal;
  }): Promise<SocialOfficeAtomicResult>;
  executeDueMatch(input: {
    command: C.CanonicalCommand;
  }): Promise<SocialOfficeAtomicResult>;
  recover(input: {
    command: C.CanonicalCommand;
    principal: C.AuthenticatedPrincipal;
  }): Promise<SocialOfficeAtomicResult>;
  readReceipt(input: {
    commandId: string;
    principal: C.AuthenticatedPrincipal;
  }): Promise<SocialOfficeAtomicResult>;
  readProjection(input: {
    principal: C.AuthenticatedPrincipal;
  }): Promise<SocialOfficeSimulatedProjection>;
}
export type SocialOfficeDueMatchContext = Readonly<
  | {
      kind: 'PENDING_PLAN';
      originalPlanCommand: C.CanonicalCommand;
      headWorldVersion: string;
      simTime: string;
    }
  | {
      kind: 'EXISTING_SETTLEMENT';
      existingSettlementCommand: C.CanonicalCommand;
    }
  | {
      kind: 'EXISTING_SUBMISSION';
      existingSubmissionCommand: C.CanonicalCommand;
    }
>;
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
function deny(message: string): never {
  throw new C.DomainError(
    C.DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
    `SOCIAL_ATOMIC: ${message}`,
  );
}
function closed(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !v ||
    typeof v !== 'object' ||
    types.isProxy(v) ||
    Object.getPrototypeOf(v) !== Object.prototype
  )
    deny('own record required');
  const ds = Object.getOwnPropertyDescriptors(v);
  if (
    Reflect.ownKeys(ds).length !== keys.length ||
    !keys.every(
      (k) => ds[k] && Object.hasOwn(ds[k], 'value') && ds[k]!.enumerable,
    )
  )
    deny('closed inert record required');
  return Object.fromEntries(keys.map((k) => [k, ds[k]!.value]));
}
function one(result: { rowCount: number | null }, label: string) {
  if (result.rowCount !== 1)
    throw Error(`SOCIAL_ATOMIC: ${label} not exactly one row`);
}
function capture(command: C.CanonicalCommand) {
  const c = C.validateCanonicalCommand(command, sha);
  const copied = C.parseCanonicalCommand(
    {
      schemaVersion: c.schemaVersion,
      commandId: c.commandId,
      commandType: c.commandType,
      actorId: c.actorId,
      authSubject: c.authSubject,
      worldId: c.worldId,
      countryId: c.countryId,
      officeId: c.officeId,
      expectedWorldVersion: c.expectedWorldVersion,
      idempotencyKey: c.idempotencyKey,
      simTime: c.simTime.toCanonicalValue(),
      correlationId: c.correlationId,
      submittedAtReal: c.submittedAtReal,
      payload: JSON.parse(c.canonicalPayload) as unknown,
    },
    sha,
  );
  if (copied.fingerprint !== c.fingerprint) deny('command changed');
  return copied;
}
function kind(
  c: C.CanonicalCommand,
): 'PLAN' | 'ADMIT' | 'GRADUATE' | 'SERVE' | 'MATCH' {
  switch (c.commandType) {
    case C.SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND:
      return 'PLAN';
    case C.SOCIAL_COLLEGE_ADMIT_COMMAND:
      return 'ADMIT';
    case C.SOCIAL_COLLEGE_GRADUATE_COMMAND:
      return 'GRADUATE';
    case C.SOCIAL_CLINIC_SERVE_COMMAND:
      return 'SERVE';
    case C.SOCIAL_JOB_MATCH_DUE_COMMAND:
      return 'MATCH';
    default:
      return deny('unsupported command');
  }
}
function category(k: ReturnType<typeof kind>) {
  return k === 'SERVE'
    ? ('HEALTHCARE' as const)
    : k === 'ADMIT' || k === 'GRADUATE'
      ? ('EDUCATION' as const)
      : ('EMPLOYMENT' as const);
}
function final(receipt: C.FinalCommandReceipt): SocialOfficeAtomicResult {
  return Object.freeze({ status: 'FINAL', receipt });
}
function principalCopy(p: C.AuthenticatedPrincipal): C.AuthenticatedPrincipal {
  const r = closed(p, ['authSubject', 'facts', 'token']);
  return Object.freeze({
    authSubject: C.authSubject(r.authSubject as string),
    facts: Object.freeze(
      closed(r.facts, ['user_id', 'display_name', 'school_id']),
    ) as unknown as C.SharedIdentityFacts,
    token: Object.freeze(
      closed(r.token, [
        'subject',
        'issuer',
        'audience',
        'issuedAt',
        'expiresAt',
      ]),
    ) as unknown as C.VerifiedTokenEnvelope,
  });
}
export function createSocialOfficeSimulatedAtomicRepository(
  input: SocialOfficeSimulatedRepositoryConfig,
): SocialOfficeSimulatedAtomicRepository {
  const r = closed(input, [
    'database',
    'schemaVersion',
    'sourceClass',
    'selectionFingerprint',
    'identity',
    'seed',
    'worker',
    'manual',
    'publisher',
  ]);
  if (
    !r.database ||
    types.isProxy(r.database) ||
    Object.getPrototypeOf(r.database) !== PostgresSqlDatabase.prototype
  )
    deny('original PostgreSQL database required');
  const config = {
    ...r,
    identity: closed(r.identity, [
      'simulationId',
      'worldId',
      'countryId',
      'locationId',
    ]),
    seed: closed(r.seed, ['seedId', 'seedFingerprint']),
    worker: closed(r.worker, ['holderId', 'fencingToken']),
    manual: closed(r.manual, [
      'authSubject',
      'actorId',
      'expectedIssuer',
      'expectedAudience',
    ]),
    publisher: closed(r.publisher, [
      'issuerRef',
      'publisherVersion',
      'actorId',
      'authSubject',
      'ruleVersion',
    ]),
  } as unknown as SocialOfficeSimulatedRepositoryConfig;
  if (
    config.schemaVersion !== 'social-office-simulated-repository-v1' ||
    config.sourceClass !== 'SIMULATED_OPENING' ||
    config.selectionFingerprint !== ORIGINAL.selectionFingerprint ||
    ['simulationId', 'worldId', 'countryId', 'locationId'].some(
      (k) =>
        config.identity[k as keyof typeof config.identity] !==
        ORIGINAL[k as keyof typeof ORIGINAL],
    ) ||
    config.manual.authSubject !== ORIGINAL.manual.authSubject ||
    config.manual.actorId !== ORIGINAL.manual.actorId ||
    Object.keys(config.publisher).some(
      (k) =>
        config.publisher[k as keyof typeof config.publisher] !==
        ORIGINAL.publisher[k as keyof typeof ORIGINAL.publisher],
    ) ||
    config.seed.seedId !== 'SEED_SOCIAL_SINGLE_DEMO_V1' ||
    config.seed.seedFingerprint !==
      'sha256:c50eb02adc46021db162ecf51fb8d734a986ce8bdadc7aef3adfe3cea2312200' ||
    !C.canonicalSerialize(config.worker) ||
    !/^\d+$/u.test(config.worker.fencingToken) ||
    BigInt(config.worker.fencingToken) < 1n ||
    !config.worker.holderId ||
    !config.manual.expectedIssuer ||
    !config.manual.expectedAudience
  )
    deny('fixed simulated composition required');
  const database = config.database;
  const identity = {
    simulationId: config.identity.simulationId,
    worldId: config.identity.worldId,
    countryId: config.identity.countryId,
  };
  const lineage: SocialOfficeLineageIdentity = Object.freeze({
    ...identity,
    ...config.seed,
  });
  const reader = new DurableV08LedgerLineageReader({
    database,
    sha256Hex: sha,
    socialSimulation: lineage,
  });
  function checkPrincipal(p: C.AuthenticatedPrincipal) {
    const now = Date.now();
    if (
      p.authSubject !== config.manual.authSubject ||
      p.token.subject !== p.authSubject ||
      p.facts.user_id !== p.authSubject ||
      p.token.issuer !== config.manual.expectedIssuer ||
      p.token.audience !== config.manual.expectedAudience ||
      !Number.isFinite(Date.parse(p.token.issuedAt)) ||
      !Number.isFinite(Date.parse(p.token.expiresAt)) ||
      Date.parse(p.token.issuedAt) > now ||
      Date.parse(p.token.expiresAt) <= now
    )
      deny('verified current principal mismatch');
  }
  function checkCommand(c: C.CanonicalCommand, automatic: boolean) {
    const k = kind(c);
    if (
      c.worldId !== identity.worldId ||
      c.countryId !== identity.countryId ||
      c.expectedWorldVersion === null ||
      c.idempotencyKey === null ||
      (automatic
        ? k !== 'MATCH' ||
          c.officeId !== null ||
          c.actorId !== config.publisher.actorId ||
          c.authSubject !== config.publisher.authSubject
        : k === 'MATCH' ||
          c.officeId !== 'SOCIAL' ||
          c.actorId !== config.manual.actorId ||
          c.authSubject !== config.manual.authSubject)
    )
      deny('fixed command scope mismatch');
    return k;
  }
  type Authority = {
    authorizationVersion: string;
    capability: string;
    teamId: string;
  };
  async function manualAuthority(
    tx: SqlExecutor,
    p: C.AuthenticatedPrincipal,
    required: readonly string[],
  ): Promise<Authority> {
    checkPrincipal(p);
    if (!(
      required.length === 1 &&
      required[0] === 'READ_AUTHORIZED_PROJECTION_AND_FINAL'
    )) {
      socialOfficeExecutionIdentityFromPublication(
        (await readSocialOfficeSimulatedRevisionFrom(tx, identity)).publication,
      );
    }
    const result = await tx.query<{
      snapshot: {
        rows: Record<string, unknown>[];
        seats: Record<string, unknown>[];
      };
    }>(
      'select world_v2.social_demo_locked_manual_authority($1,$2,$3,$4) as snapshot',
      [
        identity.simulationId,
        identity.worldId,
        identity.countryId,
        p.authSubject,
      ],
    );
    const snapshot = result.rows[0]?.snapshot;
    if (
      result.rows.length !== 1 ||
      !snapshot ||
      !Array.isArray(snapshot.rows) ||
      !Array.isArray(snapshot.seats)
    )
      deny('native authority absent');
    const found = required.map((cap) =>
      snapshot.rows.filter((v) => v.capability === cap),
    );
    if (found.some((a) => a.length !== 1))
      deny('required native capability absent');
    const rows = found.map((a) => a[0]!);
    const version = rows[0]?.authorization_version;
    if (
      typeof version !== 'string' ||
      !version ||
      rows.some(
        (v) =>
          v.world_id !== identity.worldId ||
          v.country_id !== identity.countryId ||
          v.auth_subject !== p.authSubject ||
          v.office_id !== 'SOCIAL' ||
          v.team_id !== ORIGINAL.manual.teamId ||
          v.active !== true ||
          v.authorization_version !== version,
      )
    )
      deny('native current authorization mismatch');
    if (
      snapshot.rows.some(
        (v) =>
          v.active === true &&
          (v.team_id !== ORIGINAL.manual.teamId ||
            v.authorization_version !== version),
      )
    )
      deny('incoherent current membership revision');
    const seats = snapshot.seats.filter(
      (s) =>
        s.world_id === identity.worldId &&
        s.country_id === identity.countryId &&
        s.auth_subject === p.authSubject &&
        s.office_id === 'SOCIAL' &&
        s.team_id === ORIGINAL.manual.teamId &&
        s.authorization_revision === version,
    );
    if (seats.length !== 1) deny('coherent immutable native seat absent');
    return {
      authorizationVersion: version,
      capability: required[0]!,
      teamId: ORIGINAL.manual.teamId,
    };
  }
  async function automaticAuthority(
    tx: SqlExecutor,
    simTime: C.SimTime,
  ): Promise<Authority> {
    const original = readSocialOfficeExecutionIdentity(tx, lineage).publisher;
    const result = await tx.query<{ snapshot: Record<string, unknown> | null }>(
      'select world_v2.social_demo_locked_automatic_authority($1,$2,$3,$4,$5) as snapshot',
      [
        identity.simulationId,
        identity.worldId,
        identity.countryId,
        config.publisher.issuerRef,
        config.publisher.publisherVersion,
      ],
    );
    const v = result.rows[0]?.snapshot;
    const wanted = {
      simulation_id: identity.simulationId,
      world_id: identity.worldId,
      country_id: identity.countryId,
      source_class: 'SIMULATED_OPENING',
      issuer_ref: original.issuerRef,
      publisher_version: original.publisherVersion,
      actor_id: original.actorId,
      auth_subject: original.authSubject,
      command_type: original.commandType,
      rule_version: original.ruleVersion,
      valid_from_day: original.validFromDay,
      valid_until_day: original.validUntilDay,
    };
    const day = simTime.ticks / 86400000n;
    if (
      result.rows.length !== 1 ||
      !v ||
      Object.keys(wanted).some(
        (k) => String(v[k]) !== wanted[k as keyof typeof wanted],
      ) ||
      v.active !== true ||
      typeof v.authorization_version !== 'string' ||
      !v.authorization_version ||
      day < BigInt(original.validFromDay) ||
      day >= BigInt(original.validUntilDay)
    )
      deny('independent current automatic grant absent');
    return {
      authorizationVersion: v.authorization_version,
      capability: original.commandType,
      teamId: ORIGINAL.manual.teamId,
    };
  }
  async function protect(
    scope: Parameters<
      Parameters<typeof withSocialOfficeSimulatedTransaction>[1]
    >[0],
    c: C.CanonicalCommand,
  ) {
    const source = await scope.peekSource();
    const asOf = source.publication.records.filter(
      (r) =>
        r.recordId.startsWith('G_SOCIAL_ASOF_DAY_') &&
        r.role === 'CURRENT_AUTHORIZATION' &&
        source.publication.selectedRecordIds.includes(r.recordId),
    );
    if (asOf.length !== 1) deny('one selected ASOF required');
    const value = JSON.parse(asOf[0]!.rawUtf8) as { simTime: string };
    if (value.simTime !== c.simTime.toCanonicalValue())
      deny('command SimTime differs from current retained ASOF');
    return scope.protectSource({
      purpose: category(kind(c)),
      simTime: value.simTime,
      expectedGeneration: source.generation,
      expectedManifestHash: source.manifestHash,
    });
  }
  async function submission(
    tx: SqlExecutor,
    c: C.CanonicalCommand,
    lock: boolean,
  ) {
    const found = await tx.query<{
      command_id: string;
      command_fingerprint: string;
      idempotency_key: string;
    }>(
      `select command_id,command_fingerprint,idempotency_key from world_v2.command_submission where world_id=$1 and (command_id=$2 or idempotency_key=$3) ${lock ? 'for update' : ''}`,
      [c.worldId, c.commandId, c.idempotencyKey],
    );
    if (
      found.rows.length !== 1 ||
      found.rows[0]!.command_id !== c.commandId ||
      found.rows[0]!.command_fingerprint !== c.fingerprint ||
      found.rows[0]!.idempotency_key !== c.idempotencyKey
    )
      throw Error(
        'SOCIAL_ATOMIC: durable identity conflict or absent submission',
      );
  }
  async function enqueue(
    c: C.CanonicalCommand,
    p: C.AuthenticatedPrincipal | null,
  ): Promise<SocialOfficeAtomicResult> {
    const automatic = p === null,
      k = checkCommand(c, automatic);
    return withSocialOfficeSimulatedTransaction(
      { database, identity },
      async (scope) => {
        const old = await readFinalReceiptFrom(scope.executor, c);
        if (old) {
          if (p)
            await manualAuthority(scope.executor, p, [
              'READ_AUTHORIZED_PROJECTION_AND_FINAL',
            ]);
          return final(old);
        }
        await protect(scope, c);
        if (p)
          await manualAuthority(scope.executor, p, [
            ORIGINAL.manual.actionCapabilities[
              k as keyof typeof ORIGINAL.manual.actionCapabilities
            ],
          ]);
        else await automaticAuthority(scope.executor, c.simTime);
        await scope.executor.query(
          `insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) on conflict do nothing`,
          [
            c.worldId,
            c.commandId,
            c.idempotencyKey,
            c.commandType,
            c.schemaVersion,
            c.canonicalPayload,
            c.payloadHash,
            c.fingerprint,
            c.authSubject,
            c.actorId,
            c.countryId,
            c.officeId,
            c.expectedWorldVersion,
            c.simTime.toCanonicalValue(),
            c.correlationId,
            c.submittedAtReal,
          ],
        );
        await submission(scope.executor, c, false);
        await scope.executor.query(
          `insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time) values($1,$2,$3,$4) on conflict do nothing`,
          [
            c.worldId,
            c.commandId,
            automatic ? 'VERSIONED_AUTOMATIC' : 'DISCRETIONARY_USER',
            c.simTime.toCanonicalValue(),
          ],
        );
        return Object.freeze({
          status: 'QUEUED',
          commandId: c.commandId,
          commandFingerprint: c.fingerprint,
        });
      },
    );
  }
  async function writeReceipt(tx: SqlExecutor, receipt: C.FinalCommandReceipt) {
    one(
      await tx.query(
        `insert into world_v2.command_receipt(world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,transition_id,world_version_before,world_version_after,sim_time,event_ids,recorded_at_real) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`,
        [
          receipt.worldId,
          receipt.commandId,
          receipt.idempotencyKey,
          receipt.schemaVersion,
          receipt.commandFingerprint,
          receipt.outcome,
          receipt.reasonCode,
          receipt.transitionId,
          receipt.worldVersionBefore,
          receipt.worldVersionAfter,
          receipt.simTime.toCanonicalValue(),
          C.canonicalSerialize(receipt.eventIds),
          receipt.recordedAtReal,
        ],
      ),
      'receipt',
    );
    one(
      await tx.query(
        `update world_v2.command_queue set queue_state='FINALIZED',finalized_at_real=$4 where world_id=$1 and command_id=$2 and queue_state='CLAIMED' and claimed_by=$3 and claim_fencing_token=$5`,
        [
          receipt.worldId,
          receipt.commandId,
          config.worker.holderId,
          receipt.recordedAtReal,
          config.worker.fencingToken,
        ],
      ),
      'queue finalization',
    );
  }
  async function recoverCaptured(
    c: C.CanonicalCommand,
    p: C.AuthenticatedPrincipal | null,
  ): Promise<SocialOfficeAtomicResult> {
    // A fresh pooled read only. This path never dispatches or calls enqueue.
    if (p) checkPrincipal(p);
    try {
      return await withSocialOfficeSimulatedTransaction(
        { database, identity },
        async (scope) => {
          if (p)
            await manualAuthority(scope.executor, p, [
              'READ_AUTHORIZED_PROJECTION_AND_FINAL',
            ]);
          const receipt = await readFinalReceiptFrom(scope.executor, c);
          if (receipt) return final(receipt);
          await submission(scope.executor, c, false);
          const queued = await scope.executor.query<{ queue_state: string }>(
            'select queue_state from world_v2.command_queue where world_id=$1 and command_id=$2',
            [c.worldId, c.commandId],
          );
          if (
            queued.rows.length !== 1 ||
            !['PENDING', 'CLAIMED'].includes(queued.rows[0]!.queue_state)
          )
            throw Error('SOCIAL_ATOMIC: no confirmed pending work');
          return Object.freeze({
            status: 'PENDING',
            commandId: c.commandId,
            commandFingerprint: c.fingerprint,
          });
        },
      );
    } catch {
      return Object.freeze({
        status: 'UNKNOWN',
        commandId: c.commandId,
        commandFingerprint: c.fingerprint,
        retryable: false,
      });
    }
  }
  async function execute(
    c: C.CanonicalCommand,
    p: C.AuthenticatedPrincipal | null,
  ): Promise<SocialOfficeAtomicResult> {
    const automatic = p === null,
      k = checkCommand(c, automatic);
    if (p) checkPrincipal(p);
    try {
      const queued = await enqueue(c, p);
      if (queued.status === 'FINAL') return queued;
      return await withSocialOfficeSimulatedTransaction(
        { database, identity },
        async (scope) => {
          const tx = scope.executor;
          const old = await readFinalReceiptFrom(tx, c);
          if (old) {
            if (p)
              await manualAuthority(tx, p, [
                'READ_AUTHORIZED_PROJECTION_AND_FINAL',
              ]);
            return final(old);
          }
          await scope.peekSource();
          await submission(tx, c, true);
          const queue = await tx.query<{
            authority_kind: string;
            queue_state: string;
          }>(
            'select authority_kind,queue_state from world_v2.command_queue where world_id=$1 and command_id=$2 for update',
            [c.worldId, c.commandId],
          );
          const raced = await readFinalReceiptFrom(tx, c);
          if (raced) {
            if (p)
              await manualAuthority(tx, p, [
                'READ_AUTHORIZED_PROJECTION_AND_FINAL',
              ]);
            return final(raced);
          }
          if (
            queue.rows.length !== 1 ||
            queue.rows[0]!.authority_kind !==
              (automatic ? 'VERSIONED_AUTOMATIC' : 'DISCRETIONARY_USER') ||
            queue.rows[0]!.queue_state === 'FINALIZED'
          )
            deny('queue scope mismatch');
          const protection = await protect(scope, c);
          const authority = p
            ? await manualAuthority(tx, p, [
                ORIGINAL.manual.actionCapabilities[
                  k as keyof typeof ORIGINAL.manual.actionCapabilities
                ],
              ])
            : await automaticAuthority(tx, c.simTime);
          const now = new Date().toISOString();
          const guard = await tx.query<{
            world_version: string;
            event_sequence: string;
          }>(
            'select world_version::text,event_sequence::text from world_v2.assert_world_writer_commit_guard($1,$2,$3,$4,$5)',
            [
              c.worldId,
              config.worker.holderId,
              config.worker.fencingToken,
              c.expectedWorldVersion,
              now,
            ],
          );
          if (
            guard.rows.length !== 1 ||
            guard.rows[0]!.world_version !== c.expectedWorldVersion
          )
            throw Error('SOCIAL_ATOMIC: held World head mismatch');
          one(
            await tx.query(
              `update world_v2.command_queue set queue_state='CLAIMED',claimed_by=$3,claim_fencing_token=$4,claimed_at_real=$5 where world_id=$1 and command_id=$2 and queue_state='PENDING'`,
              [
                c.worldId,
                c.commandId,
                config.worker.holderId,
                config.worker.fencingToken,
                now,
              ],
            ),
            'claim',
          );
          return withValidatedCanonicalLineageFrom(
            { reader, executor: tx, worldId: c.worldId },
            async (view) => {
              const data = readValidatedCanonicalLineageFrom(tx, view);
              const rebuilt = await replaySocialOfficeDurableGroups({
                executor: tx,
                identity: lineage,
                seed: data.seed,
                groups: data.transitions.map((v) => ({
                  ...v,
                  inventoryPostings: v.inventoryPostings.filter(
                    (x) => x.operation !== 'SERVICE_CONSUME',
                  ),
                  serviceConsumptionWire: v.inventoryPostings.find(
                    (x) => x.operation === 'SERVICE_CONSUME',
                  )
                    ? C.canonicalSerialize(
                        v.inventoryPostings.find(
                          (x) => x.operation === 'SERVICE_CONSUME',
                        ),
                      )
                    : null,
                })),
                sha256Hex: sha,
              });
              if (
                C.canonicalSerialize(rebuilt.ledgers) !==
                C.canonicalSerialize(data.ledgers)
              )
                throw Error('SOCIAL_ATOMIC: replay differs from sole view');
              const raw = C.canonicalSerialize(protection.source.publication);
              const readFacts = bindSocialOfficeSimulatedReadFacts({
                publicationUtf8: raw,
                generation: protection.source.generation,
                manifestHash: protection.source.manifestHash,
                command: c,
              });
              let prepared: ReturnType<typeof C.prepareSocialOfficeOperation>;
              try {
                prepared = C.prepareSocialOfficeOperation({
                  command: c,
                  state: rebuilt.social,
                  readFacts,
                  inventoryBefore: data.ledgers.inventory,
                  financialBefore: data.ledgers.financial,
                  sha256Hex: sha,
                });
              } catch (error) {
                if (!(error instanceof C.DomainError)) throw error;
                const receipt = C.createFinalCommandReceipt({
                  command: c,
                  outcome: 'REJECTED',
                  reasonCode: 'SOCIAL_OPERATION_REJECTED',
                  transition: null,
                  simTime: c.simTime,
                  recordedAtReal: now,
                });
                await writeReceipt(tx, receipt);
                return final(receipt);
              }
              if (
                prepared.source !== 'PREPARED_NOT_COMMITTED' ||
                prepared.eventPayload === null
              )
                throw Error(
                  'SOCIAL_ATOMIC: duplicate without immutable receipt',
                );
              const after = (BigInt(data.headWorldVersion) + 1n).toString();
              const event = C.parseAuthoritativeEvent(
                {
                  schemaVersion: C.EVENT_SCHEMA_VERSION,
                  eventId: `SOCIAL_EVENT_${sha(c.commandId).toUpperCase()}`,
                  eventType: C.SOCIAL_OFFICE_ACTION_EVENT,
                  worldId: c.worldId,
                  worldVersion: after,
                  sequence: (BigInt(data.headEventSequence) + 1n).toString(),
                  causationCommandId: c.commandId,
                  correlationId: c.correlationId,
                  correctsEventId: null,
                  simTime: c.simTime.toCanonicalValue(),
                  recordedAtReal: now,
                  payload: prepared.eventPayload,
                },
                sha,
              );
              const transition = C.createAuthoritativeTransition({
                command: c,
                worldVersionBefore: data.headWorldVersion,
                worldVersionAfter: after,
                events: [event],
              });
              const requirement = prepared.outcome.financialRequirement;
              const batches: readonly C.FinancialPostingBatch[] =
                requirement && requirement.legs.length
                  ? [
                      C.createFinancialPostingBatch(
                        {
                          schemaVersion: C.FINANCIAL_POSTING_SCHEMA_VERSION,
                          batchId: C.financialPostingBatchId(
                            `SOCIAL_FIN_${sha(c.commandId).toUpperCase()}`,
                          ),
                          worldId: c.worldId,
                          causationCommandId: c.commandId,
                          causationEventIds: [event.eventId],
                          worldVersionBefore: data.headWorldVersion,
                          worldVersionAfter: after,
                          simTime: c.simTime,
                          settlementCurrency:
                            requirement.legs[0]!.amount.currency,
                          legs: requirement.legs.map((l, i) => ({
                            ...l,
                            legId: C.financialPostingLegId(
                              `SOCIAL_LEG_${sha(c.commandId).toUpperCase()}_${i}`,
                            ),
                            amount: C.Money.from(
                              l.amount.amount,
                              l.amount.currency,
                            ),
                            counterpartyAccountId:
                              l.counterpartyAccountId === null
                                ? null
                                : C.financialAccountId(l.counterpartyAccountId),
                          })),
                          command: c,
                          transition,
                        },
                        sha,
                      ),
                    ]
                  : [];
              const postings: readonly C.InventoryLedgerPosting[] = prepared
                .outcome.inventoryRequirement
                ? [
                    C.createSocialServiceConsumptionPosting(
                      {
                        postingId: C.inventoryPostingId(
                          `SOCIAL_INV_${sha(c.commandId).toUpperCase()}`,
                        ),
                        command: c,
                        transition,
                        inventoryBefore: data.ledgers.inventory,
                        financialBefore: data.ledgers.financial,
                        financialPostingBatches: batches,
                        socialBefore: rebuilt.social,
                        readFacts,
                        socialOutcome: prepared.outcome,
                      },
                      sha,
                    ),
                  ]
                : [];
              C.assertSocialOfficeActualEffects({
                command: c,
                originalSocialState: rebuilt.social,
                inventoryBefore: data.ledgers.inventory,
                financialBefore: data.ledgers.financial,
                readFacts,
                transition,
                inventoryPostings: postings,
                financialPostingBatches: batches,
                socialAfter: prepared.state,
                sha256Hex: sha,
              });
              const next = C.rebuildV08LedgersFromLineage({
                seed: data.seed,
                transitions: [
                  ...data.transitions,
                  {
                    command: c,
                    transition,
                    inventoryPostings: postings,
                    financialPostingBatches: batches,
                  },
                ],
                sha256Hex: sha,
              });
              if (next.worldVersion !== after)
                throw Error('SOCIAL_ATOMIC: actual combined writer failed');
              const receipt = C.createFinalCommandReceipt({
                command: c,
                outcome: 'COMMITTED',
                reasonCode: null,
                transition,
                simTime: c.simTime,
                recordedAtReal: now,
              });
              const commit = async (
                proof: C.CommitAuthorizationProof | null,
              ) => {
                await protection.assertCurrent();
                const cutoff = p
                  ? await manualAuthority(tx, p, [authority.capability])
                  : await automaticAuthority(tx, c.simTime);
                if (
                  C.canonicalSerialize(cutoff) !==
                  C.canonicalSerialize(authority)
                )
                  deny('cutoff authority changed');
                if (proof) await C.reauthorizeCommitAuthorizationProof(proof);
                await tx.query(
                  'select * from world_v2.assert_world_writer_commit_guard($1,$2,$3,$4,$5)',
                  [
                    c.worldId,
                    config.worker.holderId,
                    config.worker.fencingToken,
                    data.headWorldVersion,
                    new Date().toISOString(),
                  ],
                );
                one(
                  await tx.query(
                    `insert into world_v2.authoritative_event(world_id,event_id,event_sequence,world_version,causation_command_id,correlation_id,event_type,schema_version,canonical_payload,payload_sha256,event_fingerprint,sim_time,recorded_at_real,corrects_event_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
                    [
                      event.worldId,
                      event.eventId,
                      event.sequence,
                      event.worldVersion,
                      event.causationCommandId,
                      event.correlationId,
                      event.eventType,
                      event.schemaVersion,
                      event.canonicalPayload,
                      event.payloadHash,
                      event.fingerprint,
                      event.simTime.toCanonicalValue(),
                      now,
                      null,
                    ],
                  ),
                  'event',
                );
                for (const posting of postings) {
                  const { fingerprint, ...intent } = posting;
                  await tx.query(
                    `insert into world_v2.inventory_posting(world_id,posting_id,causation_command_id,world_version_before,world_version_after,sim_time,event_ids,transition_binding,operation,canonical_payload,posting_fingerprint) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)`,
                    [
                      posting.worldId,
                      posting.postingId,
                      c.commandId,
                      posting.worldVersionBefore,
                      posting.worldVersionAfter,
                      posting.simTime.toCanonicalValue(),
                      C.canonicalSerialize(posting.causationEventIds),
                      C.canonicalSerialize(posting.transitionBinding),
                      posting.operation,
                      C.canonicalSerialize(intent),
                      fingerprint,
                    ],
                  );
                }
                for (const batch of batches) {
                  const { fingerprint, ...intent } = batch;
                  await tx.query(
                    `insert into world_v2.financial_posting_batch(world_id,batch_id,causation_command_id,world_version_before,world_version_after,sim_time,event_ids,transition_binding,settlement_currency,canonical_payload,batch_fingerprint) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)`,
                    [
                      batch.worldId,
                      batch.batchId,
                      c.commandId,
                      batch.worldVersionBefore,
                      batch.worldVersionAfter,
                      batch.simTime.toCanonicalValue(),
                      C.canonicalSerialize(batch.causationEventIds),
                      C.canonicalSerialize(batch.transitionBinding),
                      batch.settlementCurrency,
                      C.canonicalSerialize(intent),
                      fingerprint,
                    ],
                  );
                }
                await tx.query(
                  `insert into world_v2.authoritative_commit_authorization(world_id,command_id,authority_kind,auth_subject,actor_id,country_id,office_id,capability,team_id,authorization_version,committed_at_real) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                  [
                    c.worldId,
                    c.commandId,
                    automatic ? 'VERSIONED_AUTOMATIC' : 'DISCRETIONARY_USER',
                    proof?.authSubject ?? null,
                    proof?.actorId ?? null,
                    proof?.countryId ?? null,
                    proof?.officeId ?? null,
                    proof?.capability ?? null,
                    proof?.teamId ?? null,
                    proof?.authorizationVersion ?? null,
                    now,
                  ],
                );
                await writeReceipt(tx, receipt);
                const payload = C.canonicalSerialize({
                  schemaVersion: 'social-office-simulated-cutoff-v1',
                  sourceClass: 'SIMULATED_OPENING',
                  commandFingerprint: c.fingerprint,
                  sourceGeneration: protection.source.generation,
                  manifestHash: protection.source.manifestHash,
                  authority,
                  automatic: automatic ? ORIGINAL.publisher : null,
                });
                await tx.query(
                  `insert into world_v2.notification_outbox(world_id,outbox_message_id,command_id,event_id,schema_version,canonical_payload,payload_sha256,available_at_sim_time,delivery_state,attempt_count) values($1,$2,$3,$4,'outbox-v1',$5,$6,$7,'PENDING',0)`,
                  [
                    c.worldId,
                    `SOCIAL_OUT_${sha(c.commandId).toUpperCase()}`,
                    c.commandId,
                    event.eventId,
                    payload,
                    `sha256:${sha(payload)}`,
                    c.simTime.toCanonicalValue(),
                  ],
                );
                one(
                  await tx.query(
                    'update world_v2.world_head set world_version=$3,event_sequence=$4 where world_id=$1 and world_version=$2 and event_sequence=$5',
                    [
                      c.worldId,
                      data.headWorldVersion,
                      after,
                      event.sequence,
                      data.headEventSequence,
                    ],
                  ),
                  'head CAS',
                );
                return { receipt, transition };
              };
              if (p) {
                const resolver: C.AuthorizationResolver = {
                  resolveCurrentIdentity: async (principal) => {
                    checkPrincipal(principal);
                    return principal.authSubject;
                  },
                  resolveCurrentMembership: async () => {
                    const a = await manualAuthority(tx, p, [
                      authority.capability,
                    ]);
                    return {
                      authorizationVersion: a.authorizationVersion,
                      authSubject: p.authSubject,
                      worldId: c.worldId,
                      teamId: C.teamId(a.teamId),
                      countryId: C.countryId(identity.countryId),
                      officeAssignments: [C.officeId('SOCIAL')],
                      active: true,
                      suspended: false,
                      isWorldAdmin: false,
                      negotiationPartyIds: [],
                    };
                  },
                };
                const authorization = await C.authorizeOfficeCapability({
                  principal: p,
                  resolver,
                  worldId: c.worldId,
                  requestedCountryId: C.countryId(identity.countryId),
                  requestedOfficeId: C.officeId('SOCIAL'),
                  capability: authority.capability as C.AuthorizationCapability,
                });
                const done = await C.processQueuedCommand({
                  command: c,
                  authorityKind: 'DISCRETIONARY_USER',
                  commitSimTime: c.simTime,
                  recordedAtReal: now,
                  requiredCapability:
                    authority.capability as C.AuthorizationCapability,
                  intakeAuthorization: authorization,
                  persistence: {
                    readFinalReceipt: (command) =>
                      readFinalReceiptFrom(tx, command),
                    recordZeroEffectReceipt: async (value) => {
                      await writeReceipt(tx, value);
                      return value;
                    },
                    commitAuthorizedCommand: async (value) =>
                      commit(value.commitAuthorization),
                  },
                });
                return final(done.receipt);
              }
              return final((await commit(null)).receipt);
            },
          );
        },
      );
    } catch (error) {
      // Even SQL/COMMIT failures never dispatch again. Only an independent final read can settle uncertainty.
      if (error instanceof PostgresTransactionError) {
        const recovered = await recoverCaptured(c, p);
        if (recovered.status === 'FINAL') return recovered;
        if (
          error.outcome === 'COMMIT_OUTCOME_UNKNOWN' ||
          error.outcome === 'ROLLBACK_UNCONFIRMED'
        )
          return Object.freeze({
            status: 'UNKNOWN',
            commandId: c.commandId,
            commandFingerprint: c.fingerprint,
            retryable: false,
          });
      }
      throw error;
    }
  }
  return Object.freeze({
    readDueMatchPlan: async (): Promise<SocialOfficeDueMatchContext | null> =>
      withSocialOfficeSimulatedTransaction(
        { database, identity },
        async (scope) => {
          // Recover actual old immutable work before new-use eligibility. No human
          // READ/capability is borrowed to authorize a distinct automatic publisher.
          const rows = await scope.executor.query<{ command_id: string }>(
            `select s.command_id from world_v2.command_submission s where s.world_id=$1 and s.command_type=$2 and s.actor_id=$3 and s.auth_subject=$4 order by s.command_id limit 257`,
            [
              identity.worldId,
              ORIGINAL.publisher.commandType,
              ORIGINAL.publisher.actorId,
              ORIGINAL.publisher.authSubject,
            ],
          );
          if (rows.rows.length > 256)
            throw Error('SOCIAL_ATOMIC: complete automatic prefix bound');
          let existing: C.CanonicalCommand | null = null;
          let accepted: C.CanonicalCommand | null = null;
          for (const row of rows.rows) {
            const original = await reader.readCommandFrom(
              scope.executor,
              identity.worldId,
              row.command_id,
            );
            checkCommand(original, true);
            C.parseSocialJobMatchDueIntent(
              JSON.parse(original.canonicalPayload),
            );
            if (await readFinalReceiptFrom(scope.executor, original))
              existing = original;
            else if (accepted === null) accepted = original;
          }
          if (accepted !== null)
            return Object.freeze({
              kind: 'EXISTING_SUBMISSION' as const,
              existingSubmissionCommand: accepted,
            });
          const old = (): SocialOfficeDueMatchContext | null =>
            existing === null
              ? null
              : Object.freeze({
                  kind: 'EXISTING_SETTLEMENT',
                  existingSettlementCommand: existing,
                });
          try {
            const raw = await scope.peekSource();
            const asOf = raw.publication.records.filter(
              (r) =>
                r.recordId.startsWith('G_SOCIAL_ASOF_DAY_') &&
                raw.publication.selectedRecordIds.includes(r.recordId),
            );
            if (asOf.length !== 1) deny('one automatic ASOF required');
            const time = JSON.parse(asOf[0]!.rawUtf8) as {
              simTime: string;
              dayIndex: string;
            };
            if (time.dayIndex !== '1') return old();
            await scope.protectSource({
              purpose: 'EMPLOYMENT',
              simTime: time.simTime,
              expectedGeneration: raw.generation,
              expectedManifestHash: raw.manifestHash,
            });
            await automaticAuthority(
              scope.executor,
              C.SimTime.fromTicks(time.simTime),
            );
            return await withValidatedCanonicalLineageFrom(
              { reader, executor: scope.executor, worldId: identity.worldId },
              async (view) => {
                const data = readValidatedCanonicalLineageFrom(
                  scope.executor,
                  view,
                );
                const rebuilt = await replaySocialOfficeDurableGroups({
                  executor: scope.executor,
                  identity: lineage,
                  seed: data.seed,
                  groups: data.transitions.map((v) => ({
                    ...v,
                    inventoryPostings: v.inventoryPostings.filter(
                      (x) => x.operation !== 'SERVICE_CONSUME',
                    ),
                    serviceConsumptionWire: v.inventoryPostings.find(
                      (x) => x.operation === 'SERVICE_CONSUME',
                    )
                      ? C.canonicalSerialize(
                          v.inventoryPostings.find(
                            (x) => x.operation === 'SERVICE_CONSUME',
                          ),
                        )
                      : null,
                  })),
                  sha256Hex: sha,
                });
                const pending = rebuilt.social.employment.plans
                  .filter((p) => p.state === 'PENDING')
                  .sort((a, b) =>
                    a.planCommandId.localeCompare(b.planCommandId, 'en'),
                  );
                for (const plan of pending) {
                  const original = await reader.readCommandFrom(
                    scope.executor,
                    identity.worldId,
                    plan.planCommandId,
                  );
                  const parsed = C.parseSocialEmploymentServiceCommand(
                    original,
                    sha,
                  );
                  if (
                    parsed.kind !== 'PLAN' ||
                    parsed.intent.dueDayIndex !== time.dayIndex
                  )
                    continue;
                  if (
                    original.fingerprint !== plan.planFingerprint ||
                    !data.transitions.some(
                      (t) =>
                        t.command.commandId === original.commandId &&
                        t.command.fingerprint === original.fingerprint,
                    )
                  )
                    throw Error(
                      'SOCIAL_ATOMIC: due plan must be actual full-prefix command',
                    );
                  return Object.freeze({
                    kind: 'PENDING_PLAN' as const,
                    originalPlanCommand: original,
                    headWorldVersion: data.headWorldVersion,
                    simTime: time.simTime,
                  });
                }
                return old();
              },
            );
          } catch (error) {
            if (existing !== null) return old();
            throw error;
          }
        },
      ),
    submitManual: async ({
      command,
      principal,
    }: {
      command: C.CanonicalCommand;
      principal: C.AuthenticatedPrincipal;
    }) => {
      const c = capture(command),
        p = principalCopy(principal);
      checkPrincipal(p);
      checkCommand(c, false);
      return enqueue(c, p);
    },
    executeManual: async ({
      command,
      principal,
    }: {
      command: C.CanonicalCommand;
      principal: C.AuthenticatedPrincipal;
    }) => execute(capture(command), principalCopy(principal)),
    executeDueMatch: async ({ command }: { command: C.CanonicalCommand }) =>
      execute(capture(command), null),
    recover: async ({
      command,
      principal,
    }: {
      command: C.CanonicalCommand;
      principal: C.AuthenticatedPrincipal;
    }) => {
      const c = capture(command),
        p = principalCopy(principal);
      checkPrincipal(p);
      if (c.worldId !== identity.worldId || c.authSubject !== p.authSubject)
        deny('own receipt required');
      return recoverCaptured(c, p);
    },
    readReceipt: async ({
      principal,
      commandId,
    }: {
      principal: C.AuthenticatedPrincipal;
      commandId: string;
    }) => {
      const p = principalCopy(principal);
      checkPrincipal(p);
      const command = await reader.readCommandFrom(
        database,
        identity.worldId,
        commandId,
      );
      if (command.authSubject !== p.authSubject) deny('own receipt required');
      return recoverCaptured(command, p);
    },
    readProjection: async ({
      principal,
    }: {
      principal: C.AuthenticatedPrincipal;
    }) => {
      const p = principalCopy(principal);
      checkPrincipal(p);
      return withSocialOfficeSimulatedTransaction(
        { database, identity },
        async (scope) => {
          const raw = await scope.peekSource();
          const rows = raw.publication.records.filter(
            (r) =>
              r.recordId.startsWith('G_SOCIAL_ASOF_DAY_') &&
              raw.publication.selectedRecordIds.includes(r.recordId),
          );
          if (rows.length !== 1) deny('one ASOF required');
          const asOf = JSON.parse(rows[0]!.rawUtf8) as { simTime: string };
          await scope.protectSource({
            purpose: 'EMPLOYMENT',
            simTime: asOf.simTime,
            expectedGeneration: raw.generation,
            expectedManifestHash: raw.manifestHash,
          });
          await manualAuthority(
            scope.executor,
            p,
            ORIGINAL.manual.capabilities,
          );
          return withValidatedCanonicalLineageFrom(
            { reader, executor: scope.executor, worldId: identity.worldId },
            async (view) => {
              const data = readValidatedCanonicalLineageFrom(
                scope.executor,
                view,
              );
              const rebuilt = await replaySocialOfficeDurableGroups({
                executor: scope.executor,
                identity: lineage,
                seed: data.seed,
                groups: data.transitions.map((v) => ({
                  ...v,
                  inventoryPostings: v.inventoryPostings.filter(
                    (x) => x.operation !== 'SERVICE_CONSUME',
                  ),
                  serviceConsumptionWire: v.inventoryPostings.find(
                    (x) => x.operation === 'SERVICE_CONSUME',
                  )
                    ? C.canonicalSerialize(
                        v.inventoryPostings.find(
                          (x) => x.operation === 'SERVICE_CONSUME',
                        ),
                      )
                    : null,
                })),
                sha256Hex: sha,
              });
              return Object.freeze({
                schemaVersion: 'social-office-simulated-projection-v1',
                sourceClass: 'SIMULATED_OPENING',
                scope: config.identity,
                head: {
                  worldVersion: data.headWorldVersion,
                  eventSequence: data.headEventSequence,
                },
                source: {
                  generation: raw.generation,
                  manifestHash: raw.manifestHash,
                  asOf,
                },
                social: rebuilt.social,
                inventory: rebuilt.ledgers.inventory,
                financial: rebuilt.ledgers.financial,
              });
            },
          );
        },
      );
    },
  });
}
