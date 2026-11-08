/** Actual admitted E03 DATA projections. These helpers issue no source licence,
 * admission, current-state or authorization token. Runtime callers hold locks. */
import {
  parseSocialEmploymentServiceCreateIntent,
  type CanonicalCommand,
  type CanonicalSha256,
  type SocialEmploymentServiceCreationReadFacts,
} from '@econmind/core';
import type { FinanceNativeBudgetSocialCreationOriginals } from '@econmind/core/finance-budget-native';
import type { PostwarSocialEmploymentStateDocument } from '../preparation/postwar-social-employment-state.js';
import {
  consumePreparedPostwarSocialFinancialReplayBase,
  readPreparedPostwarSocialSourceMetadataForBase,
  type PreparedPostwarSocialFinancialReplayBase,
} from './prepared-postwar-social-source.js';
function fail(s: string): never {
  throw Error('POSTWAR_SOCIAL_SERVICE_CREATE:' + s);
}
type Source = Readonly<{ sourceId: string; payloadHash: CanonicalSha256 }>;
export function projectPostwarSocialServiceCreationOriginals(
  document: PostwarSocialEmploymentStateDocument,
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
