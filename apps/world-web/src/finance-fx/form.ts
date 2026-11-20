/** One explicitly reviewed first-day Treasury conversion. Registered quote
 * references and the current Treasury claim come from authorized reads; no
 * local rate, account, balance, fill, bank mandate or settlement is invented. */
import {
  POSTWAR_DAY_ONE_FX_QUOTES_DATASET,
  POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND,
  POSTWAR_DAY_ONE_TREASURY_FX_PAYLOAD_SCHEMA,
  parsePostwarDayOneFxQuoteRow,
} from '@econmind/core/postwar-day-one-fx-command-contract';
import { parsePostwarMixedFinancialBalanceRow } from '@econmind/core/postwar-financial-mixed-current-contract';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  type AuthenticatedOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';
import type { RuntimePage } from '../postwar-office-runtime/client.js';
import { sameAuthorizedIdentity } from '../prototype/authorized-read-adapter.js';
export interface TreasuryFxDraft {
  readonly quoteRef: string;
  readonly payerTreasuryAccountId: string;
  readonly localAmount: string;
}
export function treasuryFxOptions(quotes: RuntimePage, ledger: RuntimePage) {
  if (
    quotes.dataset !== POSTWAR_DAY_ONE_FX_QUOTES_DATASET ||
    ledger.dataset !== 'ledger-balances' ||
    quotes.authority.identity.officeId !== 'FINANCE' ||
    ledger.authority.identity.officeId !== 'FINANCE' ||
    !sameAuthorizedIdentity(
      quotes.authority.identity,
      ledger.authority.identity,
    ) ||
    quotes.authority.seatRef !== ledger.authority.seatRef ||
    quotes.authority.seed.seedRef !== ledger.authority.seed.seedRef ||
    quotes.authority.seed.contentHash !== ledger.authority.seed.contentHash ||
    quotes.authority.seed.admissionRef !== ledger.authority.seed.admissionRef ||
    quotes.authority.readback.worldVersion !==
      ledger.authority.readback.worldVersion ||
    quotes.authority.readback.eventSequence !==
      ledger.authority.readback.eventSequence ||
    quotes.page.total !== 1 ||
    quotes.rows.length !== 1
  )
    throw Error('FIRST_DAY_FX_SAME_CURRENT_SCOPE_REQUIRED');
  const quote = parsePostwarDayOneFxQuoteRow(quotes.rows[0]);
  if (quote.countryId !== ledger.authority.identity.countryId)
    throw Error('FIRST_DAY_FX_QUOTE_COUNTRY_REQUIRED');
  const treasuries = ledger.rows
    .map((r) =>
      parsePostwarMixedFinancialBalanceRow(r, {
        countryId: quote.countryId,
        officeId: 'FINANCE',
      }),
    )
    .filter(
      (r) =>
        r.countryId === quote.countryId &&
        r.ownerKind === 'GOV' &&
        r.ownerEntityId === quote.governmentEntityId &&
        r.currency === quote.localCurrency &&
        r.accountClass === 'ASSET' &&
        r.counterpartyEntityId === quote.centralBankEntityId &&
        r.claimId !== null &&
        r.balanceNature === 'RECIPROCAL_LEDGER_CLAIM',
    );
  return { quote, treasuries };
}
export function buildTreasuryFxRequest(input: {
  readonly quotes: RuntimePage;
  readonly ledger: RuntimePage;
  readonly draft: TreasuryFxDraft;
  readonly requestId: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
}): AuthenticatedOfficeCommandRequestDto {
  const { quote, treasuries } = treasuryFxOptions(input.quotes, input.ledger),
    d = input.draft;
  if (
    quote.quoteRef !== d.quoteRef ||
    treasuries.filter((r) => r.accountId === d.payerTreasuryAccountId)
      .length !== 1 ||
    d.localAmount.length > 128 ||
    !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,24})?$/u.test(d.localAmount) ||
    /^0(?:\.0+)?$/u.test(d.localAmount)
  )
    throw Error('FIRST_DAY_FX_REGISTERED_SELECTION_AND_POSITIVE_LC_REQUIRED');
  return {
    schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
    requestId: input.requestId,
    request: {
      worldId: input.ledger.authority.identity.worldId,
      countryId: quote.countryId,
      officeId: 'FINANCE',
      commandType: POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND,
      commandId: input.commandId,
      idempotencyKey: input.idempotencyKey,
      expectedWorldVersion: input.ledger.authority.readback.worldVersion,
      payload: {
        schemaVersion: POSTWAR_DAY_ONE_TREASURY_FX_PAYLOAD_SCHEMA,
        quoteRef: quote.quoteRef,
        payerTreasuryAccountId: d.payerTreasuryAccountId,
        payerGcuAccountId: quote.payerGcuAccountId,
        dealerGcuAccountId: quote.dealerGcuAccountId,
        localAmount: d.localAmount,
        localCurrency: quote.localCurrency,
        expectedQuoteSha256: quote.quoteSha256,
      },
    },
  };
}
export function renderTreasuryFxForm(
  document: Document,
  input: {
    readonly quotes: RuntimePage | null;
    readonly ledger: RuntimePage | null;
    readonly code: string | null;
    readonly enabled: boolean;
    readonly stage: (draft: TreasuryFxDraft) => boolean;
  },
) {
  const section = document.createElement('section');
  section.dataset.treasuryFxForm = '';
  const text = (tag: string, value: string) => {
    const e = document.createElement(tag);
    e.textContent = value;
    return e;
  };
  section.append(
    text('h3', '首日换汇 · 国库向本国私人银行换取 GCU'),
    text(
      'p',
      '仅使用已登记首日报价与当前国库债权账户。报价不代表余额或成交；实际可用资金、银行授权和模拟日期由服务器复核。此入口不执行官方储备干预，也不代表目录付款/外汇审批已接通。',
    ),
  );
  if (!input.quotes || !input.ledger) {
    section.append(
      text(
        'p',
        '报价或当前账本不可用：' +
          (input.code ?? '尚未读取') +
          '。未知值不按零处理。',
      ),
    );
    return section;
  }
  try {
    const { quote, treasuries } = treasuryFxOptions(input.quotes, input.ledger);
    section.append(
      text(
        'p',
        `${quote.quoteRef} · 1 GCU = ${quote.localCurrencyPerGcu} ${quote.localCurrency} · 点差 ${quote.spreadBps} bps · 有效模拟时段 [${quote.validFromSimTime}, ${quote.validUntilSimTime})`,
      ),
    );
    if (!treasuries.length) {
      section.append(
        text(
          'p',
          '本页没有与报价匹配的国库债权账户。请读取下一账本页；不生成账户或使用央行储备。',
        ),
      );
      return section;
    }
    const account = document.createElement('select');
    account.setAttribute('aria-label', '首日换汇国库账户');
    account.dataset.treasuryFxField = 'payerTreasuryAccountId';
    account.disabled = !input.enabled;
    for (const r of treasuries) {
      const option = document.createElement('option');
      option.value = r.accountId;
      option.textContent = r.accountId;
      account.append(option);
    }
    account.value = treasuries[0]!.accountId;
    const amount = document.createElement('input');
    amount.type = 'text';
    amount.inputMode = 'decimal';
    amount.setAttribute('aria-label', `最多支出 ${quote.localCurrency}`);
    amount.dataset.treasuryFxField = 'localAmount';
    amount.disabled = !input.enabled;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '准备首日换汇意图';
    button.dataset.treasuryFxAction = 'stage';
    button.disabled = !input.enabled;
    button.addEventListener('click', () => {
      input.stage({
        quoteRef: quote.quoteRef,
        payerTreasuryAccountId: account.value,
        localAmount: amount.value,
      });
    });
    section.append(
      account,
      amount,
      button,
      text(
        'p',
        '输入本币最高支出；实际GCU成交量与未用本币以持久FINAL及授权账本为准。准备后仍需审阅和明确确认。',
      ),
    );
  } catch {
    section.append(
      text('p', '报价与当前授权账本范围或版本不一致，不能准备换汇。'),
    );
  }
  return section;
}
