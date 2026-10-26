/** Service authentication/wire units only. No PostgreSQL connection or native business acceptance. */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
// Test-only compiled entry; production API uses its declared bare workspace export.
import {
  PostgresSqlDatabase,
  projectSocialOfficeDemoResult,
} from '../../apps/world-worker/dist/social-office-demo/consumer.js';
// @ts-expect-error -- Test-only A .mjs data bridge; applications do not import tools.
import * as A from '../../tools/social-office-demo/check-opening-finance.mjs';
// @ts-expect-error -- Test-only .mjs report helper; no host is started by importing it.
import { serializeSocialOfficeDemoEvidence } from '../../tools/social-office-demo/run.mjs';
import {
  loadSocialOfficeDemoScenario,
  type SocialOfficeDemoScenario,
} from '../../apps/world-worker/src/social-office-demo/scenario-input.js';
import { createIsolatedSocialOfficeIdentity } from '../support/f-social-office-isolated-host.js';
import {
  createSocialOfficeDemoService,
  socialOfficeDemoCanonicalIdentity,
  socialOfficeDemoCommandId,
  type SocialOfficeDemoService,
  type SocialOfficeDemoServiceConfig,
} from '../../apps/world-api/src/integration/social-office-demo-service.js';
import { createSocialOfficeDemoTransport } from '../../apps/world-api/src/integration/social-office-demo-transport.js';
import { parseSocialDemoProjection } from '../../apps/world-web/src/social-office-demo/contract.js';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const ID = '11111111-1111-4111-8111-111111111111';
let scenario: Readonly<SocialOfficeDemoScenario>,
  config: SocialOfficeDemoServiceConfig,
  service: Readonly<SocialOfficeDemoService>;
let identity: ReturnType<typeof createIsolatedSocialOfficeIdentity>;
const pools = [0, 1].map(
  () =>
    new Pool({
      host: path.resolve('node_modules/.cache/g-social-auth-not-installed'),
      port: 1,
      user: 'social_auth_unit_only',
      database: 'not_installed',
      max: 1,
      connectionTimeoutMillis: 100,
    }),
);
beforeAll(async () => {
  const f: unknown = A.selectOpeningFinanceCandidateData(
    A.readOpeningFinanceDistribution(),
    {
      meaning: 'ACCRUAL',
      domainVariant: 'G_DOMAIN_BASELINE_PROPOSAL',
      financeOptionId: 'SIM_SOCIAL_OPENING_BASELINE_V1_PROPOSAL',
    },
  );
  scenario = await loadSocialOfficeDemoScenario({
    openingFinanceCandidateUtf8: C.canonicalSerialize(f),
  });
  identity = createIsolatedSocialOfficeIdentity();
  config = {
    readDatabase: new PostgresSqlDatabase(pools[0]!),
    writerDatabase: new PostgresSqlDatabase(pools[1]!),
    scenario,
    worker: { holderId: 'SOCIAL_DEMO_WORKER_V1', fencingToken: '1' },
    auth: identity.config,
    sessionAuthorization: identity.authorization,
  };
  service = createSocialOfficeDemoService(config);
});
afterEach(() => {
  for (const p of pools) expect(p.totalCount).toBe(0);
});
afterAll(async () => {
  await Promise.all(pools.map((p) => p.end()));
});
const valid = () => ({
  requestId: ID,
  action: 'PLAN',
  expectedWorldVersion: '0',
});

describe('G canonical identity successor, Core construction only, no native installation', () => {
  function plan() {
    return C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        ...socialOfficeDemoCanonicalIdentity(
          'MANUAL',
          'abcdefab-cdef-4abc-8def-abcdefabcdef',
        ),
        commandType: C.SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
        worldId: scenario.scope.worldId,
        countryId: scenario.scope.countryId,
        actorId: scenario.executionIdentity.manual.actorId,
        authSubject: scenario.executionIdentity.manual.authSubject,
        officeId: 'SOCIAL',
        expectedWorldVersion: '0',
        simTime: '0',
        submittedAtReal: '2026-10-27T00:00:00.000Z',
        payload: {
          schemaVersion: 'social-employment-service-plan-v1',
          locationId: scenario.scope.locationId,
          skill: 'MEDIUM',
          positionId: 'POSITION_SIM_CLINIC_NURSE_02',
          servicePoolId: 'SIM_EMP_POOL_MEDIUM_D1',
          requestedMatches: '1',
          dueDayIndex: '1',
        },
      },
      sha,
    );
  }
  it('diagnostic serialization preserves actual Core FINAL SimTime and numeric HTTP/cleanup metadata together', () => {
    const command = plan(),
      receipt = C.createFinalCommandReceipt({
        command,
        outcome: 'REJECTED',
        reasonCode: 'PROGRAMME_DURATION_NOT_MET',
        transition: null,
        simTime: C.SimTime.fromTicks('86400000'),
        recordedAtReal: '2026-10-27T00:00:00.000Z',
      }),
      automatic = { status: 'FINAL', receipt },
      originalCanonical = C.canonicalSerialize(automatic);
    expect(
      Object.getOwnPropertyDescriptor(receipt.simTime, 'ticks')?.value,
    ).toBe(86400000n);
    const wire = JSON.parse(
      serializeSocialOfficeDemoEvidence({
        httpStatus: 200,
        cleanup: { activeSessions: 0 },
        automatic,
      }),
    ) as {
      httpStatus: number;
      cleanup: { activeSessions: number };
      automatic: { receipt: { simTime: string } };
    };
    expect(wire.httpStatus).toBe(200);
    expect(wire.cleanup.activeSessions).toBe(0);
    expect(wire.automatic).toEqual(JSON.parse(originalCanonical));
    expect(wire.automatic.receipt.simTime).toBe('86400000');
    expect(C.canonicalSerialize(automatic)).toBe(originalCanonical);
    expect(() =>
      serializeSocialOfficeDemoEvidence({ unadapted: 1n, httpStatus: 200 }),
    ).toThrow();
  });
  it('canonical identity maps alphabetic UUIDs consistently through actual Core construction and receipt lookup', () => {
    const original = 'abcdefab-cdef-4abc-8def-abcdefabcdef',
      command = plan();
    expect(command.commandId).toBe(socialOfficeDemoCommandId(original));
    expect(command.commandId).toContain('ABCDEFAB_CDEF_4ABC_8DEF_ABCDEFABCDEF');
    expect(C.parseSocialEmploymentServiceCommand(command, sha).kind).toBe(
      'PLAN',
    );
    expect(original).toBe('abcdefab-cdef-4abc-8def-abcdefabcdef');
  });
  it('canonical identity maps a real lowercase digest deterministically for actual Core automatic construction', () => {
    const original = plan(),
      digest = sha(C.canonicalSerialize({ original: original.fingerprint })),
      identity = socialOfficeDemoCanonicalIdentity('DUE', digest);
    const automatic = C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        ...identity,
        commandType: C.SOCIAL_JOB_MATCH_DUE_COMMAND,
        worldId: scenario.scope.worldId,
        countryId: scenario.scope.countryId,
        actorId: scenario.executionIdentity.publisher.actorId,
        authSubject: scenario.executionIdentity.publisher.authSubject,
        officeId: null,
        expectedWorldVersion: '1',
        simTime: '86400000',
        submittedAtReal: '2026-10-27T00:00:00.000Z',
        payload: {
          schemaVersion: 'social-job-match-settlement-v1',
          planCommandId: original.commandId,
          planFingerprint: original.fingerprint,
          dueDayIndex: '1',
          ruleVersion: C.SOCIAL_JOB_MATCH_RULE_VERSION,
        },
      },
      sha,
    );
    expect(identity).toEqual(socialOfficeDemoCanonicalIdentity('DUE', digest));
    expect(automatic.commandId).toContain(digest.toUpperCase());
    expect(C.parseSocialEmploymentServiceCommand(automatic, sha).kind).toBe(
      'MATCH',
    );
    expect(original.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });
});

describe('G fixed service crypto and refusal boundary, no native installation', () => {
  it('verifies the real F ES256 session through the existing verifier without treating it as a native grant', async () => {
    const result = await service.session({});
    expect(result.httpStatus).toBe(200);
    const body = result.body as Record<string, unknown>;
    // Assert a boolean so a failed test cannot print the actual bearer.
    expect(
      body.schemaVersion === 'g-social-office-session-v1' &&
        typeof body.authorization === 'string' &&
        body.authorization.startsWith('Bearer '),
    ).toBe(true);
    expect(
      Object.hasOwn(body, 'authorized') ||
        Object.hasOwn(body, 'sourceAdmitted'),
    ).toBe(false);
  });
  it('refuses missing authentication before any database access', async () => {
    const result = await service.handle({
      authorization: null,
      request: valid(),
    });
    expect(result.httpStatus).toBe(401);
  });
  it('refuses an altered real signature without consulting a source or granting a command', async () => {
    const pieces = identity.authorization.split('.');
    pieces[2] = `${pieces[2]![0] === 'A' ? 'B' : 'A'}${pieces[2]!.slice(1)}`;
    const result = await service.handle({
      authorization: pieces.join('.'),
      request: valid(),
    });
    expect(result.httpStatus).toBe(401);
  });
  it.each([
    'actorId',
    'authSubject',
    'simTime',
    'capability',
    'graduates',
    'ledgerBefore',
  ])(
    'refuses browser-supplied %s instead of using it as authority or state',
    async (field) => {
      const result = await service.handle({
        authorization: identity.authorization,
        request: { ...valid(), [field]: 'INJECTED_UNIT_DATA' },
      });
      expect(result.httpStatus).toBe(400);
    },
  );
  it('does not expose automatic MATCH as a manual request action', async () => {
    const result = await service.handle({
      authorization: identity.authorization,
      request: { ...valid(), action: 'MATCH' },
    });
    expect(result.httpStatus).toBe(400);
  });
  it('refuses a supplied handler/repository or plain fake database adapter at composition', () => {
    expect(() =>
      createSocialOfficeDemoService({
        ...config,
        repository: { executeManual: () => 'FINAL' },
      } as never),
    ).toThrow('Unexpected');
    expect(() =>
      createSocialOfficeDemoService({
        ...config,
        writerDatabase: {} as SocialOfficeDemoServiceConfig['writerDatabase'],
      }),
    ).toThrow('original database');
  });
  it('does not attach transport to caller-defined fake business methods or a foreign origin', () => {
    expect(() =>
      createSocialOfficeDemoTransport({
        service: {} as SocialOfficeDemoService,
        allocatedOrigin: 'http://127.0.0.1:3000',
      }),
    ).toThrow('original fixed service');
    expect(() =>
      createSocialOfficeDemoTransport({
        service,
        allocatedOrigin: 'https://example.com',
      }),
    ).toThrow('exact loopback');
  });
  it('maps genuine n0 constructor data to browser wire without certifying a native authorized read', () => {
    const ledgers = C.rebuildV08LedgersFromLineage({
      seed: scenario.seed,
      sha256Hex: sha,
    });
    const data = {
      schemaVersion: 'social-office-simulated-projection-v1',
      sourceClass: 'SIMULATED_OPENING',
      scope: scenario.scope,
      head: { worldVersion: '0', eventSequence: '0' },
      source: {
        generation: '1',
        manifestHash: sha(C.canonicalSerialize(scenario.initialPublication)),
        asOf: { simTime: '0' },
      },
      social: scenario.socialOpening,
      inventory: ledgers.inventory,
      financial: ledgers.financial,
    };
    const wire = parseSocialDemoProjection(
      projectSocialOfficeDemoResult(data, scenario),
    );
    expect(wire.employment).toEqual({
      vacancies: '1',
      freeServiceSlots: '6',
      planState: 'NONE',
      matched: null,
      planCommandId: null,
      settlementCommandId: null,
    });
    expect(wire.clinic.medicineAvailable).toBe('5');
    expect(wire.sourceAdmitted).toBe(false);
    expect(wire).not.toHaveProperty('inventory');
    expect(wire).not.toHaveProperty('financial');
    expect(() =>
      projectSocialOfficeDemoResult(
        { ...data, head: { worldVersion: '1', eventSequence: '1' } },
        scenario,
      ),
    ).toThrow('incomplete protected replay');
  });
});
