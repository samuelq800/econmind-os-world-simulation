/** Existing C2 Finance authority only. No source/seat/account registration and
 * no FX command. HTTP absence is preserved as unavailable, never a fake quote. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import type { createRegisteredFinalDriver } from './postwar-registered-final-driver.js';
import { registeredFinalRecord as row } from './postwar-registered-final-driver.js';
import { createFixedOfficeBrowserApplication } from '../../tools/office-connection/fixed-office-command-browser.mjs';
import { createRegisteredOfficeBrowserAcceptance } from '../../tools/office-connection/registered-office-browser-acceptance.mjs';
type BrowserInput = {
  applicationOrigin: string;
  authSubject: string;
  countryId: string;
  countryDisplayId: string;
  readConfiguration: unknown;
  getAccessToken: () => string | Promise<string>;
};
export async function probeRetainedFxQuotes(input: {
  driver: ReturnType<typeof createRegisteredFinalDriver>;
  installer: Pick<Pool, 'query'>;
  worldId: string;
  browser?: BrowserInput;
}) {
  const d = input.driver;
  const originals = (
    await input.installer.query(
      'select quote_ref,quote_text,quote_text_sha256 from world_v2.postwar_day_one_fx_quote_original where world_id=$1 and country_id=$2',
      [input.worldId, 'COUNTRY_02'],
    )
  ).rows;
  assert(originals.length <= 1);
  const request = () =>
    d.post(
      '/v1/postwar-office-runtime',
      {
        schemaVersion: 'postwar-office-runtime-read-v1',
        requestId: randomUUID(),
        operation: 'READ_CURRENT_OFFICE_OPENING',
        officeId: 'FINANCE',
        dataset: 'day-one-fx-quotes',
        page: { offset: 0, limit: 25 },
      },
      'COUNTRY_02',
    );
  const first = await request(),
    report: Record<string, unknown> = {
      classification: 'ACTUAL_JWT_FINANCE_READ_ONLY_NO_FX_COMMAND',
      rawQuoteOriginalCount: originals.length,
      first,
      browser: 'NOT_RUN',
    };
  if (first.status !== 200) {
    assert([403, 503].includes(first.status));
    const code = String(row(first.body.error).code);
    assert(/SEAT|DENIED|UNAVAILABLE/.test(code));
    report.status =
      first.status === 403
        ? 'DENIED_EXISTING_SEAT_OR_SCOPE'
        : 'UNAVAILABLE_REGISTERED_SOURCE_OR_BINDING';
    return report;
  }
  assert.equal(first.body.ok, true);
  assert(Array.isArray(first.body.rows));
  assert.equal(first.body.rows.length, 1);
  assert.equal(
    originals.length,
    1,
    'AVAILABLE_REQUIRES_ACTUAL_REGISTERED_ORIGINAL',
  );
  const quote = row(first.body.rows[0]),
    stored = originals[0]!,
    original = JSON.parse(stored.quote_text);
  assert.equal(
    createHash('sha256').update(stored.quote_text).digest('hex'),
    stored.quote_text_sha256,
  );
  for (const key of [
    'quoteRef',
    'quoteSha256',
    'localCurrency',
    'localCurrencyPerGcu',
    'governmentEntityId',
    'centralBankEntityId',
    'dealerGcuAccountId',
  ])
    assert.equal(quote[key], original[key], key);
  assert.equal(quote.quoteRef, stored.quote_ref);
  assert.equal(quote.countryId, 'COUNTRY_02');
  const refreshed = await request();
  assert.equal(refreshed.status, 200);
  assert.deepEqual(refreshed.body.rows, first.body.rows);
  assert.equal(
    row(refreshed.body.source).sourceVersion,
    row(first.body.source).sourceVersion,
  );
  report.refresh = refreshed;
  const ledger = await d.post(
    '/v1/postwar-office-runtime',
    {
      schemaVersion: 'postwar-office-runtime-read-v1',
      requestId: randomUUID(),
      operation: 'READ_CURRENT_OFFICE_OPENING',
      officeId: 'FINANCE',
      dataset: 'ledger-balances',
      page: { offset: 0, limit: 25 },
    },
    'COUNTRY_02',
  );
  assert.equal(ledger.status, 200);
  assert(Array.isArray(ledger.body.rows));
  assert.deepEqual(
    row(row(ledger.body.authority).readback),
    row(row(first.body.authority).readback),
  );
  report.ledgerPage = ledger;
  report.matchingTreasuries = ledger.body.rows
    .map(row)
    .filter(
      (r) =>
        r.ownerKind === 'GOV' &&
        r.ownerEntityId === quote.governmentEntityId &&
        r.currency === quote.localCurrency &&
        r.counterpartyEntityId === quote.centralBankEntityId &&
        r.accountClass === 'ASSET' &&
        r.claimId !== null,
    );
  report.ledgerCoverage = 'ACTUAL_AUTHORIZED_FIRST_PAGE_NOT_ALL_ACCOUNTS';
  report.registeredQuote = {
    quoteRef: stored.quote_ref,
    rawTextSha256: stored.quote_text_sha256,
    quoteSha256: quote.quoteSha256,
  };
  if (input.browser) {
    const playwright =
      process.env.OFFICE_BROWSER_PLAYWRIGHT_MODULE ??
      '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
    const { chromium } = await import(pathToFileURL(playwright).href);
    const browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.OFFICE_BROWSER_EXECUTABLE ?? '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const application = await createFixedOfficeBrowserApplication();
    let manager:
      | Awaited<ReturnType<typeof createRegisteredOfficeBrowserAcceptance>>
      | undefined;
    const forbidden: string[] = [];
    try {
      manager = await createRegisteredOfficeBrowserAcceptance({
        ...input.browser,
        browser,
        application,
        apiBaseURL: d.origin(),
      });
      const session = await manager.openOffice('finance');
      await session.page.route(
        '**/*',
        async (route: {
          request: () => { url: () => string };
          abort: () => Promise<void>;
          fallback: () => Promise<void>;
        }) => {
          const p = new URL(route.request().url()).pathname;
          if (['/v1/office-command', '/v1/command-recovery'].includes(p)) {
            forbidden.push(p);
            await route.abort();
          } else await route.fallback();
        },
      );
      const records = [];
      for (const operation of ['FIRST_READ', 'REFRESH']) {
        const state = row(await session.read());
        const page = row(state.fxQuotesPage);
        assert.deepEqual(page.rows, first.body.rows);
        assert.equal(page.dataset, 'day-one-fx-quotes');
        const text = await session.page
          .locator('[data-treasury-fx-form]')
          .innerText();
        assert(text.includes(String(quote.quoteRef)));
        const options = await session.page
          .locator('[data-treasury-fx-field="payerTreasuryAccountId"] option')
          .evaluateAll((nodes: HTMLOptionElement[]) =>
            nodes.map((n) => n.value),
          );
        const visible = row(state.runtimePage);
        assert(Array.isArray(visible.rows));
        for (const id of options)
          assert(visible.rows.some((r: unknown) => row(r).accountId === id));
        records.push({
          operation,
          quoteRef: quote.quoteRef,
          quoteSha256: quote.quoteSha256,
          sourceVersion: row(page.source).sourceVersion,
          treasuryOptions: options,
        });
      }
      assert.deepEqual(forbidden, []);
      report.browser = {
        classification:
          'ACTUAL_REGISTERED_NODE_AND_SHIPPED_CHROMIUM_FINANCE_FX_READ_ONLY',
        records,
        economicPosts: 0,
        bundleSha256: application.bundleSha256,
      };
    } finally {
      await manager?.close();
      await application.close();
      await browser.close();
    }
  }
  report.status =
    'REGISTERED_QUOTE_AND_EXISTING_LEDGER_READBACK_VERIFIED_NO_FX_EXECUTION';
  return report;
}
