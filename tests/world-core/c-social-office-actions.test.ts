import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as C from '../../packages/core/src/index.js';

const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => C.canonicalSha256(C.canonicalHashInput(v), digest);
const WORLD = C.worldId('WORLD_SOCIAL_TEST'),
  COUNTRY = C.countryId('COUNTRY_01'),
  GOV = C.legalEntityId('GOV_TEST');
const LOCATION = 'REGION_01_E1',
  DAY = 86400000n,
  NOW = '2026-10-26T00:00:00.000Z';
const clone = <T>(v: T): T => JSON.parse(C.canonicalSerialize(v)) as T;
const cash = (amount: string) => ({ amount, currency: 'XAA' });
/** TEST_ONLY whole-office component fixture; no adopted scenario or source admission. */
function fixture() {
  const medicine = C.createInventoryAccount({
    worldId: WORLD,
    countryId: COUNTRY,
    commodityId: C.commodityId('MEDICINE_TEST'),
    batchId: C.inventoryBatchId('MEDICINE_BATCH'),
    unit: 'medical_dose',
    physicalLocationId: C.inventoryLocationId('CLINIC_STORE'),
    bucket: 'AVAILABLE',
    reservationId: null,
    shipmentId: null,
    titleHolderId: GOV,
    riskBearerId: GOV,
    economicRecognitionId: null,
  });
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST'),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/world-core/c-social-office-actions.test.ts',
      sourceVersion: 'TEST_ONLY_V1',
      payload: { classification: 'TEST_ONLY' },
    },
    digest,
  );
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST'),
      worldId: WORLD,
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [
        {
          entryId: C.openingInventoryEntryId('MEDICINE_OPENING'),
          sourceId: source.sourceId,
          account: medicine,
          quantity: C.Quantity.from('5', 'medical_dose'),
        },
      ],
      financialBatches: [],
    },
    digest,
  );
  const ledgers = C.rebuildV08LedgersFromLineage({ seed, sha256Hex: digest });
  const availability = [
    { countryId: COUNTRY, locationId: LOCATION, workingAgeAvailable: '24' },
  ];
  const positions = [
    ['CASEWORKER', 'MEDIUM', 'PUBLIC_ADMINISTRATION'],
    ['TEACHER', 'HIGH', 'EDUCATION'],
    ['DOCTOR', 'HIGH', 'HEALTHCARE'],
    ['NURSE', 'MEDIUM', 'HEALTHCARE'],
    ['MEDICAL_TECHNICIAN', 'MEDIUM', 'HEALTHCARE'],
    ['SUPPORT', 'LOW', 'HEALTHCARE'],
  ].map(([id, skill, classificationId]) => ({
    positionId: `POSITION_${id}`,
    countryId: COUNTRY,
    locationId: LOCATION,
    skill: skill as C.LabourSkill,
    owner: 'PUBLIC_SERVICE' as const,
    classificationId: classificationId!,
    requiredCount: id === 'NURSE' ? '2' : '1',
    employedCount: '1',
  }));
  const aggregates = [
    ['LOW', 'EMPLOYED', '1'],
    ['LOW', 'STUDENT', '5'],
    ['LOW', 'UNEMPLOYED_SEARCHING', '6'],
    ['MEDIUM', 'EMPLOYED', '3'],
    ['MEDIUM', 'UNEMPLOYED_SEARCHING', '5'],
    ['HIGH', 'EMPLOYED', '2'],
    ['HIGH', 'UNEMPLOYED_SEARCHING', '2'],
  ].map(([skill, status, count]) => ({
    countryId: COUNTRY,
    locationId: LOCATION,
    skill: skill as C.LabourSkill,
    status: status as C.LabourStatus,
    count: count!,
  }));
  const labour = C.applyLabourFacts({
    boundary: C.createE01DailyBoundary('0'),
    populationAvailability: availability,
    state: {
      aggregates,
      positions,
      wageAssertions: [],
      appliedFactBindings: [],
    },
    facts: [],
  }).state;
  const resource = (
    name: string,
    day: string,
    unit: 'staff_minute' | 'facility_minute' = 'staff_minute',
  ): C.SocialOfficeResourceV1 => ({
    resourceId: `RESOURCE_${name}_DAY_${day}`,
    canonicalPhysicalResourceId: `PHYSICAL_${name}`,
    canonicalOriginId: `ORIGIN_${name}`,
    originalSourceRecordId: 'SOURCE_RESOURCES',
    worldId: WORLD,
    countryId: COUNTRY,
    locationId: LOCATION,
    windowId: `DAY_${day}`,
    dayIndex: day,
    startSimTime: (BigInt(day) * DAY).toString(),
    endSimTime: ((BigInt(day) + 1n) * DAY).toString(),
    unit,
    capacity: '360',
    eligibilityRuleVersion: 'QUALIFICATION_TEST_V1',
    positionId: unit === 'staff_minute' ? `POSITION_${name}` : null,
    qualification: name,
    assignedPeople: unit === 'staff_minute' ? '1' : '0',
  });
  const resources = [
    'CASEWORKER',
    'TEACHER',
    'DOCTOR',
    'NURSE',
    'MEDICAL_TECHNICIAN',
    'SUPPORT',
  ].map((n) => resource(n, '0'));
  resources.push(resource('ROOM', '0', 'facility_minute'));
  for (let d = 1; d <= 20; d++)
    resources.push(resource('TEACHER', d.toString()));
  for (const d of ['10', '20'])
    for (const n of [
      'CASEWORKER',
      'DOCTOR',
      'NURSE',
      'MEDICAL_TECHNICIAN',
      'SUPPORT',
    ])
      resources.push(resource(n, d));
  const recipe = (name: string, n: string) => ({
    resourceId: `PHYSICAL_${name}`,
    amountPerUnit: n,
  });
  const cost = (
    budgetId: string,
    amount: string,
  ): C.SocialOfficeCostRuleV1 => ({
    mode: 'BUDGET_VALUATION_ONLY',
    budgetId,
    budgetPerUnit: cash(amount),
    financialLegs: [],
    recognitionRuleVersion: 'TEST_BUDGET_VALUATION_V1',
  });
  const rule: C.SocialOfficeProgrammeRuleV1 = {
    programmeId: 'PROGRAMME_TEST',
    ruleVersion: 'PROGRAMME_TEST_V1',
    ruleSourceRecordId: 'SOURCE_PROGRAMME',
    level: 'VOCATIONAL',
    specialisationId: 'GENERAL_TECHNICAL',
    sourceSkill: 'LOW',
    targetSkill: 'MEDIUM',
    eligibleStatus: 'STUDENT',
    requiredDurationSimDays: '10',
    seats: '6',
    studentsPerQualifiedTeacher: '6',
    teacherPositionId: 'POSITION_TEACHER',
    teacherQualification: 'TEACHER',
    teachingMinutesPerStudentPerSimDay: '60',
    teachingResourceIds: resources
      .filter((r) => r.qualification === 'TEACHER')
      .map((r) => r.resourceId),
    admissionRecipe: [
      recipe('CASEWORKER', '10'),
      recipe('TEACHER', '15'),
      recipe('SUPPORT', '10'),
    ],
    assessmentRecipe: [
      recipe('TEACHER', '30'),
      recipe('CASEWORKER', '10'),
      recipe('SUPPORT', '10'),
    ],
    dropoutRate: { numerator: '0', denominator: '1' },
    completionRate: { numerator: '1', denominator: '3' },
    integerPolicy: 'FLOOR_WHOLE_PEOPLE_RETAIN_REMAINDER',
    nonGraduateDisposition: 'RETAIN_STUDENT_AND_SEAT',
    admissionCost: cost('EDUCATION_BUDGET', '50'),
    graduationCost: cost('EDUCATION_BUDGET', '0'),
  };
  const clinic: C.SocialOfficeClinicRuleV1 = {
    clinicId: 'CLINIC_TEST',
    ruleVersion: 'CLINIC_TEST_V1',
    ruleSourceRecordId: 'SOURCE_CLINIC',
    careType: 'PRIMARY',
    staffRecipe: [
      recipe('DOCTOR', '30'),
      recipe('NURSE', '20'),
      recipe('MEDICAL_TECHNICIAN', '15'),
      recipe('SUPPORT', '10'),
    ],
    facilityRecipe: [recipe('ROOM', '20')],
    medicineAccount: medicine,
    medicineSourceRecordId: 'SOURCE_MEDICINE',
    dosesPerCase: '1',
    cost: cost('CLINIC_BUDGET', '40'),
    demandAdmissionPolicy: 'ONCE_PER_ORIGINAL_DEMAND',
    serviceOrderingPolicy: 'BACKLOG_THEN_SOURCE_ORDER',
    attemptAccountingMode: 'SIMULATED_ATOMIC_COMPLETED_SERVICE_V1',
  };
  const facts: C.SocialOfficeReadFactsV1 = {
    schemaVersion: 'social-office-read-facts-v1',
    sourceBinding: {
      sourceClass: 'SIMULATED_OPENING',
      sourceAdmitted: false,
      sourceGeneration: '1',
      manifestHash: hash({ TEST_ONLY: true }),
      selectedRecordIds: [
        'SOURCE_RESOURCES',
        'SOURCE_PROGRAMME',
        'SOURCE_CLINIC',
        'SOURCE_MEDICINE',
        'SOURCE_APPLICANTS',
        'SOURCE_DEMAND',
        'SOURCE_BUDGET',
      ],
      worldId: WORLD,
      countryId: COUNTRY,
      locationId: LOCATION,
      purpose: 'ADMIT',
    },
    simTime: '0',
    dayBoundary: C.createE01DailyBoundary('0'),
    populationAvailability: availability,
    employmentReadFacts: null,
    programmeRules: [rule],
    applicantPools: [
      {
        applicantPoolId: 'APPLICANTS_TEST',
        programmeId: rule.programmeId,
        sourceSkill: 'LOW',
        eligibleStatus: 'STUDENT',
        memberIds: ['STUDENT_4', 'STUDENT_5'],
        sourceRecordId: 'SOURCE_APPLICANTS',
      },
    ],
    clinicRules: [clinic],
    demandWindows: [
      {
        clinicId: clinic.clinicId,
        careWindowId: 'CARE_DAY_0',
        demandId: 'DEMAND_DAY_0',
        canonicalOriginId: 'ORIGINAL_DEMAND_DAY_0',
        dayIndex: '0',
        newCases: '10',
        sourceRecordId: 'SOURCE_DEMAND',
      },
    ],
    resourceAllocations: resources,
    approvedBudgets: [
      {
        budgetId: 'EDUCATION_BUDGET',
        approvedAmount: cash('300'),
        sourceRecordId: 'SOURCE_BUDGET',
      },
      {
        budgetId: 'CLINIC_BUDGET',
        approvedAmount: cash('400'),
        sourceRecordId: 'SOURCE_BUDGET',
      },
    ],
    employmentRecipes: [],
  };
  const future = resources.filter(
    (r) => r.qualification === 'TEACHER' && BigInt(r.dayIndex) < 10n,
  );
  const state: C.SocialOfficeStateV1 = {
    schemaVersion: 'social-office-state-v1',
    worldId: WORLD,
    countryId: COUNTRY,
    locationId: LOCATION,
    employment: {
      schemaVersion: 'social-employment-service-state-v1',
      worldId: WORLD,
      labour,
      servicePools: [],
      plans: [],
      appliedOperations: [],
    },
    programmes: [rule],
    cohorts: [
      {
        cohortId: 'OLD_COHORT',
        programmeId: rule.programmeId,
        programmeRuleVersion: rule.ruleVersion,
        anchorDayIndex: '0',
        elapsedSimDaysAtAnchor: '0',
        requiredDurationSimDays: '10',
        alreadyCompletedTeachingMinutes: '0',
        futureTeachingReservations: future.map((r) => ({
          resourceId: r.resourceId,
          dayIndex: r.dayIndex,
          amount: '180',
        })),
        originalEnrolled: '3',
        graduates: '0',
        memberIds: ['STUDENT_1', 'STUDENT_2', 'STUDENT_3'],
        state: 'OPEN',
      },
    ],
    applicantAssignments: ['STUDENT_1', 'STUDENT_2', 'STUDENT_3'],
    clinic: {
      clinicId: clinic.clinicId,
      backlog: '4',
      admittedDemandOrigins: [],
    },
    resourceWindows: future.map((r) => ({
      allocation: r,
      used: '0',
      reservations: [{ reservationId: 'OLD_COHORT', amount: '180' }],
    })),
    budgetCommitments: [
      {
        budgetId: 'EDUCATION_BUDGET',
        approvedAmount: cash('300'),
        committedAmount: cash('150'),
      },
    ],
    appliedOperations: [],
  };
  return { state, facts, seed, ledgers, resource, medicine };
}
function command(
  kind: 'ADMIT' | 'GRADUATE' | 'SERVE',
  extra: Record<string, unknown> = {},
) {
  const payload =
    kind === 'ADMIT'
      ? {
          schemaVersion: 'social-college-admit-v1',
          programmeId: 'PROGRAMME_TEST',
          programmeRuleVersion: 'PROGRAMME_TEST_V1',
          cohortId: 'NEW_COHORT',
          applicantPoolId: 'APPLICANTS_TEST',
        }
      : kind === 'GRADUATE'
        ? {
            schemaVersion: 'social-college-graduate-v1',
            cohortId: 'OLD_COHORT',
            programmeRuleVersion: 'PROGRAMME_TEST_V1',
          }
        : {
            schemaVersion: 'social-clinic-serve-v1',
            clinicId: 'CLINIC_TEST',
            careWindowId: 'CARE_DAY_0',
            clinicRuleVersion: 'CLINIC_TEST_V1',
          };
  return C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      actorId: 'ACTOR_SOCIAL',
      authSubject: '11111111-1111-4111-8111-111111111111',
      commandId: `COMMAND_${kind}`,
      commandType:
        kind === 'ADMIT'
          ? C.SOCIAL_COLLEGE_ADMIT_COMMAND
          : kind === 'GRADUATE'
            ? C.SOCIAL_COLLEGE_GRADUATE_COMMAND
            : C.SOCIAL_CLINIC_SERVE_COMMAND,
      correlationId: 'SOCIAL_TRACE',
      countryId: COUNTRY,
      worldId: WORLD,
      officeId: 'SOCIAL',
      expectedWorldVersion: '0',
      idempotencyKey: `IDEM_${kind}`,
      simTime: '0',
      submittedAtReal: NOW,
      payload,
      ...extra,
    },
    digest,
  );
}
function prepare(f: ReturnType<typeof fixture>, c: C.CanonicalCommand) {
  return C.prepareSocialOfficeOperation({
    command: c,
    state: f.state,
    readFacts: f.facts,
    inventoryBefore: f.ledgers.inventory,
    financialBefore: f.ledgers.financial,
    sha256Hex: digest,
  });
}

describe('single Social office deterministic domain actions (TEST_ONLY)', () => {
  it('derives intake from existing unassigned STUDENTs and commits the whole-course budget once', () => {
    const f = fixture(),
      c = command('ADMIT'),
      p = prepare(f, c);
    expect(p.outcome.units).toBe('2');
    expect(p.state.cohorts[1]).toMatchObject({
      anchorDayIndex: '0',
      elapsedSimDaysAtAnchor: '0',
      originalEnrolled: '2',
    });
    expect(
      p.state.budgetCommitments.find((b) => b.budgetId === 'EDUCATION_BUDGET')
        ?.committedAmount.amount,
    ).toBe('250');
    expect(p.state.employment.labour).toEqual(f.state.employment.labour);
    expect(
      C.prepareSocialOfficeOperation({
        command: c,
        state: p.state,
        readFacts: f.facts,
        inventoryBefore: f.ledgers.inventory,
        financialBefore: f.ledgers.financial,
        sha256Hex: digest,
      }),
    ).toMatchObject({ source: 'EXACT_DUPLICATE', eventPayload: null });
  });
  it('refuses early graduation without consuming assessment minutes or changing students', () => {
    const f = fixture();
    f.facts = {
      ...f.facts,
      sourceBinding: { ...f.facts.sourceBinding, purpose: 'GRADUATE' },
    };
    const before = clone(f.state);
    expect(() => prepare(f, command('GRADUATE'))).toThrow('duration');
    expect(f.state).toEqual(before);
  });
  it('graduates once through the original Labour STUDENT handoff after all reserved teaching windows', () => {
    const f = fixture(),
      at = (10n * DAY).toString();
    f.facts = {
      ...f.facts,
      simTime: at,
      dayBoundary: C.createE01DailyBoundary('10'),
      sourceBinding: { ...f.facts.sourceBinding, purpose: 'GRADUATE' },
    };
    const c = command('GRADUATE', { simTime: at }),
      p = prepare(f, c);
    expect(p.outcome.units).toBe('1');
    expect(p.state.cohorts[0]).toMatchObject({
      state: 'GRADUATION_PROCESSED',
      graduates: '1',
    });
    expect(
      p.state.employment.labour.aggregates.find(
        (a) => a.skill === 'LOW' && a.status === 'STUDENT',
      )?.count,
    ).toBe('4');
    expect(
      p.state.employment.labour.aggregates.find(
        (a) => a.skill === 'MEDIUM' && a.status === 'UNEMPLOYED_SEARCHING',
      )?.count,
    ).toBe('6');
    expect(p.state.employment.labour.positions).toEqual(
      f.state.employment.labour.positions,
    );
    expect(
      p.outcome.resourceEffects
        .filter((e) => e.released !== '0')
        .reduce((n, e) => n + BigInt(e.consumed), 0n),
    ).toBe(1800n);
    expect(
      p.outcome.resourceEffects.find(
        (e) => e.resourceId === 'RESOURCE_TEACHER_DAY_10',
      )?.consumed,
    ).toBe('90');
    expect(() =>
      C.prepareSocialOfficeOperation({
        command: command('GRADUATE', {
          simTime: at,
          commandId: 'GRAD_AGAIN',
          idempotencyKey: 'GRAD_AGAIN',
        }),
        state: p.state,
        readFacts: f.facts,
        inventoryBefore: f.ledgers.inventory,
        financialBefore: f.ledgers.financial,
        sha256Hex: digest,
      }),
    ).toThrow('open cohort');
  });
  it('requires every original instructional booking and refuses missing future capacity', () => {
    const f = fixture();
    f.state = { ...f.state, resourceWindows: f.state.resourceWindows.slice(1) };
    expect(() => prepare(f, command('ADMIT'))).toThrow('instructional');
    const g = fixture();
    g.facts = {
      ...g.facts,
      resourceAllocations: g.facts.resourceAllocations.filter(
        (r) => r.resourceId !== 'RESOURCE_TEACHER_DAY_9',
      ),
    };
    expect(() => prepare(g, command('ADMIT'))).toThrow('absent');
  });
  it('reserves complete new instruction once without borrowing old cohort reservations', () => {
    const f = fixture(),
      p = prepare(f, command('ADMIT'));
    expect(p.state.cohorts[1]?.futureTeachingReservations).toHaveLength(10);
    expect(
      p.state.cohorts[1]?.futureTeachingReservations.reduce(
        (n, r) => n + BigInt(r.amount),
        0n,
      ),
    ).toBe(1200n);
    expect(
      p.state.resourceWindows.find(
        (w) => w.allocation.resourceId === 'RESOURCE_TEACHER_DAY_0',
      ),
    ).toMatchObject({
      used: '30',
      reservations: [
        { reservationId: 'OLD_COHORT', amount: '180' },
        { reservationId: 'NEW_COHORT', amount: '120' },
      ],
    });
    expect(p.state.cohorts[1]?.state).toBe('OPEN');
  });
  it.each(['EXACT_OR_REJECT', 'FLOOR_WHOLE_PEOPLE_RETAIN_REMAINDER'] as const)(
    'uses explicit %s for a nonintegral cohort without losing students or refunding instruction',
    (integerPolicy) => {
      const f = fixture(),
        rule = { ...f.facts.programmeRules[0]!, integerPolicy };
      const cohort = {
        ...f.state.cohorts[0]!,
        originalEnrolled: '2',
        memberIds: ['STUDENT_1', 'STUDENT_2'],
        futureTeachingReservations:
          f.state.cohorts[0]!.futureTeachingReservations.map((r) => ({
            ...r,
            amount: '120',
          })),
      };
      f.state = {
        ...f.state,
        programmes: [rule],
        cohorts: [cohort],
        applicantAssignments: cohort.memberIds,
        resourceWindows: f.state.resourceWindows.map((w) => ({
          ...w,
          reservations: [{ reservationId: 'OLD_COHORT', amount: '120' }],
        })),
      };
      f.facts = {
        ...f.facts,
        programmeRules: [rule],
        simTime: (10n * DAY).toString(),
        dayBoundary: C.createE01DailyBoundary('10'),
        sourceBinding: { ...f.facts.sourceBinding, purpose: 'GRADUATE' },
      };
      const before = clone(f.state),
        c = command('GRADUATE', { simTime: f.facts.simTime });
      if (integerPolicy === 'EXACT_OR_REJECT') {
        expect(() => prepare(f, c)).toThrow('whole person');
        expect(f.state).toEqual(before);
      } else {
        const p = prepare(f, c);
        expect(p.outcome.units).toBe('0');
        expect(p.state.employment.labour).toEqual(f.state.employment.labour);
        expect(p.state.cohorts[0]?.state).toBe('GRADUATION_PROCESSED');
        expect(
          p.outcome.resourceEffects
            .filter((e) => e.released !== '0')
            .reduce((n, e) => n + BigInt(e.consumed), 0n),
        ).toBe(1200n);
        expect(
          p.outcome.resourceEffects.find(
            (e) => e.resourceId === 'RESOURCE_TEACHER_DAY_10',
          )?.consumed,
        ).toBe('60');
      }
    },
  );
  it('requires the selected adjacent skill pair and rejects dropout without a status rule', () => {
    for (const mutation of [
      { targetSkill: 'HIGH' },
      { dropoutRate: { numerator: '1', denominator: '10' } },
    ]) {
      const f = fixture();
      const rule = {
        ...f.facts.programmeRules[0]!,
        ...mutation,
      } as C.SocialOfficeProgrammeRuleV1;
      f.facts = { ...f.facts, programmeRules: [rule] };
      expect(() => prepare(f, command('ADMIT'))).toThrow();
    }
  });
  it('computes all clinic minima, retains backlog and emits a real Inventory requirement', () => {
    const f = fixture();
    f.facts = {
      ...f.facts,
      sourceBinding: { ...f.facts.sourceBinding, purpose: 'SERVE' },
    };
    const p = prepare(f, command('SERVE'));
    expect(p.outcome.units).toBe('5');
    expect(p.state.clinic.backlog).toBe('9');
    expect(p.outcome.inventoryRequirement).toMatchObject({
      quantity: '5',
      unit: 'medical_dose',
    });
    expect(p.outcome.budgetEffect?.amount.amount).toBe('200');
    expect(p.outcome.directHealthEffect).toBeNull();
    expect(p.state).not.toHaveProperty('medicineBalance');
    expect(p.state).not.toHaveProperty('cashBalance');
    expect(
      p.outcome.resourceEffects.find(
        (e) => e.resourceId === 'RESOURCE_DOCTOR_DAY_0',
      ),
    ).toMatchObject({ consumed: '150', afterUsed: '150' });
  });
  it.each([
    ['DOCTOR', '60', '2'],
    ['ROOM', '40', '2'],
    ['SUPPORT', '20', '2'],
  ] as const)(
    'limits service by actual remaining %s minutes',
    (name, capacity, expected) => {
      const f = fixture();
      f.facts = {
        ...f.facts,
        sourceBinding: { ...f.facts.sourceBinding, purpose: 'SERVE' },
        resourceAllocations: f.facts.resourceAllocations.map((r) =>
          r.canonicalPhysicalResourceId === `PHYSICAL_${name}`
            ? { ...r, capacity }
            : r,
        ),
      };
      expect(prepare(f, command('SERVE')).outcome.units).toBe(expected);
    },
  );
  it('rejects a physical alias, overclaimed staff and an input omitted from the original manifest', () => {
    const f = fixture(),
      r = f.facts.resourceAllocations[0]!;
    f.facts = {
      ...f.facts,
      resourceAllocations: [
        ...f.facts.resourceAllocations,
        {
          ...r,
          resourceId: 'ALIAS_RESOURCE',
          canonicalPhysicalResourceId: 'OTHER_LABEL',
        },
      ],
    };
    expect(() => prepare(f, command('ADMIT'))).toThrow('alias');
    const g = fixture();
    g.facts = {
      ...g.facts,
      sourceBinding: { ...g.facts.sourceBinding, selectedRecordIds: [] },
    };
    expect(() => prepare(g, command('ADMIT'))).toThrow('omits');
  });
  it('rejects browser outcomes, wrong Office and another action source purpose', () => {
    const f = fixture();
    const c = command('ADMIT');
    const payload = {
      ...(JSON.parse(c.canonicalPayload) as Record<string, unknown>),
      admitted: '2',
    };
    expect(() => prepare(f, command('ADMIT', { payload }))).toThrow('unknown');
    expect(() => prepare(f, command('ADMIT', { officeId: 'FINANCE' }))).toThrow(
      'Social Office',
    );
    expect(() => prepare(f, command('SERVE'))).toThrow('purpose');
  });
  it.each([
    ['ACTIVE', '1'],
    ['REVOKED', '0'],
  ] as const)(
    'reuses actual PLAN/MATCH Labour effects with full spent minutes when due offer is %s',
    (offerState, matched) => {
      const f = fixture();
      const labour = C.applyLabourFacts({
        state: f.state.employment.labour,
        boundary: C.createE01DailyBoundary('0'),
        populationAvailability: f.facts.populationAvailability,
        facts: [
          {
            kind: 'WAGE_ASSERTION',
            factId: 'WAGE_SOURCE',
            countryId: COUNTRY,
            locationId: LOCATION,
            dayIndex: '0',
            positionId: 'POSITION_NURSE',
            wageVersion: 'WAGE_TEST_V1',
            wageAmount: '64800',
          },
        ],
      }).state;
      f.state = {
        ...f.state,
        employment: {
          ...f.state.employment,
          labour,
          servicePools: [
            {
              poolId: 'POOL_MEDIUM',
              countryId: COUNTRY,
              locationId: LOCATION,
              skill: 'MEDIUM',
              dayIndex: '1',
              ruleVersion: C.SOCIAL_JOB_MATCH_RULE_VERSION,
              capacitySlots: '6',
              usedSlots: '0',
              reservedSlots: '0',
            },
          ],
        },
      };
      const employmentReadFacts: C.SocialEmploymentReadFacts = {
        boundary: C.createE01DailyBoundary('0'),
        simTime: '0',
        populationAvailability: f.facts.populationAvailability,
        offer: {
          positionId: 'POSITION_NURSE',
          countryId: COUNTRY,
          locationId: LOCATION,
          skill: 'MEDIUM',
          employerId: GOV,
          employerRole: 'GOV',
          legalPositionRef: 'LEGAL_NURSE_POSITION',
          payrollFundingRef: 'TEST_FUNDED_OFFER',
          offerVersion: 'OFFER_V1',
          state: 'ACTIVE',
          wageVersion: 'WAGE_TEST_V1',
          amount: '64800',
          currency: 'XAA',
          period: 'SIM_YEAR',
          validFromDayIndex: '0',
          validUntilDayIndex: '30',
        },
        minimumWage: {
          countryId: COUNTRY,
          ruleId: 'MINIMUM_WAGE',
          ruleVersion: 'MINIMUM_V1',
          amount: '36000',
          currency: 'XAA',
          period: 'SIM_YEAR',
          validFromDayIndex: '0',
          validUntilDayIndex: '30',
        },
      };
      f.facts = {
        ...f.facts,
        sourceBinding: { ...f.facts.sourceBinding, purpose: 'PLAN' },
        resourceAllocations: [
          ...f.facts.resourceAllocations,
          f.resource('CASEWORKER', '1'),
        ],
        employmentReadFacts,
        employmentRecipes: [
          {
            servicePoolId: 'POOL_MEDIUM',
            ruleVersion: C.SOCIAL_JOB_MATCH_RULE_VERSION,
            perPlannedSlot: [
              { resourceId: 'RESOURCE_CASEWORKER_DAY_1', amountPerUnit: '55' },
            ],
          },
        ],
      };
      const plan = command('ADMIT', {
        commandId: 'PLAN_TEST',
        commandType: C.SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
        idempotencyKey: 'PLAN_TEST',
        payload: {
          schemaVersion: 'social-employment-service-plan-v1',
          locationId: LOCATION,
          skill: 'MEDIUM',
          positionId: 'POSITION_NURSE',
          servicePoolId: 'POOL_MEDIUM',
          requestedMatches: '1',
          dueDayIndex: '1',
        },
      });
      const planned = prepare(f, plan);
      const event = C.parseAuthoritativeEvent(
        {
          schemaVersion: C.EVENT_SCHEMA_VERSION,
          eventId: 'PLAN_EVENT',
          eventType: C.SOCIAL_OFFICE_ACTION_EVENT,
          worldId: WORLD,
          worldVersion: '1',
          sequence: '1',
          causationCommandId: plan.commandId,
          correlationId: plan.correlationId,
          correctsEventId: null,
          simTime: '0',
          recordedAtReal: NOW,
          payload: planned.eventPayload,
        },
        digest,
      );
      const transition = C.createAuthoritativeTransition({
        command: plan,
        worldVersionBefore: '0',
        worldVersionAfter: '1',
        events: [event],
      });
      const before = C.rebuildV08LedgersFromLineage({
        seed: f.seed,
        transitions: [
          {
            command: plan,
            transition,
            inventoryPostings: [],
            financialPostingBatches: [],
          },
        ],
        sha256Hex: digest,
      });
      const time = DAY.toString(),
        facts: C.SocialOfficeReadFactsV1 = {
          ...f.facts,
          simTime: time,
          dayBoundary: C.createE01DailyBoundary('1'),
          sourceBinding: { ...f.facts.sourceBinding, purpose: 'MATCH' },
          employmentReadFacts: {
            ...employmentReadFacts,
            simTime: time,
            boundary: C.createE01DailyBoundary('1'),
            offer: { ...employmentReadFacts.offer, state: offerState },
          },
        };
      const due = command('ADMIT', {
        commandId: 'MATCH_TEST',
        commandType: C.SOCIAL_JOB_MATCH_DUE_COMMAND,
        officeId: null,
        expectedWorldVersion: '1',
        simTime: time,
        idempotencyKey: 'MATCH_TEST',
        payload: {
          schemaVersion: 'social-job-match-settlement-v1',
          planCommandId: plan.commandId,
          planFingerprint: plan.fingerprint,
          dueDayIndex: '1',
          ruleVersion: C.SOCIAL_JOB_MATCH_RULE_VERSION,
        },
      });
      const settled = C.prepareSocialOfficeOperation({
        command: due,
        state: planned.state,
        readFacts: facts,
        inventoryBefore: before.inventory,
        financialBefore: before.financial,
        sha256Hex: digest,
      });
      expect(settled.outcome.employment?.matched).toBe(matched);
      expect(
        settled.state.employment.labour.positions.find(
          (p) => p.positionId === 'POSITION_NURSE',
        )?.employedCount,
      ).toBe(matched === '1' ? '2' : '1');
      expect(settled.outcome.resourceEffects[0]).toMatchObject({
        consumed: '55',
        afterUsed: '55',
        afterReserved: '0',
      });
      // This pure contract test does not install or assert Root's real automatic publisher.
    },
  );
});
