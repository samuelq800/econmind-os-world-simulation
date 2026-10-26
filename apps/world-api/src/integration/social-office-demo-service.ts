/** Fixed isolated composition. The production admission/route/provider remain separate. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import * as C from '@econmind/core';
import {
  createSocialOfficeSimulatedAtomicRepository,
  PostgresSqlDatabase,
  withSocialOfficeSimulatedTransaction,
  projectSocialOfficeDemoResult,
  SOCIAL_DEMO_EXECUTION_IDENTITY_V1,
  type SocialOfficeAtomicResult,
  type SocialOfficeDemoScenario,
} from '@econmind/world-worker/social-office-demo';
import { createSupabaseJwksSignatureVerifier } from './supabase-jwks-signature-verifier.js';
import { verifySupabaseJwtClaims } from './identity.js';

type Action = 'PLAN' | 'ADMIT' | 'SERVE' | 'GRADUATE_OLD' | 'GRADUATE_NEW';
interface RequestData {
  readonly requestId: string;
  readonly action: Action;
  readonly expectedWorldVersion: string;
}
export interface SocialOfficeDemoReply {
  readonly httpStatus: number;
  readonly body: unknown;
}
export interface SocialOfficeDemoServiceConfig {
  readonly readDatabase: PostgresSqlDatabase;
  readonly writerDatabase: PostgresSqlDatabase;
  readonly scenario: Readonly<SocialOfficeDemoScenario>;
  readonly worker: { readonly holderId: string; readonly fencingToken: string };
  readonly auth: {
    readonly projectRef: string;
    readonly expectedIssuer: string;
    readonly jwksUrl: string;
    readonly audience: string;
    readonly fetch: typeof globalThis.fetch;
  };
  readonly sessionAuthorization: string;
}
export interface SocialOfficeDemoService {
  /** Private F controller only; the transport deliberately has no route for it. */
  processDueBoundary(): Promise<
    SocialOfficeAtomicResult | Readonly<{ status: 'NO_DUE_PLAN' }>
  >;
  session(
    input: Readonly<{ signal?: AbortSignal }>,
  ): Promise<SocialOfficeDemoReply>;
  handle(
    input: Readonly<{
      authorization: unknown;
      request: unknown;
      signal?: AbortSignal;
    }>,
  ): Promise<SocialOfficeDemoReply>;
  projection(
    input: Readonly<{ authorization: unknown; signal?: AbortSignal }>,
  ): Promise<SocialOfficeDemoReply>;
  receipt(
    input: Readonly<{
      authorization: unknown;
      requestId: unknown;
      signal?: AbortSignal;
    }>,
  ): Promise<SocialOfficeDemoReply>;
}
const services = new WeakSet<object>();
const ROOT_SHA =
  'b7ff5facc4e3301d265279762d18cec18a5258dfa061ea88cffb4a03693e8036';
const SEED_SHA =
  'sha256:c50eb02adc46021db162ecf51fb8d734a986ce8bdadc7aef3adfe3cea2312200';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
function closed(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new RequestError(400, 'Closed data required');
  const ds = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(ds).length !== fields.length ||
    fields.some(
      (k) => !ds[k] || !Object.hasOwn(ds[k], 'value') || !ds[k]!.enumerable,
    )
  )
    throw new RequestError(400, 'Unexpected request fields');
  return Object.fromEntries(fields.map((k) => [k, ds[k]!.value]));
}
function requestId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(
      value,
    )
  )
    throw new RequestError(400, 'Invalid original request identity');
  return value;
}
export function socialOfficeDemoCommandId(value: unknown): string {
  return `COMMAND_SOCIAL_DEMO_${requestId(value).replaceAll('-', '_')}`;
}
function request(value: unknown): RequestData {
  const r = closed(value, ['requestId', 'action', 'expectedWorldVersion']);
  if (
    typeof r.action !== 'string' ||
    !['PLAN', 'ADMIT', 'SERVE', 'GRADUATE_OLD', 'GRADUATE_NEW'].includes(
      r.action,
    ) ||
    typeof r.expectedWorldVersion !== 'string' ||
    !/^(?:0|[1-9]\d*)$/u.test(r.expectedWorldVersion)
  )
    throw new RequestError(400, 'Invalid demonstration action or version');
  return Object.freeze({
    requestId: requestId(r.requestId),
    action: r.action as Action,
    expectedWorldVersion: r.expectedWorldVersion,
  });
}
function failure(error: unknown): SocialOfficeDemoReply {
  if (error instanceof RequestError)
    return {
      httpStatus: error.status,
      body: {
        schemaVersion: 'g-social-office-error-v1',
        message: error.message,
      },
    };
  let current: unknown = error;
  for (
    let n = 0;
    n < 4 && current instanceof Error;
    n++, current = current.cause
  ) {
    if (current instanceof C.DomainError) {
      const conflict = [
        'IDEMPOTENCY_CONFLICT',
        'WORLD_VERSION_CONFLICT',
        'STALE_WORLD_VERSION',
      ].includes(current.code);
      return {
        httpStatus: conflict ? 409 : 403,
        body: {
          schemaVersion: 'g-social-office-error-v1',
          message: conflict
            ? 'The original identity or World version conflicts with the current record.'
            : 'Current source or authority does not permit this request.',
        },
      };
    }
  }
  return {
    httpStatus: 503,
    body: {
      schemaVersion: 'g-social-office-error-v1',
      message:
        'Result unavailable. Recover the original request receipt; do not resubmit.',
    },
  };
}
function wireResult(
  result: SocialOfficeAtomicResult,
  id: string,
): SocialOfficeDemoReply {
  const commandId = socialOfficeDemoCommandId(id);
  if (result.status === 'FINAL') {
    const r = result.receipt;
    if (
      r.commandId !== commandId ||
      r.worldId !== 'WORLD_SOCIAL_SINGLE_DEMO_V1'
    )
      throw Error('SOCIAL_DEMO: original receipt identity mismatch');
    const committed = r.outcome === 'COMMITTED';
    if (committed && r.worldVersionAfter === null)
      throw Error('SOCIAL_DEMO: committed receipt lacks durable version');
    return {
      httpStatus: 200,
      body: {
        schemaVersion: 'g-social-office-receipt-v1',
        requestId: id,
        commandId,
        status: committed ? 'FINAL' : 'REJECTED',
        worldVersion: r.worldVersionAfter,
        message: committed
          ? 'The original command is durably committed.'
          : 'The original command was durably rejected without its business effects.',
      },
    };
  }
  if (result.commandId !== commandId)
    throw Error('SOCIAL_DEMO: queue identity mismatch');
  return {
    httpStatus: result.status === 'QUEUED' ? 202 : 200,
    body: {
      schemaVersion: 'g-social-office-receipt-v1',
      requestId: id,
      commandId,
      status: result.status === 'UNKNOWN' ? 'UNKNOWN' : 'QUEUED',
      worldVersion: null,
      message:
        result.status === 'UNKNOWN'
          ? 'The original result is not yet confirmed. Recover this same request.'
          : 'The original command is queued; business completion is not yet confirmed.',
    },
  };
}

/** There is no caller-supplied repository, handler, before-state or permission callback. */
export function createSocialOfficeDemoService(
  input: SocialOfficeDemoServiceConfig,
): Readonly<SocialOfficeDemoService> {
  const v = closed(input, [
    'readDatabase',
    'writerDatabase',
    'scenario',
    'worker',
    'auth',
    'sessionAuthorization',
  ]);
  for (const database of [v.readDatabase, v.writerDatabase])
    if (
      !database ||
      types.isProxy(database) ||
      Object.getPrototypeOf(database) !== PostgresSqlDatabase.prototype
    )
      throw Error('SOCIAL_DEMO: original database adapters required');
  const worker = closed(v.worker, [
    'holderId',
    'fencingToken',
  ]) as unknown as SocialOfficeDemoServiceConfig['worker'];
  const auth = closed(v.auth, [
    'projectRef',
    'expectedIssuer',
    'jwksUrl',
    'audience',
    'fetch',
  ]) as unknown as SocialOfficeDemoServiceConfig['auth'];
  if (
    auth.projectRef !== 'ssssssssssssssssssss' ||
    auth.expectedIssuer !==
      'https://ssssssssssssssssssss.supabase.co/auth/v1' ||
    auth.jwksUrl !== `${auth.expectedIssuer}/.well-known/jwks.json` ||
    auth.audience !== 'authenticated' ||
    typeof auth.fetch !== 'function'
  )
    throw Error('SOCIAL_DEMO: fixed isolated identity configuration required');
  const scenario = v.scenario as Readonly<SocialOfficeDemoScenario>;
  if (
    !scenario ||
    types.isProxy(scenario) ||
    scenario.sourceClass !== 'SIMULATED_OPENING' ||
    scenario.sourceAdmitted !== false ||
    scenario.rootSelectionSHA256 !== ROOT_SHA ||
    C.canonicalSerialize(scenario.executionIdentity) !==
      C.canonicalSerialize(SOCIAL_DEMO_EXECUTION_IDENTITY_V1)
  )
    throw Error('SOCIAL_DEMO: selected documentary scenario required');
  const seed = C.parseOpeningSeed(
    JSON.parse(C.canonicalSerialize(scenario.seed)) as unknown,
    sha,
  );
  if (seed.fingerprint !== SEED_SHA)
    throw Error('SOCIAL_DEMO: exact selected genuine seed required');
  const identity = Object.freeze({
    simulationId: scenario.scope.simulationId,
    worldId: scenario.scope.worldId,
    countryId: scenario.scope.countryId,
    locationId: scenario.scope.locationId,
  });
  const manual = scenario.executionIdentity.manual,
    publisher = scenario.executionIdentity.publisher;
  const common: Omit<
    Parameters<typeof createSocialOfficeSimulatedAtomicRepository>[0],
    'database'
  > = {
    schemaVersion: 'social-office-simulated-repository-v1' as const,
    sourceClass: 'SIMULATED_OPENING' as const,
    selectionFingerprint: `sha256:${ROOT_SHA}`,
    identity,
    seed: { seedId: seed.seedId, seedFingerprint: seed.fingerprint },
    worker,
    manual: {
      authSubject: manual.authSubject,
      actorId: manual.actorId,
      expectedIssuer: auth.expectedIssuer,
      expectedAudience: auth.audience,
    },
    publisher: {
      issuerRef: publisher.issuerRef,
      publisherVersion: publisher.publisherVersion,
      actorId: publisher.actorId,
      authSubject: publisher.authSubject,
      ruleVersion: publisher.ruleVersion,
    },
  };
  const readDatabase = v.readDatabase as PostgresSqlDatabase,
    writerDatabase = v.writerDatabase as PostgresSqlDatabase;
  const reader = createSocialOfficeSimulatedAtomicRepository({
    ...common,
    database: readDatabase,
  });
  const writer = createSocialOfficeSimulatedAtomicRepository({
    ...common,
    database: writerDatabase,
  });
  const verifier = createSupabaseJwksSignatureVerifier({
    projectRef: auth.projectRef,
    expectedIssuer: auth.expectedIssuer,
    jwksUrl: auth.jwksUrl,
    fetch: auth.fetch,
  });
  const sessionAuthorization = v.sessionAuthorization;
  async function principal(
    authorization: unknown,
    signal?: AbortSignal,
  ): Promise<C.AuthenticatedPrincipal> {
    if (
      typeof authorization !== 'string' ||
      !/^Bearer [A-Za-z0-9._-]+$/u.test(authorization) ||
      authorization.length > 8200
    )
      throw new RequestError(401, 'A valid isolated session is required.');
    try {
      const claims = await verifySupabaseJwtClaims({
        token: authorization.slice(7),
        verifier,
        policy: {
          expectedIssuer: auth.expectedIssuer,
          expectedAudience: auth.audience,
          nowEpochSeconds: Math.floor(Date.now() / 1000),
          clockSkewSeconds: 0,
        },
        ...(signal ? { signal } : {}),
      });
      if (claims.authSubject !== manual.authSubject)
        throw Error('fixed subject mismatch');
      const subject = C.authSubject(claims.authSubject);
      return Object.freeze({
        authSubject: subject,
        facts: Object.freeze({
          user_id: subject,
          display_name: null,
          school_id: null,
        }),
        token: Object.freeze({
          subject,
          issuer: claims.issuer,
          audience: claims.audience,
          issuedAt: new Date(claims.issuedAtEpochSeconds * 1000).toISOString(),
          expiresAt: new Date(
            claims.expiresAtEpochSeconds * 1000,
          ).toISOString(),
        }),
      });
    } catch {
      throw new RequestError(
        401,
        'The isolated session is invalid or expired.',
      );
    }
  }
  async function sourceTime(): Promise<string> {
    return withSocialOfficeSimulatedTransaction(
      {
        database: readDatabase,
        identity: {
          simulationId: identity.simulationId,
          worldId: identity.worldId,
          countryId: identity.countryId,
        },
      },
      async ({ peekSource }) => {
        const raw = await peekSource();
        const originals = raw.publication.records.filter(
          (r) =>
            r.recordId.startsWith('G_SOCIAL_ASOF_DAY_') &&
            raw.publication.selectedRecordIds.includes(r.recordId),
        );
        if (
          originals.length !== 1 ||
          originals[0]!.role !== 'CURRENT_AUTHORIZATION'
        )
          throw Error('SOCIAL_DEMO: selected original as-of required');
        const a = closed(JSON.parse(originals[0]!.rawUtf8) as unknown, [
          'schemaVersion',
          'sourceClass',
          'simulationId',
          'worldId',
          'countryId',
          'locationId',
          'presetId',
          'dayIndex',
          'simTime',
          'selectionFingerprint',
        ]);
        if (
          a.schemaVersion !== 'g-social-office-simulated-asof-v1' ||
          a.sourceClass !== 'SIMULATED_OPENING' ||
          a.simulationId !== identity.simulationId ||
          a.worldId !== identity.worldId ||
          a.countryId !== identity.countryId ||
          a.locationId !== identity.locationId ||
          a.selectionFingerprint !== `sha256:${ROOT_SHA}` ||
          typeof a.dayIndex !== 'string' ||
          !['0', '1', '10'].includes(a.dayIndex) ||
          a.presetId !== `G_SOCIAL_PRESET_DAY_${a.dayIndex}` ||
          a.simTime !== (BigInt(a.dayIndex) * 86400000n).toString()
        )
          throw Error('SOCIAL_DEMO: original as-of scope mismatch');
        return a.simTime as string;
      },
    );
    // This metadata transaction ends here. D independently reacquires current
    // source/authority and original S/Q/L/H in each real intake/settlement.
  }
  function canonical(
    r: RequestData,
    p: C.AuthenticatedPrincipal,
    simTime: string,
  ): C.CanonicalCommand {
    if (['PLAN', 'ADMIT', 'SERVE'].includes(r.action) && simTime !== '0')
      throw new RequestError(
        409,
        'This initial-window action is closed in the selected demonstration.',
      );
    const programme = scenario.socialOpening.programmes[0],
      clinic = scenario.openingReadFacts.clinicRules[0];
    if (!programme || !clinic)
      throw Error('SOCIAL_DEMO: original programme and clinic required');
    const commandType =
      r.action === 'PLAN'
        ? C.SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND
        : r.action === 'ADMIT'
          ? C.SOCIAL_COLLEGE_ADMIT_COMMAND
          : r.action === 'SERVE'
            ? C.SOCIAL_CLINIC_SERVE_COMMAND
            : C.SOCIAL_COLLEGE_GRADUATE_COMMAND;
    const payload =
      r.action === 'PLAN'
        ? {
            schemaVersion: 'social-employment-service-plan-v1',
            locationId: identity.locationId,
            skill: 'MEDIUM',
            positionId: 'POSITION_SIM_CLINIC_NURSE_02',
            servicePoolId: 'SIM_EMP_POOL_MEDIUM_D1',
            requestedMatches: '1',
            dueDayIndex: '1',
          }
        : r.action === 'ADMIT'
          ? {
              schemaVersion: 'social-college-admit-v1',
              programmeId: programme.programmeId,
              programmeRuleVersion: programme.ruleVersion,
              cohortId: 'SIM_COHORT_NEW_01',
              applicantPoolId: 'SIM_STUDENT_APPLICANTS_V1',
            }
          : r.action === 'SERVE'
            ? {
                schemaVersion: 'social-clinic-serve-v1',
                clinicId: clinic.clinicId,
                careWindowId: 'SIM_CLINIC_EPISODE_D0_V1',
                clinicRuleVersion: clinic.ruleVersion,
              }
            : {
                schemaVersion: 'social-college-graduate-v1',
                cohortId:
                  r.action === 'GRADUATE_OLD'
                    ? 'SIM_COHORT_RETURNING_01'
                    : 'SIM_COHORT_NEW_01',
                programmeRuleVersion: programme.ruleVersion,
              };
    const c = C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        commandId: socialOfficeDemoCommandId(r.requestId),
        commandType,
        worldId: identity.worldId,
        countryId: identity.countryId,
        actorId: manual.actorId,
        authSubject: p.authSubject,
        officeId: 'SOCIAL',
        expectedWorldVersion: r.expectedWorldVersion,
        idempotencyKey: `IDEMPOTENCY_SOCIAL_DEMO_${r.requestId.replaceAll('-', '_')}`,
        correlationId: `TRACE_SOCIAL_DEMO_${r.requestId.replaceAll('-', '_')}`,
        simTime,
        submittedAtReal: new Date().toISOString(),
        payload,
      },
      sha,
    );
    if (r.action === 'PLAN') C.parseSocialEmploymentServiceCommand(c, sha);
    else C.parseSocialOfficeActionIntent(c, sha);
    return c;
  }
  const service = Object.freeze<SocialOfficeDemoService>({
    async processDueBoundary() {
      if (arguments.length !== 0)
        throw Error(
          'SOCIAL_DEMO: private due processing accepts no caller input',
        );
      const context = await writer.readDueMatchPlan();
      if (context === null)
        return Object.freeze({ status: 'NO_DUE_PLAN' as const });
      if (context.kind === 'EXISTING_SETTLEMENT') {
        C.validateCanonicalCommand(context.existingSettlementCommand, sha);
        return writer.executeDueMatch({
          command: context.existingSettlementCommand,
        });
      }
      if (context.kind === 'EXISTING_SUBMISSION') {
        C.validateCanonicalCommand(context.existingSubmissionCommand, sha);
        return writer.executeDueMatch({
          command: context.existingSubmissionCommand,
        });
      }
      const original = C.validateCanonicalCommand(
        context.originalPlanCommand,
        sha,
      );
      const parsed = C.parseSocialEmploymentServiceCommand(original, sha);
      if (
        parsed.kind !== 'PLAN' ||
        original.worldId !== identity.worldId ||
        original.countryId !== identity.countryId ||
        original.actorId !== manual.actorId ||
        original.authSubject !== manual.authSubject ||
        parsed.intent.dueDayIndex !== '1' ||
        context.simTime !== '86400000'
      )
        throw Error('SOCIAL_DEMO: actual selected original due plan required');
      const suffix = sha(
        C.canonicalSerialize({
          originalPlanCommandId: original.commandId,
          originalPlanFingerprint: original.fingerprint,
          dueDayIndex: parsed.intent.dueDayIndex,
          issuerRef: publisher.issuerRef,
          publisherVersion: publisher.publisherVersion,
          ruleVersion: publisher.ruleVersion,
        }),
      );
      const command = C.parseCanonicalCommand(
        {
          schemaVersion: C.COMMAND_SCHEMA_VERSION,
          commandId: `COMMAND_SOCIAL_DUE_${suffix}`,
          commandType: C.SOCIAL_JOB_MATCH_DUE_COMMAND,
          worldId: identity.worldId,
          countryId: identity.countryId,
          actorId: publisher.actorId,
          authSubject: publisher.authSubject,
          officeId: null,
          expectedWorldVersion: context.headWorldVersion,
          idempotencyKey: `IDEMPOTENCY_SOCIAL_DUE_${suffix}`,
          correlationId: `TRACE_SOCIAL_DUE_${suffix}`,
          simTime: context.simTime,
          submittedAtReal: new Date().toISOString(),
          payload: {
            schemaVersion: 'social-job-match-settlement-v1',
            planCommandId: original.commandId,
            planFingerprint: original.fingerprint,
            dueDayIndex: parsed.intent.dueDayIndex,
            ruleVersion: C.SOCIAL_JOB_MATCH_RULE_VERSION,
          },
        },
        sha,
      );
      C.parseSocialEmploymentServiceCommand(command, sha);
      return writer.executeDueMatch({ command });
    },
    async session({ signal }) {
      try {
        await principal(sessionAuthorization, signal);
        return {
          httpStatus: 200,
          body: {
            schemaVersion: 'g-social-office-session-v1',
            authorization: sessionAuthorization,
          },
        };
      } catch (e) {
        return failure(e);
      }
    },
    async handle({ authorization, request: body, signal }) {
      try {
        const r = request(body),
          p = await principal(authorization, signal);
        const simTime = await sourceTime();
        const command = canonical(r, p, simTime);
        return wireResult(
          await writer.executeManual({ command, principal: p }),
          r.requestId,
        );
      } catch (e) {
        return failure(e);
      }
    },
    async projection({ authorization, signal }) {
      try {
        const p = await principal(authorization, signal);
        return {
          httpStatus: 200,
          body: projectSocialOfficeDemoResult(
            await reader.readProjection({ principal: p }),
            scenario,
          ),
        };
      } catch (e) {
        return failure(e);
      }
    },
    async receipt({ authorization, requestId: id, signal }) {
      try {
        const originalId = requestId(id),
          p = await principal(authorization, signal);
        return wireResult(
          await reader.readReceipt({
            principal: p,
            commandId: socialOfficeDemoCommandId(originalId),
          }),
          originalId,
        );
      } catch (e) {
        return failure(e);
      }
    },
  });
  services.add(service);
  return service;
}
export function assertSocialOfficeDemoService(
  value: unknown,
): asserts value is Readonly<SocialOfficeDemoService> {
  if (!value || typeof value !== 'object' || !services.has(value))
    throw Error('SOCIAL_DEMO: original fixed service instance required');
}
