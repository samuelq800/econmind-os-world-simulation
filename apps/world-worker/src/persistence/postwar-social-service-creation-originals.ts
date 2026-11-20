/** Actual admitted E03 DATA projections. These helpers issue no source licence,
 * admission, current-state or authorization token. Runtime callers hold locks. */
import {
  parseSocialEmploymentServiceCreateIntent,
  type CanonicalCommand,
  type CanonicalSha256,
  type SocialEmploymentServiceCreationReadFacts,
  type SocialEmploymentServiceState,
  type LabourSkill,
  parseCanonicalCommand,
} from '@econmind/core';
import type { FinanceNativeBudgetSocialCreationOriginals } from '@econmind/core/finance-budget-native';
import type {
  PostwarSocialEmploymentStateDocument,
  PostwarSocialEmploymentCountrySource,
} from '../preparation/postwar-social-employment-state.js';
import {
  consumePreparedPostwarSocialFinancialReplayBase,
  readPreparedPostwarSocialSourceMetadataForBase,
  type PreparedPostwarSocialFinancialReplayBase,
} from './prepared-postwar-social-source.js';
function fail(s: string): never {
  throw Error('POSTWAR_SOCIAL_SERVICE_CREATE:' + s);
}
type Source = Readonly<{ sourceId: string; payloadHash: CanonicalSha256 }>;
type SourceData = Readonly<{
  inputs: Readonly<{
    worldId: string;
    fundingAccounts: readonly Pick<
      PostwarSocialEmploymentStateDocument['inputs']['fundingAccounts'][number],
      'countryId' | 'payerRole' | 'currency' | 'payerEntityId'
    >[];
  }>;
  countries: readonly Pick<
    PostwarSocialEmploymentCountrySource,
    'countryId' | 'minimumWage' | 'validationReadFacts' | 'npcUsageLicenses'
  >[];
}>;
type PlanningSourceData = Omit<SourceData, 'countries'> &
  Readonly<{
    countries: readonly (SourceData['countries'][number] &
      Pick<PostwarSocialEmploymentCountrySource, 'physicalDayBodies'>)[];
  }>;
export function projectPostwarSocialServiceCreationOriginals(
  document: SourceData,
  source: Source,
): readonly FinanceNativeBudgetSocialCreationOriginals[] {
  if (!/^sha256:[a-f0-9]{64}$/u.test(source.payloadHash))
    fail('ACTUAL_OPERATING_SOURCE_FINGERPRINT_REQUIRED');
  return Object.freeze(
    document.countries.map((country) => {
      const funding = document.inputs.fundingAccounts.filter(
        (f) => f.countryId === country.countryId && f.payerRole === 'GOV',
      );
      if (
        funding.length !== 1 ||
        funding[0]!.currency !== country.minimumWage.currency
      )
        fail('ACTUAL_UNIQUE_GOV_LOCAL_CURRENCY_REQUIRED');
      return Object.freeze({
        worldId: document.inputs.worldId,
        countryId: country.countryId,
        governmentEntityId: funding[0]!.payerEntityId,
        localCurrency: funding[0]!.currency,
        sourceRef: source.sourceId,
        sourceFingerprint: source.payloadHash,
        populationAvailability:
          country.validationReadFacts.facts.populationAvailability,
        usageLicences: country.npcUsageLicenses,
      });
    }),
  );
}
export function readPostwarSocialServiceCreationOriginalsForBase(
  base: Readonly<PreparedPostwarSocialFinancialReplayBase>,
): readonly FinanceNativeBudgetSocialCreationOriginals[] {
  const b = consumePreparedPostwarSocialFinancialReplayBase(base);
  return projectPostwarSocialServiceCreationOriginals(
    b.document,
    readPreparedPostwarSocialSourceMetadataForBase(base),
  );
}
/** Pure DATA only; real source/authority checks belong to the same-tx runtime. */
export function projectPostwarSocialServiceCreationFacts(input: {
  command: CanonicalCommand;
  document: PostwarSocialEmploymentStateDocument;
  source: Source;
  head: { worldVersion: string; eventSequence: string };
}): SocialEmploymentServiceCreationReadFacts {
  const { command, document } = input,
    intent = parseSocialEmploymentServiceCreateIntent(
      JSON.parse(command.canonicalPayload),
    );
  const country = document.countries.find(
      (c) => c.countryId === command.countryId,
    ),
    originals = projectPostwarSocialServiceCreationOriginals(
      document,
      input.source,
    ).find((o) => o.countryId === command.countryId);
  if (!country || !originals || document.inputs.worldId !== command.worldId)
    fail('ACTUAL_SAME_COUNTRY_E03_REQUIRED');
  const licences = country.npcUsageLicenses.filter(
    (l) =>
      l.locationId === intent.target.locationId &&
      l.beneficiaryEntityId === originals.governmentEntityId,
  );
  if (licences.length !== 1) fail('ACTUAL_UNIQUE_T0_USAGE_LICENCE_REQUIRED');
  const licence = licences[0]!,
    ids = new Set(licence.dutyAssignmentIds),
    duties = country.dutyAssignments.filter((d) => ids.has(d.assignmentId));
  if (
    duties.length !== ids.size ||
    !duties.length ||
    duties.some(
      (d) =>
        d.countryId !== country.countryId ||
        d.locationId !== licence.locationId ||
        d.employerId !== licence.licensorEntityId ||
        d.duty === 'PRIMARY_RECOVERY_SERVICE' ||
        d.minutesPerWorker !== '480',
    ) ||
    duties.reduce((n, d) => n + BigInt(d.totalMinutes), 0n).toString() !==
      licence.maximumWorkerMinutes
  )
    fail('ACTUAL_LICENSED_DESK_PERSON_TIME_REQUIRED');
  for (const d of duties)
    if (BigInt(d.workerCount) * 480n !== BigInt(d.totalMinutes))
      fail('ACTUAL_EXCLUSIVE_DUTY_MINUTES_REQUIRED');
  if (
    !country.physicalDayBodies.some(
      (b) =>
        b.locationId === intent.target.locationId &&
        b.dayIndex === '0' &&
        b.pools.some(
          (p) =>
            p.poolId === intent.target.servicePoolId &&
            p.skill === intent.target.skill,
        ),
    )
  )
    fail('ACTUAL_ROOT_DESK_PHYSICAL_ORIGINAL_REQUIRED');
  const facts: SocialEmploymentServiceCreationReadFacts = {
    worldId: command.worldId,
    boundary: country.validationReadFacts.facts.boundary,
    simTime: command.simTime.toCanonicalValue(),
    populationAvailability: originals.populationAvailability,
    head: input.head,
    countryId: country.countryId,
    governmentEntityId: originals.governmentEntityId,
    localCurrency: originals.localCurrency,
    sourceRef: originals.sourceRef,
    sourceFingerprint: input.source.payloadHash,
    sourceRevocations: [],
    usageLicence: licence,
  };
  return Object.freeze(facts);
}

export interface PostwarSocialServiceCreationPlanningData {
  readonly classification: 'CURRENT_T0_SERVICE_CREATION_PLANNING_DATA_NOT_AUTHORITY';
  readonly worldId: string;
  readonly countryId: string;
  readonly head: Readonly<{ worldVersion: string; eventSequence: string }>;
  readonly simTime: string;
  readonly dayIndex: '0';
  readonly localCurrency: string;
  readonly sourceRef: string;
  readonly sourceFingerprint: string;
  readonly usageLicences: readonly SocialEmploymentServiceCreationReadFacts['usageLicence'][];
  readonly rootTargets: readonly Readonly<{
    poolId: string;
    locationId: string;
    skill: LabourSkill;
    dayIndex: string;
    capacitySlots: string;
    usedSlots: string;
    reservedSlots: string;
    actualUnemployedCount: string;
  }>[];
  readonly creations: readonly Readonly<{
    programmeId: string;
    parentPoolId: string;
    childPoolId: string;
    capacitySlots: string;
  }>[];
}
/** Immutable DATA only. The fixed runtime supplies a genuine complete replay,
 * actual registered Clock and held current source/admission; this function
 * neither issues authority nor turns an arbitrary document into currentness. */
export function projectPostwarSocialServiceCreationPlanning(input: {
  document: PlanningSourceData;
  source: Source;
  countryId: string;
  servicePoolIds: readonly string[];
  state: SocialEmploymentServiceState;
  head: Readonly<{ worldVersion: string; eventSequence: string }>;
  simTime: string;
  sha256Hex: import('@econmind/core').Sha256Hex;
}): Readonly<PostwarSocialServiceCreationPlanningData> {
  const country = input.document.countries.find(
      (c) => c.countryId === input.countryId,
    ),
    original = projectPostwarSocialServiceCreationOriginals(
      input.document,
      input.source,
    ).find((c) => c.countryId === input.countryId);
  if (
    !country ||
    !original ||
    input.state.worldId !== original.worldId ||
    !/^(0|[1-9][0-9]*)$/u.test(input.simTime) ||
    BigInt(input.simTime) >= 86400000n
  )
    fail('ACTUAL_T0_PLANNING_COUNTRY_REQUIRED');
  if (
    input.servicePoolIds.length > 100 ||
    new Set(input.servicePoolIds).size !== input.servicePoolIds.length ||
    input.servicePoolIds.some(
      (id) =>
        typeof id !== 'string' ||
        !id.length ||
        id.length > 512 ||
        !input.state.servicePools.some(
          (p) => p.poolId === id && p.countryId === input.countryId,
        ),
    )
  )
    fail('EXACT_CURRENT_PAGE_SERVICE_POOL_IDS_REQUIRED');
  const selectedIds = new Set(input.servicePoolIds);
  const creations = (input.state.creations ?? []).map((record) => {
    const command = parseCanonicalCommand(
        JSON.parse(record.canonicalCommand),
        input.sha256Hex,
      ),
      intent = parseSocialEmploymentServiceCreateIntent(
        JSON.parse(command.canonicalPayload),
      );
    if (
      command.countryId !== input.countryId ||
      command.worldId !== original.worldId
    )
      fail('CURRENT_CREATION_COUNTRY_DIFFERS');
    return Object.freeze({
      programmeId: intent.programmeId,
      parentPoolId: intent.target.servicePoolId,
      childPoolId: record.servicePoolId,
      capacitySlots: intent.capacity.amount,
    });
  });
  const childIds = new Set(creations.map((c) => c.childPoolId));

  const rootTargets = input.state.servicePools
    .filter(
      (p) =>
        p.countryId === input.countryId &&
        p.dayIndex === '0' &&
        selectedIds.has(p.poolId) &&
        !childIds.has(p.poolId) &&
        country.physicalDayBodies.some(
          (b) =>
            b.dayIndex === '0' &&
            b.locationId === p.locationId &&
            b.pools.some((l) => l.poolId === p.poolId && l.skill === p.skill),
        ),
    )
    .map((p) =>
      Object.freeze({
        poolId: p.poolId,
        locationId: p.locationId,
        skill: p.skill,
        dayIndex: p.dayIndex,
        capacitySlots: p.capacitySlots,
        usedSlots: p.usedSlots,
        reservedSlots: p.reservedSlots,
        actualUnemployedCount: input.state.labour.aggregates
          .filter(
            (a) =>
              a.countryId === p.countryId &&
              a.locationId === p.locationId &&
              a.skill === p.skill &&
              a.status === 'UNEMPLOYED_SEARCHING',
          )
          .reduce((n, a) => n + BigInt(a.count), 0n)
          .toString(),
      }),
    );
  const relatedCreations = creations.filter((c) =>
      selectedIds.has(c.childPoolId),
    ),
    locations = new Set(rootTargets.map((p) => p.locationId));
  const usageLicences = Object.freeze(
    original.usageLicences.filter(
      (l) =>
        l.beneficiaryEntityId === original.governmentEntityId &&
        locations.has(l.locationId),
    ),
  );
  return Object.freeze({
    classification: 'CURRENT_T0_SERVICE_CREATION_PLANNING_DATA_NOT_AUTHORITY',
    worldId: original.worldId,
    countryId: input.countryId,
    head: Object.freeze({ ...input.head }),
    simTime: input.simTime,
    dayIndex: '0',
    localCurrency: original.localCurrency,
    sourceRef: original.sourceRef,
    sourceFingerprint: original.sourceFingerprint,
    usageLicences,
    rootTargets: Object.freeze(rootTargets),
    creations: Object.freeze(relatedCreations),
  });
}
