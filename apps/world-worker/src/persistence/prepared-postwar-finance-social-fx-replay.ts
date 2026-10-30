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
export async function replayPreparedPostwarFinanceSocialFxFrom(input: {
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
  readonly expectedHead: Readonly<{
    worldVersion: string;
    eventSequence: string;
  }>;
}): Promise<
  PreparedFinanceSocialFxReplayResult & {
    readonly captainOriginalStatus?: PostwarCaptainOriginalStatus;
  }
> {
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
  const current =
    input.captainCountryId === undefined
      ? null
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
    current?.captainCountries ??
    (input.frames.some(
      (f) => f.command.commandType === 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
    )
      ? await readPostwarCaptainHistoryOriginalsFrom(input.executor, scope)
      : undefined);
  const captainCountries = selected?.length ? selected : undefined;
  const omoHistory = input.frames.some(
    (f) => f.command.commandType === CENTRAL_BANK_OMO_COMMAND,
  )
    ? await readCentralBankOmoCommittedOriginalsFrom(input.executor, {
        ...scope,
        mode: input.omoOriginalMode ?? 'OFFICIAL_RUNTIME',
      })
    : undefined;
  const beneficialHousingRentReceipts =
    readPostwarBeneficialHousingRentMixedOriginalsForSocialBase(input.baseline);
  const result = replayPreparedFinanceSocialFxLedger({
    prepared: b.prepared,
    frames: input.frames,
    socialCountries: b.document.countries.map((c) => ({
      countryId: c.countryId,
      state: c.state,
      offers: c.offers,
    })),
    openingEncumbrances: projectPostwarOpeningFinancialEncumbrances(b.funding),
    fxOriginals: originals,
    ...(captainCountries === undefined ? {} : { captainCountries }),
    ...(omoHistory === undefined
      ? {}
      : {
          omoOriginals: omoHistory.countries.map((c) => ({
            ...c.original,
            quotes: c.quotes.map((q) => q.quote),
          })),
        }),
    ...(beneficialHousingRentReceipts === undefined
      ? {}
      : { beneficialHousingRentReceipts }),
    expectedHead: input.expectedHead,
    sha256Hex: sha,
  });
  return current
    ? Object.freeze({ ...result, captainOriginalStatus: current.status })
    : result;
}
