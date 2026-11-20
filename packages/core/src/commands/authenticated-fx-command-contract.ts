/** Browser-safe Treasury FX intent only. Parsing this DTO grants neither
 * Treasury authority, a quote, funds, a bank mandate nor permission to queue.
 * Private OP accounts are outside this government-only command family. */
export const POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND =
  'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1' as const;
export const POSTWAR_DAY_ONE_TREASURY_FX_PAYLOAD_SCHEMA =
  'postwar-day-one-treasury-fx-command-v1' as const;
export interface PostwarDayOneTreasuryFxPayload {
  readonly schemaVersion: typeof POSTWAR_DAY_ONE_TREASURY_FX_PAYLOAD_SCHEMA;
  readonly quoteRef: string;
  readonly payerTreasuryAccountId: string;
  readonly payerGcuAccountId: string;
  readonly dealerGcuAccountId: string;
  /** Maximum LC expenditure. The Core exact fill leaves any remainder in the
   * original Treasury account; this is not an instruction to debit all LC. */
  readonly localAmount: string;
  readonly localCurrency: string;
  /** Exact source quote bytes binding, checked by the server-owned source. */
  readonly expectedQuoteSha256: string;
}

/** Registered quote DATA, never a bank mandate, account balance or FX fill. */
export const POSTWAR_DAY_ONE_FX_QUOTES_DATASET = 'day-one-fx-quotes' as const;
export interface PostwarDayOneFxQuoteRow {
  readonly schemaVersion: 'postwar-day-one-fx-quote-row-v1';
  readonly countryId: string;
  readonly quoteRef: string;
  readonly quoteSha256: string;
  readonly localCurrency: string;
  readonly localCurrencyPerGcu: string;
  readonly governmentEntityId: string;
  readonly centralBankEntityId: string;
  readonly bankEntityId: string;
  readonly dealerGcuAccountId: string;
  /** Existing runtime's deterministic destination; not evidence of an account
   * balance, or an instruction to create it outside the actual FX commit. */
  readonly payerGcuAccountId: string;
  readonly validFromSimTime: '0';
  readonly validUntilSimTime: '86400000';
  readonly spreadBps: '0';
  readonly measurement: 'REGISTERED_FIRST_DAY_QUOTE_NOT_FUNDS_OR_EXECUTION';
}
export function parsePostwarDayOneFxQuoteRow(
  value: unknown,
): Readonly<PostwarDayOneFxQuoteRow> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('DAY_ONE_FX_QUOTE_ROW_REQUIRED');
  const r = value as Record<string, unknown>;
  const keys = [
    'schemaVersion',
    'countryId',
    'quoteRef',
    'quoteSha256',
    'localCurrency',
    'localCurrencyPerGcu',
    'governmentEntityId',
    'centralBankEntityId',
    'bankEntityId',
    'dealerGcuAccountId',
    'payerGcuAccountId',
    'validFromSimTime',
    'validUntilSimTime',
    'spreadBps',
    'measurement',
  ];
  if (
    Object.keys(r).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(r, k)) ||
    keys.some(
      (k) =>
        typeof r[k] !== 'string' ||
        String(r[k]).length > 256 ||
        String(r[k]).trim() !== r[k] ||
        r[k] === '',
    ) ||
    r.schemaVersion !== 'postwar-day-one-fx-quote-row-v1' ||
    r.measurement !== 'REGISTERED_FIRST_DAY_QUOTE_NOT_FUNDS_OR_EXECUTION' ||
    !/^COUNTRY_(?:0[1-9]|[1-6][0-9]|70)$/u.test(String(r.countryId)) ||
    !/^[a-f0-9]{64}$/u.test(String(r.quoteSha256)) ||
    !/^[A-Z]{3}$/u.test(String(r.localCurrency)) ||
    r.localCurrency === 'GCU' ||
    !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,24})?$/u.test(
      String(r.localCurrencyPerGcu),
    ) ||
    /^0(?:\.0+)?$/u.test(String(r.localCurrencyPerGcu)) ||
    r.validFromSimTime !== '0' ||
    r.validUntilSimTime !== '86400000' ||
    r.spreadBps !== '0' ||
    new Set([r.governmentEntityId, r.centralBankEntityId, r.bankEntityId])
      .size !== 3 ||
    r.dealerGcuAccountId === r.payerGcuAccountId
  )
    throw Error('DAY_ONE_FX_EXACT_REGISTERED_QUOTE_REQUIRED');
  return Object.freeze({
    ...r,
  }) as unknown as Readonly<PostwarDayOneFxQuoteRow>;
}
