import { readPostwarSocialServiceCreationOriginalsForBase } from './postwar-social-service-creation-originals.js';
import { readPostwarIndustryLogisticsPageOriginalsFrom } from './postwar-industry-logistics-source.js';
import { readPostwarIndustryUtilityPageOriginalsFrom } from './postwar-industry-utility-source.js';
/** Reconstruct actual effects using a private live H0 DATA preparation and
 * immutable registered historical quotes. Current source/authority/lease/head
 * locks belong to the caller's fixed transaction and are never cached here. */
import { createHash } from 'node:crypto';
import {
  CENTRAL_BANK_OMO_COMMAND,
  DomainError,
  Money,
  DOMAIN_ERROR_CODES,
  type FinancialAccount,
} from '@econmind/core';
import { POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND } from '@econmind/core/authenticated-office-command-contract';
import { POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_EVENT } from '@econmind/core/postwar-day-one-treasury-fx';
import {
  replayPreparedFinanceSocialFxLedger,
  type PreparedFinanceSocialFxReplayResult,
} from '@econmind/core/finance-social-prepared-ledger';
import type { FinanceNativeBudgetCanonicalFrame } from '@econmind/core/finance-budget-native';
import {
  consumePreparedPostwarSocialFinancialReplayBase,
  type PreparedPostwarSocialFinancialReplayBase,
} from './prepared-postwar-social-source.js';
import { readPostwarDayOneFxCommittedQuoteFrom } from './postgres-postwar-day-one-fx-history-originals.js';
import type { SqlExecutor } from './sql-database.js';
import type { PostwarGenesisFunding } from '../preparation/postwar-operating-genesis-adoption.js';
import {
  readPostwarCaptainHistoryOriginalsFrom,
  readPostwarCaptainCurrentOriginalsFrom,
  type PostwarCaptainOriginalStatus,
} from './postwar-captain-history-originals.js';
import { readCentralBankOmoCommittedOriginalsFrom } from './postgres-central-bank-omo-history.js';
import { readPostwarBeneficialHousingRentMixedOriginalsForSocialBase } from './postwar-beneficial-housing-rent-mixed-source.js';
import {
  readPostwarPagedCaptainHistoryOriginalsFrom,
  readPostwarPagedOmoHistoryOriginalsFrom,
} from './postwar-paged-office-history-originals.js';
import { readPostwarIndustryRunPageOriginalsFrom } from './postwar-industry-run-originals.js';
import { readPostwarIndustryOperatingWagePageOriginalsFrom } from './postwar-industry-operating-wage-originals.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Prepared mixed FX replay: ' + reason,
  );
}
function one<T>(values: readonly T[]): T {
  if (values.length !== 1)
    invalid('exact immutable financial account required');
  return values[0]!;
}
/** Pure exact lexical projection. Immutable source cents/precision stay in
 * the retained originals; no rounding, aggregation, balance or grant is added. */
export function projectPostwarOpeningFinancialEncumbrances(
  funding: readonly Pick<
    PostwarGenesisFunding,
    'fundingId' | 'accountId' | 'ceilingAmount' | 'currency'
  >[],
): Parameters<
  typeof replayPreparedFinanceSocialFxLedger
>[0]['openingEncumbrances'] {
  return Object.freeze(
    funding.map((f) =>
      Object.freeze({
        reference: f.fundingId,
        accountId: f.accountId,
        amount: Money.from(f.ceilingAmount, f.currency).toCanonicalValue()
          .amount,
        currency: f.currency,
      }),
    ),
  );
}
export interface PreparedPostwarFinanceSocialFxReplayRequest {
  readonly executor: SqlExecutor;
  readonly baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>;
  readonly worldId: string;
  readonly hostCountryId: string;
  readonly officeId: 'SOCIAL' | 'FINANCE';
  /** Fixed current-publication selector, never supplied capital/authority. */
  readonly captainCountryId?: string;
  readonly requireCaptain?: boolean;
  /** Fixed server source mode, never HTTP input or an admission flag. */
  readonly omoOriginalMode?: 'OFFICIAL_RUNTIME' | 'TEST_ONLY_LOCAL';
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly frames: readonly FinanceNativeBudgetCanonicalFrame[];
  readonly pageBoundary?: Readonly<{
    fromHead: { readonly worldVersion: string; readonly eventSequence: string };
    throughHead: {
      readonly worldVersion: string;
      readonly eventSequence: string;
    };
  }>;
  readonly expectedHead: Readonly<{
    worldVersion: string;
    eventSequence: string;
  }>;
}
export interface PreparedPostwarFinanceSocialFxPageOriginals {
  readonly industryLogisticsSources?: readonly import('@econmind/core/industry-internal-logistics-execution').IndustryInternalLogisticsReplaySources[];
  readonly industryPowerOriginals?: readonly import('@econmind/core/industry-first-day-power-execution').IndustryFirstDayPowerOriginal[];
  readonly industryWaterOriginals?: readonly import('@econmind/core/industry-first-day-water-execution').IndustryFirstDayWaterReplayOriginal[];
  readonly industryWorkSources?: NonNullable<
    Parameters<
      typeof replayPreparedFinanceSocialFxLedger
    >[0]['industryWorkSources']
  >;
  readonly industryWageSources?: NonNullable<
    Parameters<
      typeof replayPreparedFinanceSocialFxLedger
    >[0]['industryWageSources']
  >;
  readonly fxOriginals: Parameters<
    typeof replayPreparedFinanceSocialFxLedger
  >[0]['fxOriginals'];
  readonly captainCountries?: NonNullable<
    Parameters<
      typeof replayPreparedFinanceSocialFxLedger
    >[0]['captainCountries']
  >;
  readonly omoOriginals?: NonNullable<
    Parameters<typeof replayPreparedFinanceSocialFxLedger>[0]['omoOriginals']
  >;
  readonly beneficialHousingRentReceipts?: NonNullable<
    Parameters<
      typeof replayPreparedFinanceSocialFxLedger
    >[0]['beneficialHousingRentReceipts']
  >;
  readonly captainOriginalStatus?: PostwarCaptainOriginalStatus;
}
/** Same fixed original getters and lock semantics, scoped to one complete
 * canonical page. No frame is interpreted as inert or removed from Core replay. */
export async function readPreparedPostwarFinanceSocialFxPageOriginalsFrom(
  input: PreparedPostwarFinanceSocialFxReplayRequest,
): Promise<Readonly<PreparedPostwarFinanceSocialFxPageOriginals>> {
  const b = consumePreparedPostwarSocialFinancialReplayBase(input.baseline);
  if (
    b.pins.worldId !== input.worldId ||
    b.pins.seedRef !== input.seedId ||
    b.pins.contentHash !== input.seedFingerprint ||
    b.pins.admissionRef !== input.admissionRef ||
    !b.document.countries.some((c) => c.countryId === input.hostCountryId)
  )
    invalid('actual current source differs from immutable prepared baseline');
  const originals: Parameters<
    typeof replayPreparedFinanceSocialFxLedger
  >[0]['fxOriginals'][number][] = [];
  for (const frame of input.frames) {
    if (frame.command.commandType !== POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND)
      continue;
    if (
      frame.events.length !== 1 ||
      frame.events[0]!.eventType !== POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_EVENT
    )
      invalid('exact committed FX event required');
    const event = frame.events[0]!;
    const intent = JSON.parse(frame.command.canonicalPayload) as Record<
      string,
      unknown
    >;
    if (
      typeof intent.quoteRef !== 'string' ||
      typeof intent.expectedQuoteSha256 !== 'string'
    )
      invalid('canonical quote identity required');
    const original = await readPostwarDayOneFxCommittedQuoteFrom(
      input.executor,
      {
        worldId: input.worldId,
        hostCountryId: input.hostCountryId,
        sourceCountryId: frame.command.countryId,
        officeId: input.officeId,
        seedFingerprint: input.seedFingerprint,
        admissionRef: input.admissionRef,
        eventId: event.eventId,
        eventPayloadHash: event.payloadHash,
        quoteRef: intent.quoteRef,
        quoteSha256: intent.expectedQuoteSha256,
      },
    );
    if (
      original.observedHead.worldVersion !== input.expectedHead.worldVersion ||
      original.observedHead.eventSequence !==
        input.expectedHead.eventSequence ||
      original.trace.commandFingerprint !== frame.command.fingerprint ||
      original.trace.commandId !== frame.command.commandId ||
      original.trace.seedId !== input.seedId ||
      original.trace.worldVersion !== event.worldVersion ||
      original.trace.eventSequence !== event.sequence
    )
      invalid('historical quote witness differs from actual complete prefix');
    const q = original.quote;
    if (
      q.worldId !== input.worldId ||
      q.seedFingerprint !== input.seedFingerprint ||
      q.countryId !== frame.command.countryId ||
      q.quoteRef !== intent.quoteRef ||
      q.quoteSha256 !== intent.expectedQuoteSha256
    )
      invalid('historical quote differs from actual command/source');
    for (const [sourceId, payloadHash] of [
      [q.financialSourceId, q.financialSourcePayloadHash],
      [q.gcuSourceId, q.gcuSourcePayloadHash],
    ]) {
      if (
        b.sourceMetadata.filter(
          (s) => s.sourceId === sourceId && s.payloadHash === payloadHash,
        ).length !== 1
      )
        invalid('historical quote differs from genuine H0 source hashes');
    }
    const asset = (owner: string) =>
      one(
        b.financialAccounts.filter(
          (a) =>
            a.worldId === q.worldId &&
            a.countryId === q.countryId &&
            a.ownerId === owner &&
            a.counterpartyEntityId === q.centralBankEntityId &&
            a.currency === q.localCurrency &&
            a.accountClass === 'ASSET' &&
            a.claimId !== null,
        ),
      );
    const mirror = (a: FinancialAccount) =>
      one(
        b.financialAccounts.filter(
          (m) =>
            m.worldId === a.worldId &&
            m.countryId === a.countryId &&
            m.ownerId === q.centralBankEntityId &&
            m.counterpartyEntityId === a.ownerId &&
            m.claimId === a.claimId &&
            m.currency === a.currency &&
            m.accountClass === 'LIABILITY',
        ),
      );
    const treasuryAsset = asset(q.governmentEntityId),
      bankSettlementAsset = asset(q.bankEntityId);
    const bankGcuAsset = one(
      b.financialAccounts.filter(
        (a) =>
          a.accountId === q.dealerGcuAccountId &&
          a.countryId === q.countryId &&
          a.ownerId === q.bankEntityId &&
          a.currency === 'GCU' &&
          a.accountClass === 'CASH',
      ),
    );
    const found = originals.find((o) => o.quote.countryId === q.countryId);
    if (found) {
      if (found.quote.quoteSha256 !== q.quoteSha256)
        invalid('immutable country quote changed within complete prefix');
    } else
      originals.push({
        quote: q,
        treasuryAsset,
        treasuryLiability: mirror(treasuryAsset),
        bankSettlementAsset,
        bankSettlementLiability: mirror(bankSettlementAsset),
        bankGcuAsset,
      });
  }
  if (
    input.captainCountryId !== undefined &&
    input.captainCountryId !== input.hostCountryId
  )
    invalid('EXACT_CAPTAIN_CURRENT_HOST_REQUIRED');
  const scope = {
    worldId: input.worldId,
    hostCountryId: input.hostCountryId,
    officeId: input.officeId,
    seedFingerprint: input.seedFingerprint,
    admissionRef: input.admissionRef,
    expectedHead: input.expectedHead,
    frames: input.frames,
  };
  const pagedScope =
    input.pageBoundary === undefined
      ? undefined
      : ({
          ...scope,
          ...input.pageBoundary,
          sourceMetadata: b.sourceMetadata,
          mode: input.omoOriginalMode ?? 'OFFICIAL_RUNTIME',
        } as const);
  const pagedCaptain =
    pagedScope !== undefined &&
    (input.captainCountryId !== undefined ||
      input.frames.some(
        (f) =>
          f.command.commandType === 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
      ))
      ? await readPostwarPagedCaptainHistoryOriginalsFrom(
          input.executor,
          pagedScope,
        )
      : undefined;
  const current =
    input.captainCountryId === undefined
      ? null
      : pagedCaptain !== undefined
        ? {
            status: pagedCaptain.captainOriginalStatus,
            captainCountries: pagedCaptain.captainCountries,
          }
        : await readPostwarCaptainCurrentOriginalsFrom(input.executor, scope);
  if (current?.status === 'REVOKED') invalid('CAPTAIN_CURRENT_SOURCE_REVOKED');
  if (
    current?.status === 'NO_REGISTERED_CAPTAIN_ORIGINAL' &&
    (input.requireCaptain !== false ||
      input.frames.some(
        (f) =>
          f.command.countryId === input.hostCountryId &&
          f.command.commandType === 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
      ))
  )
    invalid('CAPTAIN_CURRENT_REGISTERED_GENESIS_REQUIRED');
  const selected =
    pagedCaptain?.captainCountries ??
    current?.captainCountries ??
    (input.frames.some(
      (f) => f.command.commandType === 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
    )
      ? await readPostwarCaptainHistoryOriginalsFrom(input.executor, scope)
      : undefined);
  const captainCountries = selected?.length ? selected : undefined;
  const hasOmo = input.frames.some(
    (f) => f.command.commandType === CENTRAL_BANK_OMO_COMMAND,
  );
  const omoHistory =
    hasOmo && pagedScope === undefined
      ? await readCentralBankOmoCommittedOriginalsFrom(input.executor, {
          ...scope,
          mode: input.omoOriginalMode ?? 'OFFICIAL_RUNTIME',
        })
      : undefined;
  const omoOriginals =
    hasOmo && pagedScope !== undefined
      ? await readPostwarPagedOmoHistoryOriginalsFrom(
          input.executor,
          pagedScope,
        )
      : omoHistory?.countries.map((c) => ({
          ...c.original,
          quotes: c.quotes.map((q) => q.quote),
        }));
  const beneficialHousingRentReceipts =
    readPostwarBeneficialHousingRentMixedOriginalsForSocialBase(input.baseline);
  const logistics = await readPostwarIndustryLogisticsPageOriginalsFrom(
    input.executor,
    {
      baseline: input.baseline,
      worldId: input.worldId,
      hostCountryId: input.hostCountryId,
      officeId: input.officeId,
      expectedHead: input.expectedHead,
      frames: input.frames,
    },
  );
  const utilities = await readPostwarIndustryUtilityPageOriginalsFrom(
    input.executor,
    {
      baseline: input.baseline,
      worldId: input.worldId,
      officeId: input.officeId,
      expectedHead: input.expectedHead,
      frames: input.frames,
    },
  );
  const industry = await readPostwarIndustryRunPageOriginalsFrom(
    input.executor,
    {
      baseline: input.baseline,
      worldId: input.worldId,
      hostCountryId: input.hostCountryId,
      officeId: input.officeId,
      expectedHead: input.expectedHead,
      frames: input.frames,
    },
  );
  const wage = await readPostwarIndustryOperatingWagePageOriginalsFrom(
    input.executor,
    {
      baseline: input.baseline,
      worldId: input.worldId,
      hostCountryId: input.hostCountryId,
      officeId: input.officeId,
      expectedHead: input.expectedHead,
      frames: input.frames,
    },
  );
  for (const original of omoOriginals ?? []) {
    const q = original.valuationQuote;
    if (
      q !== undefined &&
      [
        [q.financialSourceId, q.financialSourcePayloadHash],
        [q.gcuSourceId, q.gcuSourcePayloadHash],
      ].some(
        ([sourceId, payloadHash]) =>
          b.sourceMetadata.filter(
            (s) => s.sourceId === sourceId && s.payloadHash === payloadHash,
          ).length !== 1,
      )
    )
      invalid('historical OMO valuation differs from genuine H0 source hashes');
  }
  return Object.freeze({
    fxOriginals: originals,
    ...(logistics.industryLogisticsSources.length
      ? { industryLogisticsSources: logistics.industryLogisticsSources }
      : {}),
    ...(utilities.industryPowerOriginals.length
      ? { industryPowerOriginals: utilities.industryPowerOriginals }
      : {}),
    ...(utilities.industryWaterOriginals.length
      ? { industryWaterOriginals: utilities.industryWaterOriginals }
      : {}),
    ...(industry.industryWorkSources.length === 0
      ? {}
      : { industryWorkSources: industry.industryWorkSources }),
    ...(wage.industryWageSources.length === 0
      ? {}
      : { industryWageSources: wage.industryWageSources }),
    ...(captainCountries === undefined ? {} : { captainCountries }),
    ...(omoOriginals === undefined
      ? {}
      : {
          omoOriginals,
        }),
    ...(beneficialHousingRentReceipts === undefined
      ? {}
      : { beneficialHousingRentReceipts }),
    ...(current === null ? {} : { captainOriginalStatus: current.status }),
  });
}
/** Legacy bounded complete-prefix entry remains compatible. The paged source
 * consumes the same fixed originals above with the Core private continuation. */
export async function replayPreparedPostwarFinanceSocialFxFrom(
  input: PreparedPostwarFinanceSocialFxReplayRequest,
): Promise<
  PreparedFinanceSocialFxReplayResult & {
    readonly captainOriginalStatus?: PostwarCaptainOriginalStatus;
  }
> {
  const b = consumePreparedPostwarSocialFinancialReplayBase(input.baseline),
    facts = await readPreparedPostwarFinanceSocialFxPageOriginalsFrom(input),
    result = replayPreparedFinanceSocialFxLedger({
      prepared: b.prepared,
      frames: input.frames,
      socialCountries: b.document.countries.map((c) => ({
        countryId: c.countryId,
        state: c.state,
        offers: c.offers,
      })),
      openingEncumbrances: projectPostwarOpeningFinancialEncumbrances(
        b.funding,
      ),
      fxOriginals: facts.fxOriginals,
      socialCreationOriginals: readPostwarSocialServiceCreationOriginalsForBase(
        input.baseline,
      ),
      ...(facts.industryLogisticsSources === undefined
        ? {}
        : { industryLogisticsSources: facts.industryLogisticsSources }),
      ...(facts.industryPowerOriginals === undefined
        ? {}
        : { industryPowerOriginals: facts.industryPowerOriginals }),
      ...(facts.industryWaterOriginals === undefined
        ? {}
        : { industryWaterOriginals: facts.industryWaterOriginals }),
      ...(facts.industryWorkSources === undefined
        ? {}
        : { industryWorkSources: facts.industryWorkSources }),
      ...(facts.industryWageSources === undefined
        ? {}
        : { industryWageSources: facts.industryWageSources }),
      ...(facts.captainCountries === undefined
        ? {}
        : { captainCountries: facts.captainCountries }),
      ...(facts.omoOriginals === undefined
        ? {}
        : { omoOriginals: facts.omoOriginals }),
      ...(facts.beneficialHousingRentReceipts === undefined
        ? {}
        : {
            beneficialHousingRentReceipts: facts.beneficialHousingRentReceipts,
          }),
      expectedHead: input.expectedHead,
      sha256Hex: sha,
    });
  return facts.captainOriginalStatus === undefined
    ? result
    : Object.freeze({
        ...result,
        captainOriginalStatus: facts.captainOriginalStatus,
      });
}
