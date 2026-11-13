/** Canonical funded public vacancies. A vacancy reserves budget, never pays a
 * worker or changes employment. Source admission/currentness remain the host's
 * responsibility; replay consumes only the actual committed event prefix. */
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { idempotencyKey, legalEntityId } from '../ids.js';
import { Money } from '../numeric/money.js';
import { canonicalDecimal } from '../numeric/world-decimal.js';
import {
  canonicalSerialize,
  canonicalHashInput,
} from '../serialization/canonical.js';
import { isAuthoritativeFinancialLedgerState } from '../opening/ledger-authority.js';
import type { FinancialLedgerState } from '../finance/financial-ledger.js';
import {
  reauthorizeOfficeCapability,
  type AuthorizedOfficeContext,
} from '../authorization/offices.js';
import {
  applyLabourFacts,
  type PublicServiceKind,
  type LabourSkill,
} from '../labour/labour-engine.js';
import {
  materializeOpeningLabourState,
  type OpeningLabourPositionDemand,
} from '../labour/approved-opening-projection.js';
import {
  canonicalSha256,
  parseCanonicalCommand,
  validateCanonicalCommand,
  type CanonicalCommand,
  type Sha256Hex,
} from './command.js';
import {
  validateSocialEmploymentServiceState,
  type SocialEmploymentServiceState,
  type SocialEmploymentReadFacts,
  type SocialEmploymentWageOffer,
} from './social-employment-service.js';
import type { ReplayReducerEvent } from '../replay/replay.js';

export const SOCIAL_POSITION_OFFER_CREATE_COMMAND =
  'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1';
export const SOCIAL_POSITION_OFFER_CREATED_EVENT =
  'SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1';
export const SOCIAL_POSITION_OFFER_POLICY = 'SOCIAL_GOV_FUNDED_VACANCY_V1';

export interface SocialPositionOfferCreateIntent {
  readonly schemaVersion: 'social-employment-position-offer-create-v1';
  readonly positionId: string;
  readonly locationId: string;
  readonly skill: LabourSkill;
  readonly publicService: PublicServiceKind;
  readonly occupation: OpeningLabourPositionDemand['occupation'];
  readonly requiredCount: string;
  readonly wageScheduleRef: string;
  readonly fundingAccountId: string;
  readonly coverageDays: string;
}
export interface SocialPositionPayrollReservation {
  readonly reservationId: string;
  readonly positionId: string;
  readonly accountId: string;
  readonly employerId: string;
  readonly countryId: string;
  readonly amount: string;
  readonly currency: string;
  readonly coverageDays: string;
  readonly exactAnnualNumerator: string;
  readonly denominator: '360';
  readonly state: 'RESERVED_NOT_PAID';
}
export interface SocialPositionOfferLifecycleState {
  readonly schemaVersion: 'social-employment-position-lifecycle-v1';
  readonly employment: SocialEmploymentServiceState;
  readonly offers: readonly SocialEmploymentWageOffer[];
  readonly reservations: readonly SocialPositionPayrollReservation[];
  readonly operations: readonly {
    commandId: string;
    commandFingerprint: string;
    canonicalCommand: string;
    positionId: string;
  }[];
}
/** Server-read original facts. None of these fields is accepted in the manual
 * intent and none grants authorization or source admission. */
export interface SocialPositionOfferReadFacts {
  readonly policyVersion: typeof SOCIAL_POSITION_OFFER_POLICY;
  readonly sourceRevision: string;
  readonly governmentEntityId: string;
  readonly centralBankEntityId: string;
  readonly employment: Omit<SocialEmploymentReadFacts, 'offer'>;
  readonly wageSchedule: {
    readonly scheduleId: string;
    readonly countryId: string;
    readonly skill: LabourSkill;
    readonly publicService: PublicServiceKind;
    readonly occupation: OpeningLabourPositionDemand['occupation'];
    readonly amount: string;
    readonly currency: string;
    readonly period: 'SIM_YEAR';
    readonly wageVersion: string;
    readonly validFromDayIndex: string;
    readonly validUntilDayIndex: string;
  };
  readonly funding: {
    readonly accountId: string;
    readonly countryId: string;
    readonly ownerId: string;
    readonly currency: string;
    readonly liquidBalance: string;
    /** Complete original opening/current encumbrances excluding this family's
     * reservations, which are independently replayed in lifecycle state. */
    readonly priorReservations: readonly {
      reservationId: string;
      sourceRef: string;
      amount: string;
    }[];
  };
}
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
    `SOC-POSITION: ${reason}`,
  );
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('record required');
  return v as Record<string, unknown>;
}
function exact(v: unknown, fields: readonly string[]) {
  const r = record(v);
  if (
    canonicalSerialize(Object.keys(r).sort()) !==
    canonicalSerialize([...fields].sort())
  )
    invalid('missing/unknown fields');
  return r;
}
function whole(v: unknown, positive = false): string {
  if (
    typeof v !== 'string' ||
    !(positive ? /^[1-9]\d*$/u : /^(?:0|[1-9]\d*)$/u).test(v)
  )
    invalid('canonical integer required');
  return v;
}
function ref(v: unknown): string {
  if (typeof v !== 'string') invalid('reference required');
  return idempotencyKey(v);
}
function money(v: string, currency: string) {
  const m = Money.from(v, currency);
  if (m.amount.isNegative() || m.toCanonicalValue().amount !== v)
    invalid('canonical nonnegative money required');
  return m;
}
const hash = (v: unknown, digest: Sha256Hex) =>
  canonicalSha256(canonicalHashInput(v), digest);
const clone = <T>(v: T): T => JSON.parse(canonicalSerialize(v)) as T;
function wire(c: CanonicalCommand) {
  return {
    schemaVersion: c.schemaVersion,
    actorId: c.actorId,
    authSubject: c.authSubject,
    commandId: c.commandId,
    commandType: c.commandType,
    correlationId: c.correlationId,
    countryId: c.countryId,
    worldId: c.worldId,
    officeId: c.officeId,
    expectedWorldVersion: c.expectedWorldVersion,
    idempotencyKey: c.idempotencyKey,
    simTime: c.simTime.toCanonicalValue(),
    submittedAtReal: c.submittedAtReal,
    payload: JSON.parse(c.canonicalPayload) as unknown,
  };
}
export function parseSocialPositionOfferCreateIntent(
  v: unknown,
): SocialPositionOfferCreateIntent {
  const r = exact(v, [
    'schemaVersion',
    'positionId',
    'locationId',
    'skill',
    'publicService',
    'occupation',
    'requiredCount',
    'wageScheduleRef',
    'fundingAccountId',
    'coverageDays',
  ]);
  if (
    r.schemaVersion !== 'social-employment-position-offer-create-v1' ||
    !['LOW', 'MEDIUM', 'HIGH'].includes(String(r.skill)) ||
    ![
      'EDUCATION',
      'HEALTHCARE',
      'PUBLIC_SAFETY',
      'PUBLIC_ADMINISTRATION',
    ].includes(String(r.publicService)) ||
    ![
      'GENERAL',
      'TEACHER',
      'DOCTOR',
      'NURSE',
      'MEDICAL_TECHNICIAN',
      'SUPPORT',
    ].includes(String(r.occupation))
  )
    invalid('unsupported position schema/classification');
  const days = whole(r.coverageDays, true);
  if (BigInt(days) > 360n) invalid('coverage exceeds one simulation year');
  return freeze({
    schemaVersion: r.schemaVersion,
    positionId: ref(r.positionId),
    locationId: ref(r.locationId),
    skill: r.skill as LabourSkill,
    publicService: r.publicService as PublicServiceKind,
    occupation: r.occupation as OpeningLabourPositionDemand['occupation'],
    requiredCount: whole(r.requiredCount, true),
    wageScheduleRef: ref(r.wageScheduleRef),
    fundingAccountId: ref(r.fundingAccountId),
    coverageDays: days,
  });
}
function commandIntent(c: CanonicalCommand, digest: Sha256Hex) {
  validateCanonicalCommand(c, digest);
  if (
    c.commandType !== SOCIAL_POSITION_OFFER_CREATE_COMMAND ||
    c.officeId !== 'SOCIAL' ||
    c.expectedWorldVersion === null ||
    c.idempotencyKey === null
  )
    invalid('wrong canonical family/Office/version/idempotency');
  return parseSocialPositionOfferCreateIntent(
    JSON.parse(c.canonicalPayload) as unknown,
  );
}
/** Initialize replay metadata around the existing E03 state, never create a
 * second labour engine or copy filled positions into offers. */
export function createSocialPositionOfferLifecycleState(
  employment: SocialEmploymentServiceState,
  offers: readonly SocialEmploymentWageOffer[] = [],
): SocialPositionOfferLifecycleState {
  return freeze({
    schemaVersion: 'social-employment-position-lifecycle-v1',
    employment,
    offers: [...offers],
    reservations: [],
    operations: [],
  });
}
function derive(input: {
  command: CanonicalCommand;
  state: SocialPositionOfferLifecycleState;
  readFacts: SocialPositionOfferReadFacts;
  sha256Hex: Sha256Hex;
}) {
  const { command: c, sha256Hex: digest } = input,
    intent = commandIntent(c, digest),
    facts = clone(input.readFacts),
    state = input.state;
  exact(state, [
    'schemaVersion',
    'employment',
    'offers',
    'reservations',
    'operations',
  ]);
  exact(facts, [
    'policyVersion',
    'sourceRevision',
    'governmentEntityId',
    'centralBankEntityId',
    'employment',
    'wageSchedule',
    'funding',
  ]);
  if (
    state.schemaVersion !== 'social-employment-position-lifecycle-v1' ||
    facts.policyVersion !== SOCIAL_POSITION_OFFER_POLICY ||
    !/^(?:sha256:|POSTWAR_E03_)[a-f0-9]{64}$/u.test(facts.sourceRevision) ||
    state.employment.worldId !== c.worldId ||
    facts.employment.simTime !== c.simTime.toCanonicalValue()
  )
    invalid('source World/version/current SimTime mismatch');
  legalEntityId(facts.governmentEntityId);
  legalEntityId(facts.centralBankEntityId);
  const duplicate = state.operations.find((o) => o.commandId === c.commandId);
  if (duplicate) {
    const original = parseCanonicalCommand(
      JSON.parse(duplicate.canonicalCommand),
      digest,
    );
    if (
      duplicate.commandFingerprint !== c.fingerprint ||
      original.fingerprint !== c.fingerprint ||
      original.canonicalPayload !== c.canonicalPayload
    )
      invalid('idempotency conflict');
    const offer = state.offers.find(
        (o) => o.positionId === duplicate.positionId,
      ),
      reservation = state.reservations.find(
        (r) => r.positionId === duplicate.positionId,
      );
    if (
      !offer ||
      !reservation ||
      offer.payrollFundingRef !== reservation.reservationId
    )
      invalid('duplicate lacks its original offer/reservation');
    return freeze({
      source: 'EXACT_DUPLICATE' as const,
      state,
      offer,
      reservation,
      eventPayload: null,
    });
  }
  const wage = facts.wageSchedule,
    funding = facts.funding,
    floor = facts.employment.minimumWage,
    day = BigInt(whole(facts.employment.boundary.dayIndex));
  exact(wage, [
    'scheduleId',
    'countryId',
    'skill',
    'publicService',
    'occupation',
    'amount',
    'currency',
    'period',
    'wageVersion',
    'validFromDayIndex',
    'validUntilDayIndex',
  ]);
  exact(funding, [
    'accountId',
    'countryId',
    'ownerId',
    'currency',
    'liquidBalance',
    'priorReservations',
  ]);
  if (
    state.employment.labour.positions.some(
      (p) => p.positionId === intent.positionId,
    ) ||
    state.offers.some((o) => o.positionId === intent.positionId)
  )
    invalid('existing position cannot be overwritten');
  if (
    wage.scheduleId !== intent.wageScheduleRef ||
    wage.countryId !== c.countryId ||
    wage.skill !== intent.skill ||
    wage.publicService !== intent.publicService ||
    wage.occupation !== intent.occupation ||
    wage.period !== 'SIM_YEAR' ||
    funding.accountId !== intent.fundingAccountId ||
    funding.ownerId !== facts.governmentEntityId ||
    funding.countryId !== c.countryId ||
    funding.currency !== wage.currency ||
    floor.countryId !== c.countryId ||
    floor.currency !== wage.currency ||
    floor.period !== 'SIM_YEAR'
  )
    invalid('employer/wage/funding scope mismatch');
  if (
    day < BigInt(whole(wage.validFromDayIndex)) ||
    day >= BigInt(whole(wage.validUntilDayIndex)) ||
    day < BigInt(whole(floor.validFromDayIndex)) ||
    day >= BigInt(whole(floor.validUntilDayIndex))
  )
    invalid('expired wage schedule/minimum');
  const rate = money(wage.amount, wage.currency),
    minimum = money(floor.amount, floor.currency),
    balance = money(funding.liquidBalance, funding.currency);
  if (rate.amount.isZero() || rate.amount.lessThan(minimum.amount))
    invalid('wage below lawful minimum');
  const population = facts.employment.populationAvailability.find(
    (p) => p.countryId === c.countryId && p.locationId === intent.locationId,
  );
  if (!population) invalid('actual regional population missing');
  const demand: OpeningLabourPositionDemand = {
    positionId: intent.positionId,
    countryId: c.countryId,
    locationId: intent.locationId,
    skill: intent.skill,
    owner: 'PUBLIC_SERVICE',
    classificationId: intent.publicService,
    requiredCount: intent.requiredCount,
    sourceWeight: '1',
    employerId: facts.governmentEntityId,
    employerRole: 'GOV',
    occupation: intent.occupation,
    wageAmount: wage.amount,
    wageCurrency: wage.currency,
    wagePeriod: wage.period,
    wageVersion: wage.wageVersion,
    payrollFundingRef: `RESERVE_${c.commandId}`,
  };
  // The existing materializer enforces actual occupation↔skill↔service rules.
  materializeOpeningLabourState({
    targets: [
      {
        countryId: c.countryId,
        locationId: intent.locationId,
        skill: intent.skill,
        count: '0',
      },
    ],
    positions: [demand],
    populationAvailability: [population],
    skillAvailability: [
      {
        countryId: c.countryId,
        locationId: intent.locationId,
        skill: intent.skill,
        count: '0',
      },
    ],
    nonEmployedAggregates: [],
    employers: [
      {
        countryId: c.countryId,
        employerId: facts.governmentEntityId,
        role: 'GOV',
      },
    ],
  });
  const annual = rate.amount
    .times(intent.requiredCount)
    .times(intent.coverageDays);
  // Match the existing opening payroll convention: reserve up to the next
  // currency cent; retain the exact numerator rather than call it a payment.
  const reserve = annual.dividedBy('360').toDecimalPlaces(2, 2);
  const seen = new Set<string>();
  let held = money('0', funding.currency).amount;
  for (const prior of funding.priorReservations) {
    exact(prior, ['reservationId', 'sourceRef', 'amount']);
    ref(prior.reservationId);
    // Provenance is the original file/JSON pointer (including '#/'), not an
    // economic IdempotencyKey. Preserve its actual case and exact pointer.
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:/#-]{0,511}$/u.test(prior.sourceRef))
      invalid('original reservation source pointer required');
    if (seen.has(prior.reservationId))
      invalid('duplicate original reservation');
    seen.add(prior.reservationId);
    held = held.plus(money(prior.amount, funding.currency).amount);
  }
  for (const previous of state.reservations) {
    if (seen.has(previous.reservationId))
      invalid('reservation represented twice');
    seen.add(previous.reservationId);
    if (previous.accountId === funding.accountId) {
      if (
        previous.currency !== funding.currency ||
        previous.employerId !== facts.governmentEntityId ||
        previous.state !== 'RESERVED_NOT_PAID'
      )
        invalid('prior lifecycle reservation scope mismatch');
      held = held.plus(money(previous.amount, funding.currency).amount);
    }
  }
  if (held.plus(reserve).greaterThan(balance.amount))
    invalid('insufficient unencumbered actual liquid funds');
  const reservation: SocialPositionPayrollReservation = freeze({
    reservationId: ref(`RESERVE_${c.commandId}`),
    positionId: intent.positionId,
    accountId: funding.accountId,
    employerId: facts.governmentEntityId,
    countryId: c.countryId,
    amount: canonicalDecimal(reserve),
    currency: funding.currency,
    coverageDays: intent.coverageDays,
    exactAnnualNumerator: canonicalDecimal(annual),
    denominator: '360',
    state: 'RESERVED_NOT_PAID',
  });
  const offer: SocialEmploymentWageOffer = freeze({
    positionId: intent.positionId,
    countryId: c.countryId,
    locationId: intent.locationId,
    skill: intent.skill,
    employerId: facts.governmentEntityId,
    employerRole: 'GOV',
    legalPositionRef: ref(`LEGAL_${c.commandId}`),
    payrollFundingRef: reservation.reservationId,
    offerVersion: ref(`OFFER_${c.commandId}`),
    state: 'ACTIVE',
    wageVersion: ref(wage.wageVersion),
    amount: wage.amount,
    currency: wage.currency,
    period: 'SIM_YEAR',
    validFromDayIndex: day.toString(),
    validUntilDayIndex: [
      BigInt(wage.validUntilDayIndex),
      BigInt(floor.validUntilDayIndex),
      day + BigInt(intent.coverageDays),
    ]
      .reduce((a, b) => (a < b ? a : b))
      .toString(),
  });
  const readFacts: SocialEmploymentReadFacts = { ...facts.employment, offer };
  const before = validateSocialEmploymentServiceState(
    state.employment,
    readFacts,
    digest,
  );
  const labour = applyLabourFacts({
    state: before.labour,
    boundary: readFacts.boundary,
    populationAvailability: readFacts.populationAvailability,
    facts: [
      {
        kind: 'PUBLIC_POSITION_SET',
        factId: ref(`POSITION_${c.commandId}`),
        countryId: c.countryId,
        locationId: intent.locationId,
        dayIndex: day.toString(),
        positionId: intent.positionId,
        publicService: intent.publicService,
        skill: intent.skill,
        requiredCount: intent.requiredCount,
      },
      {
        kind: 'WAGE_ASSERTION',
        factId: ref(`WAGE_${c.commandId}`),
        countryId: c.countryId,
        locationId: intent.locationId,
        dayIndex: day.toString(),
        positionId: intent.positionId,
        wageVersion: wage.wageVersion,
        wageAmount: wage.amount,
      },
    ],
  }).state;
  const employment = validateSocialEmploymentServiceState(
    { ...before, labour },
    readFacts,
    digest,
  );
  const next: SocialPositionOfferLifecycleState = freeze({
    ...state,
    employment,
    offers: [...state.offers, offer],
    reservations: [...state.reservations, reservation],
    operations: [
      ...state.operations,
      {
        commandId: c.commandId,
        commandFingerprint: c.fingerprint,
        canonicalCommand: canonicalSerialize(wire(c)),
        positionId: intent.positionId,
      },
    ],
  });
  return freeze({
    source: 'APPLIED' as const,
    state: next,
    offer,
    reservation,
    eventPayload: {
      schemaVersion: 'social-employment-position-offer-event-v1',
      command: wire(c),
      readFacts: facts,
      beforeStateHash: hash(state, digest),
      afterStateHash: hash(next, digest),
      offer,
      reservation,
    },
  });
}
export type SocialPositionOfferPreparedOperation = ReturnType<typeof derive>;

/** The host must hold the real source custody + canonical prefix to COMMIT.
 * Both current Office capabilities are independently rechecked before/after;
 * generic data/flags and copied contexts cannot authorize this operation. */
export async function prepareAuthorizedSocialPositionOfferCreate(
  input: Parameters<typeof derive>[0] & {
    readonly socialAuthorization: AuthorizedOfficeContext;
    readonly financeAuthorization: AuthorizedOfficeContext;
    readonly financialLedger: FinancialLedgerState;
  },
): Promise<SocialPositionOfferPreparedOperation> {
  const check = async () => {
    for (const [presented, office, capability] of [
      [input.socialAuthorization, 'SOCIAL', 'SOCIAL_LABOUR'],
      [input.financeAuthorization, 'FINANCE', 'FINANCE_BUDGET'],
    ] as const) {
      const current = await reauthorizeOfficeCapability(presented);
      if (
        current.worldId !== input.command.worldId ||
        current.countryId !== input.command.countryId ||
        current.officeId !== office ||
        current.capability !== capability ||
        current.authSubject !== input.command.authSubject ||
        current.teamId !== input.socialAuthorization.teamId ||
        current.authorizationVersion !== presented.authorizationVersion ||
        current.authorizationVersion !==
          input.socialAuthorization.authorizationVersion
      )
        invalid('current employer/budget authorization mismatch');
    }
  };
  await check();
  const ledger = input.financialLedger,
    funding = input.readFacts.funding;
  if (
    !isAuthoritativeFinancialLedgerState(ledger) ||
    ledger.worldId !== input.command.worldId ||
    ledger.worldVersion !== input.command.expectedWorldVersion
  )
    invalid('actual current Core financial lineage required');
  const position = ledger.positions.find(
    (p) => p.account.accountId === funding.accountId,
  );
  if (
    !position ||
    position.account.worldId !== input.command.worldId ||
    position.account.countryId !== input.command.countryId ||
    position.account.ownerId !== input.readFacts.governmentEntityId ||
    position.account.currency !== funding.currency ||
    !['CASH', 'DEPOSIT', 'ASSET'].includes(position.account.accountClass) ||
    canonicalDecimal(position.netDebitBalance.amount) !== funding.liquidBalance
  )
    invalid('funding is not actual current employer balance');
  if (position.account.accountClass === 'ASSET') {
    const mirror = ledger.positions.filter(
      (p) =>
        p.account.accountClass === 'LIABILITY' &&
        p.account.countryId === position.account.countryId &&
        p.account.ownerId === input.readFacts.centralBankEntityId &&
        p.account.counterpartyEntityId === position.account.ownerId &&
        p.account.claimId === position.account.claimId &&
        p.account.currency === position.account.currency,
    );
    if (
      position.account.claimId === null ||
      position.account.counterpartyEntityId !==
        input.readFacts.centralBankEntityId ||
      mirror.length !== 1 ||
      !mirror[0]!.netDebitBalance.amount
        .negated()
        .equals(position.netDebitBalance.amount)
    )
      invalid(
        'asset is not the source government/central-bank liquid deposit mirror',
      );
  }
  const operation = derive(input);
  await check();
  return operation;
}
/** Recompute full lifecycle from the actual committed stream; no new context,
 * admission or active offer is issued by an arbitrary standalone event DTO. */
export function reduceSocialPositionOfferCreatedEvent(input: {
  readonly state: SocialPositionOfferLifecycleState;
  readonly event: ReplayReducerEvent;
  readonly sha256Hex: Sha256Hex;
}): SocialPositionOfferLifecycleState {
  const r = exact(input.event.payload, [
    'schemaVersion',
    'command',
    'readFacts',
    'beforeStateHash',
    'afterStateHash',
    'offer',
    'reservation',
  ]);
  if (r.schemaVersion !== 'social-employment-position-offer-event-v1')
    invalid('wrong lifecycle event schema');
  const c = parseCanonicalCommand(r.command, input.sha256Hex);
  commandIntent(c, input.sha256Hex);
  if (
    input.event.eventType !== SOCIAL_POSITION_OFFER_CREATED_EVENT ||
    input.event.worldId !== c.worldId ||
    input.event.causationCommandId !== c.commandId ||
    input.event.transitionId !== c.commandId ||
    input.event.worldVersionBefore !== c.expectedWorldVersion ||
    input.event.worldVersionAfter !==
      (BigInt(c.expectedWorldVersion!) + 1n).toString() ||
    input.event.simTime.ticks !== c.simTime.ticks ||
    input.event.correctsEventId !== null ||
    hash(input.state, input.sha256Hex) !== r.beforeStateHash
  )
    invalid('event scope/causation/version/predecessor mismatch');
  const operation = derive({
    command: c,
    state: input.state,
    readFacts: r.readFacts as unknown as SocialPositionOfferReadFacts,
    sha256Hex: input.sha256Hex,
  });
  if (
    operation.source !== 'APPLIED' ||
    canonicalSerialize(operation.eventPayload) !== canonicalSerialize(r)
  )
    invalid('lifecycle replay differs from actual Core calculation');
  return operation.state;
}
