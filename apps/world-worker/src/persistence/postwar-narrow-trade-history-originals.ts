/** Immutable historical DATA for the fixed Trade source transaction. The full
 * prefix stays intact for Core replay; these originals grant no current Office
 * capability, route, mandate, cash, source admission or commit authority. */
import {
  CENTRAL_BANK_OMO_COMMAND,
  BENEFICIAL_HOUSING_RENT_COMMAND,
} from '@econmind/core';
import type { FinanceNativeBudgetCanonicalFrame } from '@econmind/core/finance-budget-native';
import type { SqlExecutor } from './sql-database.js';
import {
  consumePreparedPostwarSocialFinancialReplayBase,
  type PreparedPostwarSocialFinancialReplayBase,
} from './prepared-postwar-social-source.js';
import { readPostwarCaptainHistoryOriginalsFrom } from './postwar-captain-history-originals.js';
import { readCentralBankOmoMixedReplayOriginalsFrom } from './postgres-central-bank-omo-history.js';
import { readPostwarBeneficialHousingRentMixedOriginalsForSocialBase } from './postwar-beneficial-housing-rent-mixed-source.js';

export async function readPostwarNarrowTradeHistoryOriginalsFrom(
  tx: SqlExecutor,
  input: {
    readonly baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>;
    readonly mode: 'OFFICIAL_RUNTIME' | 'TEST_ONLY_LOCAL';
    readonly worldId: string;
    readonly hostCountryId: string;
    readonly frames: readonly FinanceNativeBudgetCanonicalFrame[];
    readonly expectedHead: Readonly<{
      worldVersion: string;
      eventSequence: string;
    }>;
  },
) {
  const b = consumePreparedPostwarSocialFinancialReplayBase(input.baseline);
  if (
    b.pins.worldId !== input.worldId ||
    input.frames.length > 256 ||
    input.frames.some((f) => f.command.worldId !== input.worldId)
  )
    throw Error('TRADE_HISTORY:GENUINE_SAME_WORLD_BOUNDED_PREFIX_REQUIRED');
  const scope = {
    worldId: input.worldId,
    hostCountryId: input.hostCountryId,
    officeId: 'TRADE' as const,
    seedFingerprint: b.pins.contentHash,
    admissionRef: b.pins.admissionRef,
    expectedHead: input.expectedHead,
    frames: input.frames,
  };
  const captainCountries = input.frames.some(
    (f) => f.command.commandType === 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
  )
    ? await readPostwarCaptainHistoryOriginalsFrom(tx, scope)
    : undefined;
  const omoOriginals = input.frames.some(
    (f) => f.command.commandType === CENTRAL_BANK_OMO_COMMAND,
  )
    ? await readCentralBankOmoMixedReplayOriginalsFrom(tx, {
        ...scope,
        mode: input.mode,
        frames: input.frames,
        sourceMetadata: b.sourceMetadata,
      })
    : undefined;
  const beneficialHousingRentReceipts =
    readPostwarBeneficialHousingRentMixedOriginalsForSocialBase(input.baseline);
  if (
    input.frames.some(
      (f) => f.command.commandType === BENEFICIAL_HOUSING_RENT_COMMAND,
    ) &&
    !beneficialHousingRentReceipts?.length
  )
    throw Error('TRADE_HISTORY:GENUINE_RENT_CHILD_ORIGINALS_REQUIRED');
  return Object.freeze({
    ...(captainCountries === undefined ? {} : { captainCountries }),
    ...(omoOriginals === undefined ? {} : { omoOriginals }),
    ...(beneficialHousingRentReceipts === undefined
      ? {}
      : { beneficialHousingRentReceipts }),
  });
}
