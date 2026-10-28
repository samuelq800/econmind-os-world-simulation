/** Pure shared-prefix derivation, NEVER source admission/currentness or a
 * database publication capability. Call only while the genuine originals and
 * canonical-lineage guards remain held by the owning server transaction. */
import { createHash } from 'node:crypto';
import {
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  Money,
} from '@econmind/core';
import {
  prepareFinanceNativeBudgetMixedPrefix,
  readFinanceNativeBudgetMixedPrefix,
} from '@econmind/core/finance-budget-native';
import {
  validatePostwarSocialEmploymentStateDocument,
  type PostwarSocialEmploymentStateDocument,
} from '../preparation/postwar-social-employment-state.js';
import type { ValidatedCanonicalLineageData } from './validated-canonical-lineage.js';
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), digest);
const issuedPrefixes = new WeakSet<object>();
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
export function replayPostwarSharedOfficePrefix(input: {
  readonly lineage: Readonly<ValidatedCanonicalLineageData>;
  readonly document: PostwarSocialEmploymentStateDocument;
}) {
  const { lineage } = input;
  const document = validatePostwarSocialEmploymentStateDocument(input.document);
  if (
    document.inputs.worldId !== lineage.worldId ||
    document.inputs.seedId !== lineage.seed.seedId
  )
    throw Error('POSTWAR_SHARED_PREFIX:REAL_ORIGINAL_WORLD_SEED_REQUIRED');
  const frames = lineage.transitions.map((t) => ({
    ...t,
    events: t.transition.events,
  }));
  const evidence = prepareFinanceNativeBudgetMixedPrefix(
    {
      worldId: lineage.worldId,
      frames,
      socialCountries: document.countries.map((c) => ({
        countryId: c.countryId,
        state: c.state,
        offers: c.offers,
      })),
    },
    digest,
  );
  const result = readFinanceNativeBudgetMixedPrefix(
    evidence,
    lineage.worldId,
    frames,
    digest,
  );
  if (
    result.budgetState.worldVersion !== lineage.headWorldVersion ||
    result.budgetState.eventSequence !== lineage.headEventSequence
  )
    throw Error('POSTWAR_SHARED_PREFIX:COMPLETE_ACTUAL_HEAD_REQUIRED');
  const reserved = new Map<string, ReturnType<typeof Money.from>>();
  for (const account of document.inputs.fundingAccounts.filter(
    (a) => a.payerRole === 'GOV',
  )) {
    const position = lineage.ledgers.financial.positions.find(
      (p) => p.account.accountId === account.accountRef,
    );
    if (
      !position ||
      position.account.countryId !== account.countryId ||
      position.account.ownerId !== account.payerEntityId ||
      position.account.claimId !== account.claimId ||
      position.account.currency !== account.currency ||
      position.account.counterpartyEntityId !== account.issuerEntityId ||
      position.account.accountClass !== 'ASSET'
    )
      throw Error('POSTWAR_SHARED_PREFIX:ACTUAL_TREASURY_CLAIM_REQUIRED');
    reserved.set(
      account.accountRef,
      Money.from(account.reservedAmount, account.currency),
    );
  }
  const capacities = [
    ...result.budgetEncumbrances.map((c) => ({
      accountId: c.accountId,
      claimId: c.claimId,
      countryId: c.countryId,
      ownerId: c.governmentEntityId,
      amount: c.amount,
      currency: c.currency,
    })),
    ...result.socialReservations.map((r) => ({
      accountId: r.accountId,
      claimId: null,
      countryId: r.countryId,
      ownerId: r.employerId,
      amount: r.amount,
      currency: r.currency,
    })),
  ];
  for (const capacity of capacities) {
    const accounts = document.inputs.fundingAccounts.filter(
      (a) =>
        a.accountRef === capacity.accountId &&
        a.countryId === capacity.countryId &&
        a.payerEntityId === capacity.ownerId &&
        a.currency === capacity.currency &&
        a.payerRole === 'GOV' &&
        (capacity.claimId === null || a.claimId === capacity.claimId),
    );
    if (accounts.length !== 1)
      throw Error(
        'POSTWAR_SHARED_PREFIX:EXACT_CAPACITY_ACCOUNT_OWNER_REQUIRED',
      );
    const total = reserved.get(capacity.accountId);
    if (!total) throw Error('POSTWAR_SHARED_PREFIX:OPENING_CAPACITY_REQUIRED');
    reserved.set(
      capacity.accountId,
      total.add(Money.from(capacity.amount, capacity.currency)),
    );
  }
  for (const [account, total] of reserved) {
    const position = lineage.ledgers.financial.positions.find(
      (p) => p.account.accountId === account,
    )!;
    if (total.amount.greaterThan(position.netDebitBalance.amount))
      throw Error('POSTWAR_SHARED_PREFIX:GLOBAL_FISCAL_CAPACITY_OVERBOOKED');
  }
  const prefixFingerprint = hash({
    worldId: lineage.worldId,
    seedFingerprint: lineage.seed.fingerprint,
    headWorldVersion: lineage.headWorldVersion,
    headEventSequence: lineage.headEventSequence,
    frames,
  });
  const shared = freeze({
    classification: 'CORE_VALIDATED_MIXED_PREFIX_NOT_AUTHORITY' as const,
    head: {
      worldId: lineage.worldId,
      worldVersion: lineage.headWorldVersion,
      eventSequence: lineage.headEventSequence,
    },
    seed: {
      seedId: lineage.seed.seedId,
      fingerprint: lineage.seed.fingerprint,
    },
    prefixFingerprint,
    sourceRevision: document.sourceRevision,
    sourceChecksumsSha256: document.inputs.sourceChecksumsSha256,
    evidence,
    budget: {
      state: result.budgetState,
      encumbrances: result.budgetEncumbrances,
    },
    social: {
      countries: result.socialCountries,
      checkpoints: result.checkpoints,
      reservations: result.socialReservations,
    },
    // Full group identities remain visible to consumers; no hidden event filter.
    frames: frames.map((frame) => ({
      commandId: frame.command.commandId,
      countryId: frame.command.countryId,
      commandType: frame.command.commandType,
      transitionFingerprint: hash(frame.transition),
      receiptFingerprint: hash(frame.receipt),
      eventFingerprints: frame.events.map((e) => e.fingerprint),
      worldVersionBefore: frame.transition.worldVersionBefore,
      worldVersionAfter: frame.transition.worldVersionAfter,
      events: frame.events.map((e) => ({
        eventId: e.eventId,
        fingerprint: e.fingerprint,
        sequence: e.sequence,
        worldVersion: e.worldVersion,
      })),
    })),
    sourceFootprints: document.countries.map((c) => {
      const ids = new Set(
        document.inputs.labour.positions
          .filter((p) => p.countryId === c.countryId)
          .map((p) => p.positionId),
      );
      return {
        countryId: c.countryId,
        populationAvailability:
          c.validationReadFacts.facts.populationAvailability,
        fundingAccounts: document.inputs.fundingAccounts
          .filter((a) => a.countryId === c.countryId && a.payerRole === 'GOV')
          .map((a) => ({
            accountId: a.accountRef,
            claimId: a.claimId,
            ownerId: a.payerEntityId,
            issuerEntityId: a.issuerEntityId,
          })),
        populationGroups: [
          ...new Set([
            ...document.inputs.populationPositionRefs
              .filter((r) => ids.has(r.positionId))
              .map((r) => r.cohortId),
            ...c.dutyAssignments.map((a) => a.cohortId),
          ]),
        ].sort(),
      };
    }),
  });
  issuedPrefixes.add(shared);
  return shared;
}
export type PostwarSharedOfficePrefix = ReturnType<
  typeof replayPostwarSharedOfficePrefix
>;
/** Issued calculation data only. This does not verify a DB transaction,
 * current authorization/admission or that a previously read head is current. */
export function consumePostwarSharedOfficePrefix(
  value: unknown,
): PostwarSharedOfficePrefix {
  if (value === null || typeof value !== 'object' || !issuedPrefixes.has(value))
    throw Error('POSTWAR_SHARED_PREFIX:GENUINE_REPLAY_RESULT_REQUIRED');
  return value as PostwarSharedOfficePrefix;
}

/** Data witnesses for a country materialization. Other-country events were
 * replayed too; their absence from this crop is not a no-effect assumption. */
export function deriveCurrentSocialCountryEvidence(
  result: PostwarSharedOfficePrefix,
  countryId: string,
) {
  consumePostwarSharedOfficePrefix(result);
  const countries = result.social.countries.filter(
    (c) => c.countryId === countryId,
  );
  if (countries.length !== 1)
    throw Error('POSTWAR_SHARED_PREFIX:EXACT_COUNTRY_REQUIRED');
  const country = countries[0]!;
  const origin = result.frames
    .filter(
      (f) =>
        f.countryId === countryId && f.commandType.startsWith('CORE_SOCIAL_'),
    )
    .at(-1);
  const originEvent = origin?.events.at(-1) ?? null;
  return freeze({
    countryId,
    head: result.head,
    seed: result.seed,
    prefixFingerprint: result.prefixFingerprint,
    lifecycleHash: hash(country.lifecycle),
    employmentHash: hash(country.lifecycle.employment),
    origin: origin ?? null,
    checkpoint: {
      originCommandId: origin?.commandId ?? null,
      originEventId: originEvent?.eventId ?? null,
      eventFingerprint: originEvent?.fingerprint ?? null,
      originWorldVersion: origin?.worldVersionAfter ?? '0',
      originEventSequence: originEvent?.sequence ?? '0',
      lifecycleHash: hash(country.lifecycle),
      employmentHash: hash(country.lifecycle.employment),
    },
    footprint: {
      positions: country.lifecycle.employment.labour.positions
        .map((p) => p.positionId)
        .sort(),
      aggregates: country.lifecycle.employment.labour.aggregates
        .map((a) =>
          canonicalSerialize({
            countryId: a.countryId,
            locationId: a.locationId,
            skill: a.skill,
            status: a.status,
          }),
        )
        .sort(),
      servicePools: country.lifecycle.employment.servicePools
        .map((p) => p.poolId)
        .sort(),
      employers: [
        ...new Set(country.lifecycle.offers.map((o) => o.employerId)),
      ].sort(),
      fundingAccounts: [
        ...new Set(country.lifecycle.reservations.map((r) => r.accountId)),
      ].sort(),
      source: result.sourceFootprints.find((f) => f.countryId === countryId),
    },
    knownEffectsFingerprint: hash(result.frames),
    classification:
      'DERIVED_COMPLETE_CORE_REPLAY_NOT_SOURCE_ADMISSION' as const,
  });
}
