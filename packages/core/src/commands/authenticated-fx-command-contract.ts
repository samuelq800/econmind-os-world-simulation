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
