/** Real selected-source personnel + financial genesis. No invented balances,
 * paid payroll, fixture opening seed, SQL cluster or running World/Clock. */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  SOCIAL_POSITION_OFFER_CREATE_COMMAND,
  SOCIAL_POSITION_OFFER_CREATED_EVENT,
  SOCIAL_POSITION_OFFER_POLICY,
  createSocialPositionOfferLifecycleState,
  prepareAuthorizedSocialPositionOfferCreate,
  reduceSocialPositionOfferCreatedEvent,
  parseSocialPositionOfferCreateIntent,
  prepareSocialEmploymentServiceOperation,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  SOCIAL_JOB_MATCH_DUE_COMMAND,
  SOCIAL_JOB_MATCH_RULE_VERSION,
  canonicalSerialize,
  canonicalDecimal,
  parseWorldDecimal,
  parseCanonicalCommand,
  rebuildV08LedgersFromLineage,
  authenticateIdentity,
  authorizeOfficeCapability,
  authSubject,
  worldId,
  countryId,
  officeId,
  teamId,
  SimTime,
  eventId,
  eventType,
  type AuthorizedOfficeContext,
  type MembershipSnapshot,
  type CanonicalCommand,
  type SocialPositionOfferReadFacts,
  type SocialPositionOfferCreateIntent,
  type SocialPositionOfferLifecycleState,
  type ReplayReducerEvent,
} from '@econmind/core';
import { preparePostwarWorldGenesis } from '../../apps/world-worker/src/preparation/postwar-world-genesis.js';
import {
  createPostwarSocialEmploymentState,
  consumePostwarSocialEmploymentState,
} from '../../apps/world-worker/src/preparation/postwar-social-employment-state.js';

const digest = (s: string) => createHash('sha256').update(s).digest('hex');
let prepared: Awaited<ReturnType<typeof preparePostwarWorldGenesis>>;
let initial: SocialPositionOfferLifecycleState,
  facts: SocialPositionOfferReadFacts,
  intent: SocialPositionOfferCreateIntent;
let social: AuthorizedOfficeContext,
  finance: AuthorizedOfficeContext,
  membership: MembershipSnapshot;
let ledger: ReturnType<typeof rebuildV08LedgersFromLineage>['financial'];
const subject = authSubject('11111111-1111-4111-8111-111111111111');
function command(overrides: Record<string, unknown> = {}): CanonicalCommand {
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      actorId: 'ACTOR_TEST_ONLY_DUAL_OFFICE',
      authSubject: subject,
      commandId: 'SOCIAL_REAL_VACANCY_1',
      commandType: SOCIAL_POSITION_OFFER_CREATE_COMMAND,
      correlationId: 'SOCIAL_REAL_VACANCY_TRACE',
      countryId: membership.countryId,
      worldId: membership.worldId,
      officeId: 'SOCIAL',
      expectedWorldVersion: '0',
      idempotencyKey: 'SOCIAL_REAL_VACANCY_IDEM_1',
      simTime: '0',
      submittedAtReal: '2026-10-28T00:00:00.000Z',
      payload: intent,
      ...overrides,
    },
    digest,
  );
}
const apply = (
  state = initial,
  c = command(),
  readFacts = facts,
  extra: Record<string, unknown> = {},
) =>
  prepareAuthorizedSocialPositionOfferCreate({
    command: c,
    state,
    readFacts,
    sha256Hex: digest,
    socialAuthorization: social,
    financeAuthorization: finance,
    financialLedger: ledger,
    ...extra,
  });
function event(payload: unknown, c = command()): ReplayReducerEvent {
  return {
    eventId: eventId('EVENT_REAL_VACANCY_1'),
    eventType: eventType(SOCIAL_POSITION_OFFER_CREATED_EVENT),
    sequence: '1',
    worldId: c.worldId,
    transitionId: c.commandId,
    causationCommandId: c.commandId,
    worldVersionBefore: c.expectedWorldVersion!,
    worldVersionAfter: (BigInt(c.expectedWorldVersion!) + 1n).toString(),
    simTime: c.simTime,
    correctsEventId: null,
    payload,
  };
}
beforeAll(async () => {
  prepared = await preparePostwarWorldGenesis({
    repositoryRoot: path.resolve(import.meta.dirname, '../..'),
    worldId: 'WORLD_POSTWAR_POSITION_LIFECYCLE',
    seedId: 'SEED_POSTWAR_POSITION_LIFECYCLE',
    genesisVersion: 'POSTWAR_OPERATING_20261028_V1',
    valueDate: '2026-10-28',
  });
  const document = consumePostwarSocialEmploymentState(
    createPostwarSocialEmploymentState({
      labourPreparation: prepared.labour,
      labourState: prepared.materializedLabour.state,
      populationFacts: prepared.populationFacts,
      wages: prepared.wages,
      funding: prepared.funding,
    }),
  );
  // Select a real funded employer, finite service pool and same-skill
  // unemployment. The wage comes from an actual legal GOV source position.
  const candidates = document.countries.flatMap((country) =>
    country.state.servicePools.flatMap((pool) => {
      const account = prepared.funding.accounts.find(
        (a) => a.countryId === country.countryId && a.payerRole === 'GOV',
      );
      const wage = document.inputs.labour.positions.find(
        (p) =>
          p.countryId === country.countryId &&
          p.employerRole === 'GOV' &&
          ['PUBLIC_ADMINISTRATION', 'PUBLIC_SAFETY'].includes(
            p.classificationId,
          ) &&
          p.occupation === 'GENERAL' &&
          p.skill === pool.skill,
      );
      const unemployed = country.state.labour.aggregates.find(
        (a) =>
          a.locationId === pool.locationId &&
          a.skill === pool.skill &&
          a.status === 'UNEMPLOYED_SEARCHING',
      );
      return account &&
        parseWorldDecimal(account.remainingAmount).greaterThan('0') &&
        wage &&
        BigInt(pool.capacitySlots) > 0n &&
        unemployed &&
        BigInt(unemployed.count) > 0n
        ? [{ country, pool, wage }]
        : [];
    }),
  );
  const selected = candidates[0];
  if (!selected)
    throw Error(
      'ACTUAL_FUNDED_GOVERNMENT_VACANCY_SOURCE_NOT_FOUND:' +
        JSON.stringify({
          governmentAccounts: prepared.funding.accounts.filter(
            (a) => a.payerRole === 'GOV',
          ).length,
          unencumberedGovernmentAccounts: prepared.funding.accounts.filter(
            (a) =>
              a.payerRole === 'GOV' &&
              parseWorldDecimal(a.remainingAmount).greaterThan('0'),
          ).length,
          eligibleGovWagePositions: document.inputs.labour.positions.filter(
            (p) =>
              p.employerRole === 'GOV' &&
              ['PUBLIC_ADMINISTRATION', 'PUBLIC_SAFETY'].includes(
                p.classificationId,
              ) &&
              p.occupation === 'GENERAL',
          ).length,
          nonemptyUnemployment: document.state.labour.aggregates
            .filter(
              (a) =>
                a.status === 'UNEMPLOYED_SEARCHING' && BigInt(a.count) > 0n,
            )
            .map((a) => ({
              locationId: a.locationId,
              skill: a.skill,
              count: a.count,
            }))
            .slice(0, 3),
        }),
    );
  const { country, pool, wage } = selected;
  const account = prepared.funding.accounts.find(
    (a) => a.countryId === country.countryId && a.payerRole === 'GOV',
  )!;
  ledger = rebuildV08LedgersFromLineage({
    seed: prepared.financial.baselineSeed,
    sha256Hex: digest,
  }).financial;
  const scheduleId = wage.positionId;
  initial = createSocialPositionOfferLifecycleState(
    country.state,
    country.offers,
  );
  facts = {
    policyVersion: SOCIAL_POSITION_OFFER_POLICY,
    sourceRevision: country.sourceRevision,
    governmentEntityId: account.payerEntityId,
    centralBankEntityId: account.issuerEntityId,
    employment: {
      boundary: country.validationReadFacts.facts.boundary,
      simTime: '0',
      populationAvailability:
        country.validationReadFacts.facts.populationAvailability,
      minimumWage: country.minimumWage,
    },
    wageSchedule: {
      scheduleId,
      countryId: country.countryId,
      skill: pool.skill,
      publicService:
        wage.classificationId as SocialPositionOfferCreateIntent['publicService'],
      occupation: 'GENERAL',
      amount: canonicalDecimal(parseWorldDecimal(wage.wageAmount)),
      currency: wage.wageCurrency,
      period: 'SIM_YEAR',
      wageVersion: wage.wageVersion,
      validFromDayIndex: '0',
      validUntilDayIndex: '1',
    },
    funding: {
      accountId: account.accountRef,
      countryId: country.countryId,
      ownerId: account.payerEntityId,
      currency: account.currency,
      liquidBalance: canonicalDecimal(
        parseWorldDecimal(account.availableAmount),
      ),
      priorReservations: [
        {
          reservationId: `ORIGINAL_${country.countryId}`,
          sourceRef: account.sourceBalanceRef,
          amount: canonicalDecimal(parseWorldDecimal(account.reservedAmount)),
        },
      ],
    },
  };
  intent = {
    schemaVersion: 'social-employment-position-offer-create-v1',
    positionId: 'POSITION_REAL_FUNDED_VACANCY',
    locationId: pool.locationId,
    skill: pool.skill,
    publicService:
      wage.classificationId as SocialPositionOfferCreateIntent['publicService'],
    occupation: 'GENERAL',
    requiredCount: '1',
    wageScheduleRef: scheduleId,
    fundingAccountId: account.accountRef,
    coverageDays: '1',
  };
  membership = {
    authorizationVersion: 'TEST_ONLY_REV_1',
    authSubject: subject,
    worldId: worldId(country.worldId),
    teamId: teamId('TEAM_TEST_ONLY_DUAL_OFFICE'),
    countryId: countryId(country.countryId),
    officeAssignments: [officeId('SOCIAL'), officeId('FINANCE')],
    active: true,
    suspended: false,
    isWorldAdmin: false,
    negotiationPartyIds: [],
  };
  const principal = await authenticateIdentity({
    token: 'TEST_ONLY_EXPLICIT_IDENTITY',
    profile: { user_id: subject, display_name: null, school_id: null },
    verifier: {
      async verify() {
        return {
          subject,
          issuer: 'TEST_ONLY_LOCAL_CORE_TEST',
          audience: 'TEST_ONLY_CORE',
          issuedAt: '2026-10-28T00:00:00.000Z',
          expiresAt: '2026-10-29T00:00:00.000Z',
        };
      },
    },
  });
  const resolver = {
    async resolveCurrentIdentity() {
      return subject;
    },
    async resolveCurrentMembership() {
      return membership;
    },
  };
  social = await authorizeOfficeCapability({
    principal,
    resolver,
    worldId: membership.worldId,
    requestedCountryId: membership.countryId,
    requestedOfficeId: officeId('SOCIAL'),
    capability: 'SOCIAL_LABOUR',
  });
  finance = await authorizeOfficeCapability({
    principal,
    resolver,
    worldId: membership.worldId,
    requestedCountryId: membership.countryId,
    requestedOfficeId: officeId('FINANCE'),
    capability: 'FINANCE_BUDGET',
  });
}, 120000);
describe('canonical actual-source funded government position + offer lifecycle', () => {
  it('creates only an unfilled legal vacancy and exact reserved-not-paid payroll, preserving all existing jobs/people/money', async () => {
    const beforeLedger = canonicalSerialize(ledger),
      before = canonicalSerialize(initial);
    const result = await apply();
    expect(result.source).toBe('APPLIED');
    expect(result.state.employment.labour.positions).toHaveLength(
      initial.employment.labour.positions.length + 1,
    );
    expect(
      result.state.employment.labour.positions.find(
        (p) => p.positionId === intent.positionId,
      ),
    ).toMatchObject({
      requiredCount: '1',
      employedCount: '0',
      owner: 'PUBLIC_SERVICE',
      classificationId: intent.publicService,
    });
    expect(
      result.state.employment.labour.positions.filter(
        (p) => p.positionId !== intent.positionId,
      ),
    ).toEqual(initial.employment.labour.positions);
    expect(result.state.employment.labour.aggregates).toEqual(
      initial.employment.labour.aggregates,
    );
    expect(result.reservation).toMatchObject({
      state: 'RESERVED_NOT_PAID',
      coverageDays: '1',
      denominator: '360',
      employerId: facts.governmentEntityId,
    });
    expect(result.offer).toMatchObject({
      state: 'ACTIVE',
      employerRole: 'GOV',
      payrollFundingRef: result.reservation.reservationId,
    });
    expect(canonicalSerialize(ledger)).toBe(beforeLedger);
    expect(canonicalSerialize(initial)).toBe(before);
    expect(result.eventPayload).not.toHaveProperty('financialPosting');
    const repeat = await apply(result.state);
    expect(repeat.source).toBe('EXACT_DUPLICATE');
    expect(repeat.eventPayload).toBeNull();
    expect(repeat.state.reservations).toHaveLength(1);
    const retraced = await apply(
      result.state,
      command({
        correlationId: 'RETRY_DIFFERENT_AUDIT_TRACE',
        submittedAtReal: '2026-10-28T00:00:01.000Z',
      }),
    );
    expect(retraced.source).toBe('EXACT_DUPLICATE');
    expect(retraced.state).toBe(result.state);
    expect(retraced.eventPayload).toBeNull();
  });
  it('replays the exact canonical create event and rejects payload/causation/predecessor tampering', async () => {
    const result = await apply();
    expect(
      reduceSocialPositionOfferCreatedEvent({
        state: initial,
        event: event(result.eventPayload),
        sha256Hex: digest,
      }),
    ).toEqual(result.state);
    for (const changed of [
      { ...result.eventPayload, afterStateHash: 'sha256:' + '0'.repeat(64) },
      {
        ...result.eventPayload,
        offer: { ...result.offer, amount: '999999999' },
      },
    ])
      expect(() =>
        reduceSocialPositionOfferCreatedEvent({
          state: initial,
          event: event(changed),
          sha256Hex: digest,
        }),
      ).toThrow();
    expect(() =>
      reduceSocialPositionOfferCreatedEvent({
        state: initial,
        event: { ...event(result.eventPayload), worldVersionBefore: '1' },
        sha256Hex: digest,
      }),
    ).toThrow('causation');
  });
  it('feeds the real vacancy into existing PLAN and MATCH while conserving people and leaving the budget reservation unpaid', async () => {
    const created = await apply();
    const pool = created.state.employment.servicePools.find(
      (p) => p.locationId === intent.locationId && p.skill === intent.skill,
    )!;
    const plan = command({
      commandId: 'SOCIAL_REAL_PLAN',
      commandType: SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
      expectedWorldVersion: '1',
      idempotencyKey: 'SOCIAL_REAL_PLAN_IDEM',
      payload: {
        schemaVersion: 'social-employment-service-plan-v1',
        locationId: intent.locationId,
        skill: intent.skill,
        positionId: intent.positionId,
        servicePoolId: pool.poolId,
        requestedMatches: '1',
        dueDayIndex: '0',
      },
    });
    const planned = prepareSocialEmploymentServiceOperation({
      command: plan,
      state: created.state.employment,
      readFacts: { ...facts.employment, offer: created.offer },
      sha256Hex: digest,
    });
    const due = command({
      commandId: 'SOCIAL_REAL_MATCH',
      commandType: SOCIAL_JOB_MATCH_DUE_COMMAND,
      officeId: null,
      expectedWorldVersion: '2',
      idempotencyKey: 'SOCIAL_REAL_MATCH_IDEM',
      simTime: '1',
      payload: {
        schemaVersion: 'social-job-match-settlement-v1',
        planCommandId: plan.commandId,
        planFingerprint: plan.fingerprint,
        dueDayIndex: '0',
        ruleVersion: SOCIAL_JOB_MATCH_RULE_VERSION,
      },
    });
    const matched = prepareSocialEmploymentServiceOperation({
      command: due,
      state: planned.state,
      readFacts: { ...facts.employment, simTime: '1', offer: created.offer },
      sha256Hex: digest,
    });
    expect(matched.result.matched).toBe('1');
    expect(
      matched.state.labour.positions.find(
        (p) => p.positionId === intent.positionId,
      )?.employedCount,
    ).toBe('1');
    const total = (s: typeof initial.employment) =>
      s.labour.aggregates.reduce((n, a) => n + BigInt(a.count), 0n);
    expect(total(matched.state)).toBe(total(initial.employment));
    expect(created.reservation.state).toBe('RESERVED_NOT_PAID');
    expect(due.simTime).toEqual(SimTime.fromTicks('1'));
  });
  it('rejects missing/copy/revoked budget authority, non-current financial lineage and insufficient actual free funds', async () => {
    await expect(
      apply(initial, command(), facts, {
        financeAuthorization: { ...finance },
      }),
    ).rejects.toThrow();
    await expect(
      apply(initial, command(), facts, { financeAuthorization: social }),
    ).rejects.toThrow('authorization');
    await expect(
      apply(initial, command(), facts, { financialLedger: { ...ledger } }),
    ).rejects.toThrow('financial lineage');
    membership = { ...membership, suspended: true };
    try {
      await expect(apply()).rejects.toThrow();
    } finally {
      membership = { ...membership, suspended: false };
    }
    membership = { ...membership, authorizationVersion: 'TEST_ONLY_REV_2' };
    try {
      await expect(apply()).rejects.toThrow('authorization');
    } finally {
      membership = { ...membership, authorizationVersion: 'TEST_ONLY_REV_1' };
    }
    const exhausted = {
      ...facts,
      funding: {
        ...facts.funding,
        priorReservations: [
          {
            reservationId: 'ALREADY_RESERVED_ALL',
            sourceRef: facts.funding.priorReservations[0]!.sourceRef,
            amount: facts.funding.liquidBalance,
          },
        ],
      },
    };
    await expect(apply(initial, command(), exhausted)).rejects.toThrow(
      'unencumbered',
    );
  });
  it('rejects source/intent scope and occupation/skill changes, expired floors, overwrites and duplicate conflicts', async () => {
    expect(() =>
      parseSocialPositionOfferCreateIntent({ ...intent, wageAmount: '0' }),
    ).toThrow('unknown');
    await expect(
      apply(
        initial,
        command({
          payload: {
            ...intent,
            publicService: 'EDUCATION',
            occupation: 'TEACHER',
            skill: 'LOW',
          },
        }),
        {
          ...facts,
          wageSchedule: {
            ...facts.wageSchedule,
            publicService: 'EDUCATION',
            occupation: 'TEACHER',
            skill: 'LOW',
          },
        },
      ),
    ).rejects.toThrow('occupation');
    await expect(
      apply(initial, command(), {
        ...facts,
        funding: { ...facts.funding, ownerId: 'ENTITY_FOREIGN' },
      }),
    ).rejects.toThrow('scope');
    await expect(
      apply(initial, command(), {
        ...facts,
        wageSchedule: { ...facts.wageSchedule, validUntilDayIndex: '0' },
      }),
    ).rejects.toThrow('expired');
    await expect(
      apply(
        initial,
        command({
          payload: {
            ...intent,
            positionId: initial.employment.labour.positions[0]!.positionId,
          },
        }),
      ),
    ).rejects.toThrow('overwritten');
    const created = await apply();
    await expect(
      apply(
        created.state,
        command({ payload: { ...intent, requiredCount: '2' } }),
      ),
    ).rejects.toThrow('idempotency');
  });
});
