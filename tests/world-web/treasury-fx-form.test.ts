/** Actual shipped client/controller/form with TEST_ONLY wire and DOM. No
 * quote publication, monetary execution, DB or browser acceptance is claimed. */
import { describe, expect, it } from 'vitest';
import {
  buildTreasuryFxRequest,
  renderTreasuryFxForm,
} from '../../apps/world-web/src/finance-fx/form.js';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import { officeProjectionFixture } from './office-projection-fixture.js';
import { HostDocument } from './trusted-host-dom.js';
import { POSTWAR_RUNTIME_SCHEMA } from '../../apps/world-web/src/postwar-office-runtime/client.js';
const fp = 'sha256:' + 'a'.repeat(64),
  raw = 'b'.repeat(64),
  requestId = '11111111-1111-4111-8111-111111111111';
function fixture() {
  const base = officeProjectionFixture('finance'),
    identity = {
      ...base.config.identity,
      countryId: 'COUNTRY_02',
      projectionVersion: POSTWAR_RUNTIME_SCHEMA,
    };
  const read = {
    ...base.config,
    identity,
    currentIdentity: () => (base.config.session.isCurrent() ? identity : null),
    endpoints: {
      ...base.config.endpoints,
      projectionPath: '/v1/postwar-office-runtime',
    },
  };
  const binding = {
    read,
    view: { role: 'finance' as const, countryDisplayId: '02' },
    endpoint: {
      origin: read.endpoints.origin,
      path: '/v1/office-command' as const,
      deploymentRef: read.endpoints.deploymentRef,
    },
  };
  let head = '7',
    missing = false,
    foreign = false,
    unknown = true;
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const quote = {
    schemaVersion: 'postwar-day-one-fx-quote-row-v1',
    countryId: identity.countryId,
    quoteRef: 'QUOTE_TEST_ONLY',
    quoteSha256: raw,
    localCurrency: 'XBB',
    localCurrencyPerGcu: '2',
    governmentEntityId: 'GOV_TEST_ONLY',
    centralBankEntityId: 'CB_TEST_ONLY',
    bankEntityId: 'BANK_TEST_ONLY',
    dealerGcuAccountId: 'DEALER_TEST_ONLY',
    payerGcuAccountId: 'ACCOUNT_DAY_ONE_GOV_GCU_TEST_ONLY',
    validFromSimTime: '0',
    validUntilSimTime: '86400000',
    spreadBps: '0',
    measurement: 'REGISTERED_FIRST_DAY_QUOTE_NOT_FUNDS_OR_EXECUTION',
  };
  const fetcher: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname,
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ path, body });
    if (path === '/v1/postwar-office-runtime') {
      const isQuote = body.dataset === 'day-one-fx-quotes';
      if (isQuote && missing)
        return Response.json(
          {
            schemaVersion: POSTWAR_RUNTIME_SCHEMA,
            requestId: body.requestId,
            ok: false,
            error: { code: 'DAY_ONE_FX_QUOTES_UNAVAILABLE', retryable: false },
          },
          { status: 503 },
        );
      const seed = {
        worldId: read.world.worldId,
        seedRef: read.world.seedRef,
        contentHash: read.world.contentHash,
        admissionRef: read.world.admissionRef,
      };
      return Response.json({
        schemaVersion: POSTWAR_RUNTIME_SCHEMA,
        requestId: body.requestId,
        ok: true,
        status: 'AVAILABLE',
        dataset: body.dataset,
        authority: {
          source: 'SERVER_VERIFIED_READ_BINDING',
          capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
          identity,
          seatRef: read.seatRef,
          seatState: 'ACTIVE',
          seed,
          readback: {
            ...seed,
            worldVersion: head,
            eventSequence: head,
            readbackRef: 'READBACK_TEST_ONLY',
          },
        },
        source: {
          ...identity,
          ...seed,
          worldVersion: isQuote ? '0' : head,
          eventSequence: isQuote ? '0' : head,
          originWorldVersion: '0',
          originEventSequence: '0',
          observedHead: { worldVersion: head, eventSequence: head },
          dataNature: isQuote
            ? 'ADMITTED_IMMUTABLE_OPENING_FACTS'
            : 'ADMITTED_CURRENT_FINANCIAL_MIXED_POSTING_PREFIX',
          sourceVersion: fp,
          bindingVersion: fp,
          sourceRevision: 'TEST_ONLY',
          pageHash: raw,
          returnedRowsHash: raw,
          hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
          sourcePointer: isQuote
            ? {
                rowOrigin:
                  'world_v2.postwar_day_one_fx_quote_original.quote_text',
                rowBinding: 'quoteRef+quoteSha256',
              }
            : { rowOrigin: 'TEST_ONLY' },
          ...(!isQuote
            ? {
                currentFinancialCoverage: {
                  schemaVersion: 'postwar-financial-current-prefix-coverage-v2',
                  reducerVersion:
                    'POSTWAR_FINANCIAL_SOCIAL_FX_COMPLETE_PREFIX_V2',
                  countryId: identity.countryId,
                  coverageRef: 'COVERAGE_TEST_ONLY',
                  prefixFingerprint: fp,
                  knownEffectsFingerprint: fp,
                  globalWorldVersion: head,
                  globalEventSequence: head,
                  coveredThroughEventId: 'EVENT_TEST_ONLY',
                  coveredThroughEventFingerprint: fp,
                  financialPostingCount: head === '8' ? '6' : '0',
                  financialBatchCount: head === '8' ? '1' : '0',
                  financialPostingsFingerprint: fp,
                },
              }
            : {}),
        },
        page: { offset: 0, limit: 25, returned: 1, total: 1, nextOffset: null },
        rows: isQuote
          ? [
              {
                ...quote,
                countryId: foreign ? 'COUNTRY_01' : identity.countryId,
              },
            ]
          : [
              {
                schemaVersion: 'postwar-current-financial-balance-row-v2',
                countryId: identity.countryId,
                accountId: 'TREASURY_TEST_ONLY',
                ownerEntityId: 'GOV_TEST_ONLY',
                ownerKind: 'GOV',
                currency: 'XBB',
                accountClass: 'ASSET',
                claimId: 'CLAIM_TEST_ONLY',
                counterpartyEntityId: 'CB_TEST_ONLY',
                netDebitBalance: head === '8' ? '98' : '100',
                balanceNature: 'RECIPROCAL_LEDGER_CLAIM',
              },
            ],
      });
    }
    if (path === '/v1/office-command') {
      if (unknown) throw Error('TEST_ONLY_RESPONSE_LOST');
      throw Error('TEST_MUST_NOT_RESUBMIT');
    }
    if (path === '/v1/command-recovery') {
      const r = (
        body.request as {
          originalRequest: {
            request: {
              commandId: string;
              commandType: string;
              idempotencyKey: string;
            };
          };
        }
      ).originalRequest.request;
      head = '8';
      return Response.json({
        schemaVersion: body.schemaVersion,
        requestId: body.requestId,
        ok: true,
        state: {
          status: 'FINAL',
          commandType: r.commandType,
          receipt: {
            source: 'DURABLE_FINAL_COMMAND_RECEIPT',
            schemaVersion: 'command-receipt-v2',
            worldId: identity.worldId,
            commandId: r.commandId,
            idempotencyKey: r.idempotencyKey,
            commandFingerprint: fp,
            outcome: 'COMMITTED',
            reasonCode: null,
            transitionId: 'TRANSITION_TEST_ONLY',
            worldVersionBefore: '7',
            worldVersionAfter: '8',
            simTime: '20',
            eventIds: ['EVENT_TEST_ONLY'],
            recordedAtReal: '2026-11-16T00:00:00.000Z',
          },
        },
      });
    }
    throw Error('UNEXPECTED_TEST_ROUTE');
  };
  const create = () =>
    createOfficeCommandController(binding, () => binding.view, {
      fetcher,
      requestId: () => requestId,
    });
  return {
    create,
    binding,
    calls,
    quote,
    setMissing() {
      missing = true;
    },
    setForeign() {
      foreign = true;
    },
    setKnown() {
      unknown = false;
    },
    invalidate: base.invalidate,
  };
}
const draft = {
  quoteRef: 'QUOTE_TEST_ONLY',
  payerTreasuryAccountId: 'TREASURY_TEST_ONLY',
  localAmount: '2',
};
describe('explicit registered first-day Treasury FX form', () => {
  it('uses exact quote/account/hash references, not rates or balances as command authority', async () => {
    const f = fixture(),
      c = f.create();
    try {
      await c.refresh();
      expect(c.getState().status).toBe('CURRENT_AUTHORIZED_HEAD');
      expect(c.stageTreasuryFx(draft)).toBe(true);
      expect(c.getState().intent?.request).toMatchObject({
        officeId: 'FINANCE',
        expectedWorldVersion: '7',
        commandType: 'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1',
        payload: {
          schemaVersion: 'postwar-day-one-treasury-fx-command-v1',
          quoteRef: f.quote.quoteRef,
          expectedQuoteSha256: raw,
          payerTreasuryAccountId: 'TREASURY_TEST_ONLY',
          payerGcuAccountId: f.quote.payerGcuAccountId,
          dealerGcuAccountId: f.quote.dealerGcuAccountId,
          localAmount: '2',
          localCurrency: 'XBB',
        },
      });
      expect(c.getState().intent?.request.payload).not.toHaveProperty(
        'localCurrencyPerGcu',
      );
      expect(
        f.calls.filter((x) => x.path === '/v1/office-command'),
      ).toHaveLength(0);
      const state = c.getState(),
        doc = new HostDocument('finance');
      let selected: unknown;
      const view = renderTreasuryFxForm(doc as unknown as Document, {
        quotes: state.fxQuotesPage,
        ledger: state.runtimePage,
        code: null,
        enabled: true,
        stage: (d) => {
          selected = d;
          return true;
        },
      }) as unknown as import('./trusted-host-dom.js').HostElement;
      expect(view.textContent).toContain('首日换汇');
      expect(view.textContent).toContain('不代表目录付款/外汇审批已接通');
      const amount = view
        .all()
        .find(
          (x) => x.dataset.treasuryFxField === 'localAmount',
        )! as unknown as { value: string };
      amount.value = '3.5';
      view
        .all()
        .find((x) => x.dataset.treasuryFxAction === 'stage')!
        .click();
      expect(selected).toEqual({ ...draft, localAmount: '3.5' });
    } finally {
      c.disconnect();
    }
  });
  it('retains original UNKNOWN and restores only FINAL after reload; does not resubmit on refresh', async () => {
    const f = fixture(),
      first = f.create();
    await first.refresh();
    expect(first.stageTreasuryFx(draft)).toBe(true);
    const original = first.getState().intent!;
    expect(first.review()).toBe(true);
    await first.confirm();
    expect(first.getState().status).toBe('UNKNOWN');
    await first.refresh();
    expect(first.getState().intent).toEqual(original);
    expect(first.getState().canConfirm).toBe(false);
    first.disconnect();
    const fresh = f.create();
    try {
      expect(fresh.restoreOriginalForRecovery(original)).toBe(true);
      await fresh.recoverOriginal();
      expect(fresh.getState()).toMatchObject({
        status: 'FINAL_VERIFIED',
        canStage: false,
        canConfirm: false,
      });
      expect(fresh.getState().runtimePage?.rows[0]?.netDebitBalance).toBe('98');
      f.setKnown();
      await fresh.confirm();
      expect(
        f.calls.filter((x) => x.path === '/v1/office-command'),
      ).toHaveLength(1);
      f.invalidate();
      expect(fresh.getState().fxQuotesPage).toBeNull();
    } finally {
      fresh.disconnect();
    }
  });
  it.each(['missing', 'foreign'] as const)(
    'keeps %s quote unavailable without using the baseline FX rate',
    async (mode) => {
      const f = fixture();
      if (mode === 'missing') f.setMissing();
      else f.setForeign();
      const c = f.create();
      try {
        await c.refresh();
        expect(c.getState().fxQuotesPage).toBeNull();
        expect(c.stageTreasuryFx(draft)).toBe(false);
        await c.confirm();
        expect(
          f.calls.filter((x) => x.path === '/v1/office-command'),
        ).toHaveLength(0);
        if (mode === 'missing')
          expect(c.getState().fxQuotesCode).toBe(
            'DAY_ONE_FX_QUOTES_UNAVAILABLE',
          );
      } finally {
        c.disconnect();
      }
    },
  );
  it('rejects changed account, zero/oversize amounts, and mismatched page head', async () => {
    const f = fixture(),
      c = f.create();
    try {
      await c.refresh();
      const s = c.getState();
      const build = (change: Partial<typeof draft>, quotes = s.fxQuotesPage!) =>
        buildTreasuryFxRequest({
          quotes,
          ledger: s.runtimePage!,
          draft: { ...draft, ...change },
          requestId,
          commandId: 'TEST_COMMAND',
          idempotencyKey: 'TEST_KEY',
        });
      expect(() => build({ payerTreasuryAccountId: 'CB_TEST_ONLY' })).toThrow();
      expect(() => build({ localAmount: '0' })).toThrow();
      expect(() => build({ localAmount: '9'.repeat(129) })).toThrow();
      const stale = structuredClone(s.fxQuotesPage!);
      Object.assign(stale.authority.readback, { worldVersion: '6' });
      expect(() => build({}, stale)).toThrow();
    } finally {
      c.disconnect();
    }
  });
});
