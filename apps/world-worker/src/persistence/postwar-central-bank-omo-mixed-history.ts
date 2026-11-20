/** Immutable foreign-family history DATA for the fixed CB host. SQL validates
 * the current CB custody and exact committed originals; Core must still
 * replay every complete frame against the genuine H0 ledger. No actor/source
 * authority, financial ledger, valuation or state version is issued here. */
import {
  type FinancialAccount,
  type FinancialLedgerState,
} from '@econmind/core';
import { POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND } from '@econmind/core/authenticated-office-command-contract';
import { POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_EVENT } from '@econmind/core/postwar-day-one-treasury-fx';
import type {
  FinanceNativeBudgetCanonicalFrame,
  FinanceSocialFxOriginal,
} from '@econmind/core/finance-budget-native';
import { readPostwarDayOneFxCommittedQuoteForCentralBankFrom } from './postgres-postwar-day-one-fx-history-originals.js';
import { readPostwarCaptainHistoryOriginalsFrom } from './postwar-captain-history-originals.js';
import { invalidCentralBankOmoOriginal as invalid } from './postgres-central-bank-omo-originals.js';
import type { SqlExecutor } from './sql-database.js';
export async function readCentralBankOmoMixedHistoryFrom(
  tx: SqlExecutor,
  input: {
    readonly worldId: string;
    readonly countryId: string;
    readonly seedId: string;
    readonly seedFingerprint: string;
    readonly admissionRef: string;
    readonly expectedHead: {
      readonly worldVersion: string;
      readonly eventSequence: string;
    };
    readonly frames: readonly FinanceNativeBudgetCanonicalFrame[];
    readonly openingFinancial: FinancialLedgerState;
    readonly sourceMetadata: readonly {
      readonly sourceId: string;
      readonly payloadHash: string;
    }[];
  },
) {
  if (
    input.openingFinancial.worldId !== input.worldId ||
    input.openingFinancial.worldVersion !== '0' ||
    input.frames.length > 256
  )
    invalid('EXACT_OPENING_AND_BOUNDED_PREFIX_REQUIRED');
  const originals: FinanceSocialFxOriginal[] = [];
  const one = <T>(a: readonly T[]): T => {
    if (a.length !== 1) invalid('EXACT_FOREIGN_FINANCIAL_ACCOUNT_REQUIRED');
    return a[0]!;
  };
  const accounts = input.openingFinancial.accounts;
  for (const frame of input.frames) {
    if (frame.command.worldId !== input.worldId)
      invalid('SAME_WORLD_FULL_HISTORY_REQUIRED');
    if (frame.command.commandType !== POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND)
      continue;
    const event = frame.events[0];
    if (
      frame.events.length !== 1 ||
      !event ||
      event.eventType !== POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_EVENT
    )
      invalid('EXACT_COMMITTED_FX_EVENT_REQUIRED');
    const intent = JSON.parse(frame.command.canonicalPayload) as {
      quoteRef?: unknown;
      expectedQuoteSha256?: unknown;
    };
    if (
      typeof intent.quoteRef !== 'string' ||
      typeof intent.expectedQuoteSha256 !== 'string'
    )
      invalid('EXACT_FX_QUOTE_IDENTITY_REQUIRED');
    const original = await readPostwarDayOneFxCommittedQuoteForCentralBankFrom(
      tx,
      {
        worldId: input.worldId,
        hostCountryId: input.countryId,
        sourceCountryId: frame.command.countryId,
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
      original.trace.commandId !== frame.command.commandId ||
      original.trace.commandFingerprint !== frame.command.fingerprint ||
      original.trace.seedId !== input.seedId ||
      original.trace.worldVersion !== event.worldVersion ||
      original.trace.eventSequence !== event.sequence
    )
      invalid('ACTUAL_COMMITTED_FX_WITNESS_DIFFERS');
    const q = original.quote;
    for (const [sourceId, payloadHash] of [
      [q.financialSourceId, q.financialSourcePayloadHash],
      [q.gcuSourceId, q.gcuSourcePayloadHash],
    ])
      if (
        input.sourceMetadata.filter(
          (s) => s.sourceId === sourceId && s.payloadHash === payloadHash,
        ).length !== 1
      )
        invalid('EXACT_OPENING_FOREIGN_SOURCE_HASH_REQUIRED');
    const asset = (owner: string) =>
      one(
        accounts.filter(
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
        accounts.filter(
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
      bankSettlementAsset = asset(q.bankEntityId),
      bankGcuAsset = one(
        accounts.filter(
          (a) =>
            a.worldId === q.worldId &&
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
        invalid('IMMUTABLE_FOREIGN_QUOTE_CHANGED');
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
  const captainCountries = input.frames.some(
    (f) => f.command.commandType === 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
  )
    ? await readPostwarCaptainHistoryOriginalsFrom(tx, {
        worldId: input.worldId,
        hostCountryId: input.countryId,
        officeId: 'CB_OMO',
        seedFingerprint: input.seedFingerprint,
        admissionRef: input.admissionRef,
        expectedHead: input.expectedHead,
        frames: input.frames,
      })
    : undefined;
  // Selection only chooses required immutable originals. Unknown/effectful
  // commands remain in frames and must be rejected by complete Core replay.
  return {
    fxOriginals: originals,
    ...(captainCountries === undefined ? {} : { captainCountries }),
  };
}
