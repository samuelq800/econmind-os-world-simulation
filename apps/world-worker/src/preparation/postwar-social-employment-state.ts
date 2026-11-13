/** E03 source data for the existing Social snapshot/replay consumer. Source
 * validation is not admission or independent custody; those remain server-owned. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  canonicalDecimal,
  createE01DailyBoundary,
  materializeOpeningLabourState,
  parseWorldDecimal,
  validateSocialEmploymentServiceState,
  SOCIAL_JOB_MATCH_RULE_VERSION,
  type LabourEngineState,
  type OpeningLabourPositionDemand,
  type SocialEmploymentMinimumWage,
  type SocialEmploymentReadFacts,
  type SocialEmploymentServiceState,
  type SocialEmploymentWageOffer,
} from '@econmind/core';
import {
  consumePostwarLabourGenesis,
  materializePostwarLabourGenesis,
  type PostwarLabourGenesisPreparation,
} from './postwar-labour-genesis.js';
import {
  consumePostwarFundingGenesis,
  type PostwarFundingGenesis,
} from './postwar-funding-genesis.js';
import {
  consumePostwarPopulationFacts,
  type PostwarPopulationFacts,
} from './postwar-population-facts.js';
import {
  isPostwarWagePolicy,
  type PostwarWagePolicy,
} from './postwar-wage-policy.js';
import type { SocialPhysicalAttemptEnvelope } from '../persistence/social-physical-attempt-envelope.js';

export const POSTWAR_SOCIAL_EMPLOYMENT_POLICY = Object.freeze({
  version: 'POSTWAR_SOCIAL_EMPLOYMENT_20261028_V1',
  classification: 'GENERATED_OPERATING_POLICY',
  authorizationReference: 'Sentinel_a619bdbe25588191aa05709db76c7567',
  staffSource:
    'EXISTING_OP_PROFESSIONAL_AND_BUSINESS_SERVICES_GENERAL_MEDIUM_HIGH',
  dedicatedWorkersDivisor: '20',
  workerMinutesPerSimDay: '480',
  period: 'ONE_INITIAL_SIM_DAY_ONLY',
  minimumWageRule: 'LOWEST_POSITIVE_ACTUAL_ANNUAL_CONTRACTED_WAGE_IN_COUNTRY',
  npcMandate:
    'FINITE_T0_NONEXCLUSIVE_PUBLIC_REFERRAL_ACCESS_TO_OP_EMPLOYMENT_DESKS',
  mandateFee: 'NO_ADDITIONAL_T0_FEE_OR_TRANSFER',
  futurePaymentCondition:
    'NEW_PUBLIC_PURCHASE_REQUIRES_SEPARATE_LAWFUL_FUNDED_CONTRACT',
  retainedEmployerAndPayroll: 'ORIGINAL_OP_EMPLOYER_ORIGINAL_ONCE_ONLY_PAYROLL',
  intakeMinutesPerOpportunity: Object.freeze({
    LOW: '12',
    MEDIUM: '18',
    HIGH: '24',
  }),
  verificationMinutesPerOpportunity: Object.freeze({
    LOW: '8',
    MEDIUM: '12',
    HIGH: '16',
  }),
});
type MaterializationInput = Parameters<typeof materializeOpeningLabourState>[0];
interface Inputs {
  readonly worldId: string;
  readonly seedId: string;
  readonly sourcePackageId: string;
  readonly sourceChecksumsSha256: string;
  readonly sourceReferences: PostwarLabourGenesisPreparation['sourceReferences'];
  readonly labour: MaterializationInput;
  readonly sourcePositions: PostwarLabourGenesisPreparation['positions'];
  readonly populationPositionRefs: PostwarPopulationFacts['positionPopulationRefs'];
  readonly positionFunding: PostwarFundingGenesis['positionFunding'];
  readonly fundingAccounts: PostwarFundingGenesis['accounts'];
  readonly fundingFingerprint: string;
  readonly wagePolicySHA256: string;
  readonly populationFingerprint: string;
}
export interface PostwarEmploymentDutyAssignment {
  readonly assignmentId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly positionId: string;
  readonly employerId: string;
  readonly employerRole: 'OP';
  readonly occupation: 'GENERAL';
  readonly duty:
    | 'EMPLOYMENT_INTAKE'
    | 'EMPLOYMENT_VERIFICATION'
    | 'PRIMARY_RECOVERY_SERVICE';
  readonly cohortId: string;
  readonly startOrdinal: string;
  readonly workerCount: string;
  readonly minutesPerWorker: '480';
  readonly totalMinutes: string;
  readonly payrollFundingRef: string;
}
export interface PostwarSocialEmploymentCountrySource {
  readonly worldId: string;
  readonly seedId: string;
  readonly countryId: string;
  readonly state: SocialEmploymentServiceState;
  readonly minimumWage: SocialEmploymentMinimumWage;
  readonly validationReadFacts: Readonly<{
    classification: 'VALIDATION_ONLY_NOT_ACTIVE_OFFER';
    facts: SocialEmploymentReadFacts;
  }>;
  readonly vacancyStatus: 'NO_ACTUAL_VACANCY' | 'ACTUAL_VACANCIES';
  readonly offers: readonly SocialEmploymentWageOffer[];
  readonly physicalDayBodies: readonly SocialPhysicalAttemptEnvelope[];
  /** Immutable admitted originals exclude the changing held-head envelope. */
  readonly physicalOriginalBodies: readonly Omit<
    SocialPhysicalAttemptEnvelope,
    'headWorldVersion' | 'headEventSequence'
  >[];
  readonly dutyAssignments: readonly PostwarEmploymentDutyAssignment[];
  readonly npcUsageLicenses: readonly Readonly<{
    licenseId: string;
    licensorEntityId: string;
    beneficiaryEntityId: string;
    locationId: string;
    validFromDayIndex: '0';
    validUntilDayIndex: '1';
    dutyAssignmentIds: readonly string[];
    maximumWorkerMinutes: string;
    scope: 'PUBLIC_REFERRALS_ONLY_NOT_EMPLOYER_TRANSFER';
    state: 'GENESIS_USAGE_LICENSE_NOT_PAID_PURCHASE';
    additionalFeeAmount: '0';
    futurePaymentCondition: typeof POSTWAR_SOCIAL_EMPLOYMENT_POLICY.futurePaymentCondition;
  }>[];
  readonly sourceRevision: string;
}
export interface PostwarSocialEmploymentStateDocument {
  readonly schemaVersion: 'postwar-social-employment-state-v1';
  readonly classification: 'GENERATED_SOURCE_DATA_NOT_ADMISSION';
  readonly policy: typeof POSTWAR_SOCIAL_EMPLOYMENT_POLICY;
  readonly inputs: Inputs;
  readonly state: SocialEmploymentServiceState;
  readonly countries: readonly PostwarSocialEmploymentCountrySource[];
  readonly sourceRevision: string;
}
declare const preparationBrand: unique symbol;
export interface PostwarSocialEmploymentPreparation {
  readonly [preparationBrand]: true;
  readonly document: PostwarSocialEmploymentStateDocument;
}
const issued = new WeakSet<object>();
const checkedDocuments = new WeakSet<object>();
const checkedCountries = new WeakSet<object>();
const skills = ['LOW', 'MEDIUM', 'HIGH'] as const;
const digest = (bytes: string) =>
  createHash('sha256').update(bytes).digest('hex');
const hash = (value: unknown) => digest(canonicalSerialize(value));
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function invalid(reason: string): never {
  throw Error(`POSTWAR_SOCIAL_EMPLOYMENT:${reason}`);
}
function whole(value: string): bigint {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(value))
    invalid('exact whole count required');
  return BigInt(value);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function same(actual: unknown, expected: unknown, reason: string) {
  if (canonicalSerialize(actual) !== canonicalSerialize(expected))
    invalid(reason);
}
function derive(inputs: Inputs): PostwarSocialEmploymentStateDocument {
  const materialized = materializeOpeningLabourState(inputs.labour);
  const sourceRevision = `POSTWAR_E03_${hash({ policy: POSTWAR_SOCIAL_EMPLOYMENT_POLICY, inputs })}`;
  const sourceById = new Map(
    inputs.sourcePositions.map((p) => [p.positionId, p]),
  );
  const fundingById = new Map(
    inputs.positionFunding.map((p) => [p.positionId, p]),
  );
  const populationById = new Map(
    inputs.populationPositionRefs.map((p) => [p.positionId, p]),
  );
  if (
    sourceById.size !== inputs.sourcePositions.length ||
    fundingById.size !== inputs.positionFunding.length ||
    populationById.size !== inputs.populationPositionRefs.length ||
    sourceById.size !== inputs.labour.positions.length ||
    fundingById.size !== sourceById.size ||
    populationById.size !== sourceById.size
  )
    invalid('complete unique source positions/funding/population required');
  for (const position of inputs.labour.positions) {
    const source = sourceById.get(position.positionId);
    const funding = fundingById.get(position.positionId);
    const people = populationById.get(position.positionId);
    const account = inputs.fundingAccounts.find(
      (a) => a.accountRef === funding?.accountRef,
    );
    const actual = materialized.state.positions.find(
      (p) => p.positionId === position.positionId,
    );
    if (!source || !funding || !people || !account || !actual)
      invalid('source position join');
    for (const key of [
      'positionId',
      'countryId',
      'locationId',
      'skill',
      'owner',
      'classificationId',
      'requiredCount',
      'sourceWeight',
      'employerId',
      'employerRole',
      'occupation',
    ] as const)
      if (source[key] !== position[key])
        invalid('full legal source position changed');
    if (
      actual.employedCount !== source.filledCount ||
      people.count !== source.filledCount ||
      people.regionId !== source.locationId ||
      people.sourcePoolId !== source.personRange.poolId ||
      people.sourceStartOrdinal !== source.personRange.startOrdinal ||
      funding.filledCount !== source.filledCount ||
      funding.countryId !== source.countryId ||
      funding.locationId !== source.locationId ||
      funding.payerEntityId !== source.employerId ||
      funding.currency !== position.wageCurrency ||
      funding.payrollFundingRef !== position.payrollFundingRef ||
      !parseWorldDecimal(funding.uncoveredReservationAmount).isZero() ||
      account.payerEntityId !== source.employerId ||
      account.countryId !== source.countryId ||
      account.payerRole !== source.employerRole ||
      account.currency !== position.wageCurrency
    )
      invalid('actual employment/payroll/population mismatch');
    // A claimed funded amount is cross-checked against the precise first-day
    // once-only wage. No staff-duty payment or second reservation is created.
    const annual = parseWorldDecimal(position.wageAmount);
    if (
      annual.isNegative() ||
      annual.isZero() ||
      position.wagePeriod !== 'SIM_YEAR'
    )
      invalid('positive annual wage required');
    const exact = funding.exactFirstDayPayrollLC;
    const numerator = whole(exact.numerator),
      denominator = whole(exact.denominator);
    if (!denominator) invalid('positive payroll denominator required');
    const cents = (numerator * 100n + denominator - 1n) / denominator;
    if (
      !parseWorldDecimal(funding.amount)
        .times('100')
        .equals(cents.toString()) ||
      !parseWorldDecimal(funding.requestedReservationAmount).equals(
        funding.amount,
      ) ||
      funding.fundingRef !== funding.payrollFundingRef
    )
      invalid('payroll funded reservation is not exact first-day ceiling');
    if (
      !parseWorldDecimal(exact.numerator)
        .times('360')
        .equals(annual.times(source.filledCount).times(exact.denominator))
    )
      invalid('payroll exact wage basis changed');
  }
  for (const account of inputs.fundingAccounts) {
    const payroll = inputs.positionFunding
      .filter((f) => f.accountRef === account.accountRef)
      .reduce((total, f) => total.plus(f.amount), parseWorldDecimal('0'));
    if (
      !payroll.equals(account.reservedPayrollAmount) ||
      !payroll
        .plus(account.reservedPublicAmount)
        .equals(account.reservedAmount) ||
      !parseWorldDecimal(account.availableAmount)
        .minus(account.reservedAmount)
        .equals(account.remainingAmount) ||
      parseWorldDecimal(account.remainingAmount).isNegative() ||
      parseWorldDecimal(account.reservedPublicAmount).isNegative() ||
      !parseWorldDecimal(account.originalGcuAmount)
        .times(account.localCurrencyPerGcu)
        .equals(account.availableAmount)
    )
      invalid('shared account reservation/unchanged source balance mismatch');
  }
  // Recompute the normalizer's LF coordinate transform, rather than trusting
  // arbitrary carrier ordinals. U tails remain holes between employed skills.
  for (const population of inputs.labour.populationAvailability) {
    let offset = 0n;
    for (const skill of skills) {
      const available = inputs.labour.skillAvailability.find(
        (p) =>
          p.locationId === population.locationId &&
          p.countryId === population.countryId &&
          p.skill === skill,
      );
      if (!available) invalid('missing actual skill population');
      let local = 0n;
      for (const position of inputs.sourcePositions
        .filter(
          (p) =>
            p.locationId === population.locationId &&
            p.countryId === population.countryId &&
            p.skill === skill,
        )
        .sort((a, b) => compare(a.positionId, b.positionId))) {
        const ref = populationById.get(position.positionId)!;
        if (
          whole(position.personRange.startOrdinal) !== local ||
          position.personRange.count !== position.filledCount ||
          position.personRange.poolId !==
            `POSTWAR_LF_${population.locationId}_${skill}` ||
          whole(ref.startOrdinal) !== offset + local ||
          ref.cohortId !==
            `POSTWAR_PEOPLE_${population.locationId}_${skill}_EMPLOYED`
        )
          invalid('source population coordinate transform changed');
        local += whole(position.filledCount);
      }
      if (local > whole(available.count))
        invalid('employed exceed source skill population');
      offset += whole(available.count);
    }
    if (offset > whole(population.workingAgeAvailable))
      invalid('LF exceeds working age');
  }
  const countryIds = [
    ...new Set(inputs.labour.positions.map((p) => p.countryId)),
  ].sort(compare);
  const countries: PostwarSocialEmploymentCountrySource[] = [];
  for (const countryId of countryIds) {
    const positions = inputs.labour.positions.filter(
      (p) => p.countryId === countryId,
    );
    const populationAvailability = inputs.labour.populationAvailability.filter(
      (p) => p.countryId === countryId,
    );
    if (!positions.length || !populationAvailability.length)
      invalid('country has no actual source positions');
    const floorPosition = [...positions].sort(
      (a, b) =>
        parseWorldDecimal(a.wageAmount).comparedTo(b.wageAmount) ||
        compare(a.positionId, b.positionId),
    )[0]!;
    const minimumWage: SocialEmploymentMinimumWage = {
      countryId,
      ruleId: `POSTWAR_MINIMUM_${countryId}`,
      ruleVersion: POSTWAR_SOCIAL_EMPLOYMENT_POLICY.version,
      amount: canonicalDecimal(parseWorldDecimal(floorPosition.wageAmount)),
      currency: floorPosition.wageCurrency,
      period: 'SIM_YEAR',
      validFromDayIndex: '0',
      validUntilDayIndex: '1',
    };
    if (positions.some((p) => p.wageCurrency !== minimumWage.currency))
      invalid('mixed country wage currency');
    const offer = (
      position: OpeningLabourPositionDemand,
      active: boolean,
    ): SocialEmploymentWageOffer => ({
      positionId: position.positionId,
      countryId,
      locationId: position.locationId,
      skill: position.skill,
      employerId: position.employerId,
      employerRole: position.employerRole,
      legalPositionRef: position.positionId,
      payrollFundingRef: position.payrollFundingRef,
      offerVersion: `POSTWAR_OFFER_${hash({ sourceRevision, positionId: position.positionId }).toUpperCase()}`,
      state: active ? 'ACTIVE' : 'REVOKED',
      wageVersion: position.wageVersion,
      amount: position.wageAmount,
      currency: position.wageCurrency,
      period: 'SIM_YEAR',
      validFromDayIndex: '0',
      validUntilDayIndex: '1',
    });
    const offers = positions
      .filter((p) => {
        const actual = materialized.state.positions.find(
          (a) => a.positionId === p.positionId,
        )!;
        return whole(actual.requiredCount) > whole(actual.employedCount);
      })
      .map((p) => offer(p, true));
    const assignments: PostwarEmploymentDutyAssignment[] = [];
    const physicalDayBodies: SocialPhysicalAttemptEnvelope[] = [];
    const servicePools: SocialEmploymentServiceState['servicePools'][number][] =
      [];
    for (const population of [...populationAvailability].sort((a, b) =>
      compare(a.locationId, b.locationId),
    )) {
      const providers = inputs.sourcePositions.filter(
        (p) =>
          p.countryId === countryId &&
          p.locationId === population.locationId &&
          p.owner === 'PRIVATE_SECTOR' &&
          p.employerRole === 'OP' &&
          p.classificationId === 'PROFESSIONAL_AND_BUSINESS_SERVICES' &&
          p.occupation === 'GENERAL' &&
          (p.skill === 'MEDIUM' || p.skill === 'HIGH'),
      );
      let intake = 0n,
        verification = 0n;
      for (const provider of providers) {
        const ref = populationById.get(provider.positionId)!;
        const workers = whole(provider.filledCount),
          reserved = workers / 20n;
        const counts = [
          reserved / 2n,
          reserved - reserved / 2n,
          workers - reserved,
        ];
        let cursor = whole(ref.startOrdinal);
        const duties = [
          'EMPLOYMENT_INTAKE',
          'EMPLOYMENT_VERIFICATION',
          'PRIMARY_RECOVERY_SERVICE',
        ] as const;
        duties.forEach((duty, index) => {
          const count = counts[index]!;
          if (count)
            assignments.push({
              assignmentId: `POSTWAR_DUTY_${provider.positionId}_${duty}`,
              countryId,
              locationId: provider.locationId,
              positionId: provider.positionId,
              employerId: provider.employerId,
              employerRole: 'OP',
              occupation: 'GENERAL',
              duty,
              cohortId: ref.cohortId,
              startOrdinal: cursor.toString(),
              workerCount: count.toString(),
              minutesPerWorker: '480',
              totalMinutes: (count * 480n).toString(),
              payrollFundingRef: fundingById.get(provider.positionId)!
                .payrollFundingRef,
            });
          cursor += count;
        });
        if (cursor !== whole(ref.startOrdinal) + workers)
          invalid('provider exclusive person-time partition');
        intake += counts[0]! * 480n;
        verification += counts[1]! * 480n;
      }
      const lanes = skills.map((skill) => ({
        poolId: `POSTWAR_EMPLOYMENT_${population.locationId}_${skill}`,
        skill,
      }));
      physicalDayBodies.push({
        schemaVersion: 'social-physical-attempt-envelope-v1',
        worldId: inputs.worldId,
        headWorldVersion: '0',
        headEventSequence: '0',
        ruleRevision: POSTWAR_SOCIAL_EMPLOYMENT_POLICY.version,
        sourceRevision,
        validFromDayIndex: '0',
        validUntilDayIndex: '1',
        dayIndex: '0',
        countryId,
        locationId: population.locationId,
        pools: lanes,
        stages: [
          {
            resourceKey: `POSTWAR_EMPLOYMENT_INTAKE_${population.locationId}`,
            availableMinutes: intake.toString(),
            minutesPerOpportunity:
              POSTWAR_SOCIAL_EMPLOYMENT_POLICY.intakeMinutesPerOpportunity,
          },
          {
            resourceKey: `POSTWAR_EMPLOYMENT_VERIFICATION_${population.locationId}`,
            availableMinutes: verification.toString(),
            minutesPerOpportunity:
              POSTWAR_SOCIAL_EMPLOYMENT_POLICY.verificationMinutesPerOpportunity,
          },
        ],
      });
      for (const lane of lanes) {
        const a =
          intake /
          (whole(
            POSTWAR_SOCIAL_EMPLOYMENT_POLICY.intakeMinutesPerOpportunity[
              lane.skill
            ],
          ) *
            3n);
        const b =
          verification /
          (whole(
            POSTWAR_SOCIAL_EMPLOYMENT_POLICY.verificationMinutesPerOpportunity[
              lane.skill
            ],
          ) *
            3n);
        servicePools.push({
          ...lane,
          countryId,
          locationId: population.locationId,
          dayIndex: '0',
          ruleVersion: SOCIAL_JOB_MATCH_RULE_VERSION,
          capacitySlots: (a < b ? a : b).toString(),
          usedSlots: '0',
          reservedSlots: '0',
        });
      }
    }
    const ids = new Set(positions.map((p) => p.positionId));
    const government = inputs.labour.employers.filter(
      (e) => e.countryId === countryId && e.role === 'GOV',
    );
    if (government.length !== 1)
      invalid('actual government beneficiary required');
    const npcUsageLicenses: PostwarSocialEmploymentCountrySource['npcUsageLicenses'][number][] =
      [];
    for (const body of physicalDayBodies) {
      const providerAssignments = assignments.filter(
        (a) =>
          a.locationId === body.locationId &&
          a.duty !== 'PRIMARY_RECOVERY_SERVICE',
      );
      for (const employerId of [
        ...new Set(providerAssignments.map((a) => a.employerId)),
      ].sort(compare)) {
        const duties = providerAssignments.filter(
          (a) => a.employerId === employerId,
        );
        npcUsageLicenses.push({
          licenseId: `POSTWAR_EMPLOYMENT_LICENSE_${body.locationId}_${employerId}`,
          licensorEntityId: employerId,
          beneficiaryEntityId: government[0]!.employerId,
          locationId: body.locationId,
          validFromDayIndex: '0',
          validUntilDayIndex: '1',
          dutyAssignmentIds: duties.map((a) => a.assignmentId),
          maximumWorkerMinutes: duties
            .reduce((n, a) => n + whole(a.totalMinutes), 0n)
            .toString(),
          scope: 'PUBLIC_REFERRALS_ONLY_NOT_EMPLOYER_TRANSFER',
          state: 'GENESIS_USAGE_LICENSE_NOT_PAID_PURCHASE',
          additionalFeeAmount: '0',
          futurePaymentCondition:
            POSTWAR_SOCIAL_EMPLOYMENT_POLICY.futurePaymentCondition,
        });
      }
    }
    const labour: LabourEngineState = {
      aggregates: materialized.state.aggregates.filter(
        (p) => p.countryId === countryId,
      ),
      positions: materialized.state.positions.filter(
        (p) => p.countryId === countryId,
      ),
      wageAssertions: materialized.state.wageAssertions.filter((p) =>
        ids.has(p.positionId),
      ),
      appliedFactBindings: [],
    };
    const validationFacts: SocialEmploymentReadFacts = {
      boundary: createE01DailyBoundary('0'),
      simTime: '0',
      populationAvailability,
      offer: offer(floorPosition, false),
      minimumWage,
    };
    const state = validateSocialEmploymentServiceState(
      {
        schemaVersion: 'social-employment-service-state-v1',
        worldId: inputs.worldId,
        labour,
        servicePools,
        plans: [],
        appliedOperations: [],
      },
      validationFacts,
      digest,
    );
    countries.push({
      worldId: inputs.worldId,
      seedId: inputs.seedId,
      countryId,
      state,
      minimumWage,
      validationReadFacts: {
        classification: 'VALIDATION_ONLY_NOT_ACTIVE_OFFER',
        facts: validationFacts,
      },
      vacancyStatus: offers.length ? 'ACTUAL_VACANCIES' : 'NO_ACTUAL_VACANCY',
      offers,
      physicalDayBodies,
      physicalOriginalBodies: physicalDayBodies.map((body) => ({
        schemaVersion: body.schemaVersion,
        worldId: body.worldId,
        ruleRevision: body.ruleRevision,
        sourceRevision: body.sourceRevision,
        validFromDayIndex: body.validFromDayIndex,
        validUntilDayIndex: body.validUntilDayIndex,
        dayIndex: body.dayIndex,
        countryId: body.countryId,
        locationId: body.locationId,
        pools: body.pools,
        stages: body.stages,
      })),
      dutyAssignments: assignments,
      npcUsageLicenses,
      sourceRevision,
    });
  }
  const state = validateSocialEmploymentServiceState(
    {
      schemaVersion: 'social-employment-service-state-v1',
      worldId: inputs.worldId,
      labour: materialized.state,
      servicePools: countries.flatMap((c) => c.state.servicePools),
      plans: [],
      appliedOperations: [],
    },
    {
      ...countries[0]!.validationReadFacts.facts,
      populationAvailability: inputs.labour.populationAvailability,
    },
    digest,
  );
  return freeze({
    schemaVersion: 'postwar-social-employment-state-v1',
    classification: 'GENERATED_SOURCE_DATA_NOT_ADMISSION',
    policy: POSTWAR_SOCIAL_EMPLOYMENT_POLICY,
    inputs,
    state,
    countries,
    sourceRevision,
  });
}

/** The complete supplied Core state must equal a fresh Core materialization
 * using the genuine shared financial reservation and actual source positions. */
export function createPostwarSocialEmploymentState(input: {
  readonly labourPreparation: PostwarLabourGenesisPreparation;
  readonly labourState: LabourEngineState;
  readonly populationFacts: PostwarPopulationFacts;
  readonly wages: PostwarWagePolicy;
  readonly funding: PostwarFundingGenesis;
}): PostwarSocialEmploymentPreparation {
  const labour = consumePostwarLabourGenesis(input.labourPreparation);
  const population = consumePostwarPopulationFacts(input.populationFacts);
  const funding = consumePostwarFundingGenesis(input.funding);
  if (
    !isPostwarWagePolicy(input.wages) ||
    input.wages.sourceChecksumsSha256 !== labour.sourceChecksumsSha256 ||
    population.sourceChecksumsSha256 !== labour.sourceChecksumsSha256 ||
    population.sourcePackageId !== labour.sourcePackageId
  )
    invalid('source/wage/population mismatch');
  const actual = materializePostwarLabourGenesis(labour, {
    wagesByPositionId: funding.wagesByPositionId,
  });
  same(
    input.labourState,
    actual.state,
    'supplied full Core E03 state differs from source materialization',
  );
  const positions: OpeningLabourPositionDemand[] = labour.positions.map((p) => {
    const quote = funding.wagesByPositionId[p.positionId];
    const wage = input.wages.wagesByPositionId[p.positionId];
    if (
      !quote ||
      !wage ||
      quote.wageAmount !== wage.wageAmount ||
      quote.wageCurrency !== wage.wageCurrency ||
      quote.wageVersion !== wage.wageVersion ||
      quote.wagePeriod !== wage.wagePeriod
    )
      invalid('actual wage/funding mismatch');
    return {
      positionId: p.positionId,
      countryId: p.countryId,
      locationId: p.locationId,
      skill: p.skill,
      owner: p.owner,
      classificationId: p.classificationId,
      requiredCount: p.requiredCount,
      sourceWeight: p.sourceWeight,
      employerId: p.employerId,
      employerRole: p.employerRole,
      occupation: p.occupation,
      ...quote,
    };
  });
  const document = derive({
    worldId: population.worldId,
    seedId: population.seedId,
    sourcePackageId: labour.sourcePackageId,
    sourceChecksumsSha256: labour.sourceChecksumsSha256,
    sourceReferences: labour.sourceReferences,
    labour: {
      positions,
      targets: labour.targets,
      nonEmployedAggregates: labour.nonEmployedAggregates,
      skillAvailability: labour.skillAvailability,
      populationAvailability: labour.populationAvailability,
      employers: labour.employers,
    },
    sourcePositions: labour.positions,
    populationPositionRefs: population.positionPopulationRefs,
    positionFunding: funding.positionFunding,
    fundingAccounts: funding.accounts,
    fundingFingerprint: funding.fingerprint,
    wagePolicySHA256: input.wages.policySHA256,
    populationFingerprint: population.fingerprint,
  });
  same(document.state.labour, input.labourState, 'derived E03 state changed');
  checkedDocuments.add(document);
  document.countries.forEach((c) => checkedCountries.add(c));
  const result = freeze({
    document,
  }) as unknown as PostwarSocialEmploymentPreparation;
  issued.add(result);
  return result;
}
export function consumePostwarSocialEmploymentState(
  value: PostwarSocialEmploymentPreparation,
) {
  if (!value || !issued.has(value))
    invalid('genuine employment preparation required');
  return value.document;
}
/** Pure canonical data validation for admitted-seed readers. A successful
 * re-derivation authenticates neither the issuer nor source admission/locks. */
export function validatePostwarSocialEmploymentStateDocument(
  value: unknown,
): PostwarSocialEmploymentStateDocument {
  if (!value || typeof value !== 'object') invalid('source document required');
  if (checkedDocuments.has(value))
    return value as PostwarSocialEmploymentStateDocument;
  const copy = JSON.parse(
    canonicalSerialize(value),
  ) as PostwarSocialEmploymentStateDocument;
  if (
    copy.schemaVersion !== 'postwar-social-employment-state-v1' ||
    copy.classification !== 'GENERATED_SOURCE_DATA_NOT_ADMISSION' ||
    !copy.inputs
  )
    invalid('source document schema');
  const expected = derive(copy.inputs);
  same(
    copy,
    expected,
    'stored source document failed exact Core/policy re-derivation',
  );
  checkedDocuments.add(expected);
  expected.countries.forEach((c) => checkedCountries.add(c));
  return expected;
}
export function selectPostwarSocialEmploymentCountry(
  value: unknown,
  countryId: string,
): PostwarSocialEmploymentCountrySource {
  const document = validatePostwarSocialEmploymentStateDocument(value);
  const country = document.countries.find((c) => c.countryId === countryId);
  if (!country) invalid('country outside source');
  return country;
}
/** Only an actual source vacancy can become a command read-fact offer. The
 * explicitly REVOKED validation witness never passes through this selector. */
export function selectPostwarSocialEmploymentVacancyFacts(
  country: PostwarSocialEmploymentCountrySource,
  input: { readonly positionId: string; readonly servicePoolId: string },
) {
  if (!checkedCountries.has(country))
    invalid('validated country source required');
  const position = country.state.labour.positions.find(
    (p) => p.positionId === input.positionId,
  );
  if (!position || position.countryId !== country.countryId)
    invalid('position outside country source');
  if (whole(position.requiredCount) <= whole(position.employedCount))
    invalid('NO_ACTUAL_VACANCY');
  const offer = country.offers.find(
    (o) => o.positionId === position.positionId && o.state === 'ACTIVE',
  );
  const pool = country.state.servicePools.find(
    (p) =>
      p.poolId === input.servicePoolId &&
      p.locationId === position.locationId &&
      p.skill === position.skill,
  );
  const body = country.physicalDayBodies.find(
    (p) => p.locationId === position.locationId,
  );
  if (!offer || !pool || !body)
    invalid('actual vacancy offer/service source unavailable');
  return freeze({
    state: country.state,
    readFacts: { ...country.validationReadFacts.facts, offer },
    physicalAttemptEnvelope: body,
  });
}
