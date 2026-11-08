/* global window -- existing shipped Chromium probe only. */
/** Read-only composition. The caller owns the actual browser, built application,
 * registered Node and credential provider. No backend, response fixture,
 * command submission, recovery, consumer or Clock is created here. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRegisteredOfficeBrowserAcceptance } from './registered-office-browser-acceptance.mjs';
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const head = (v) => ({
  worldVersion: v.worldVersion,
  eventSequence: v.eventSequence,
});
const fingerprint = /^sha256:[a-f0-9]{64}$/u;
/** Public typed status only; never headers, JWT, raw body, intent or receipt. */
export function registeredReadbackFailureState(value) {
  const text = (v) => (typeof v === 'string' && v.length <= 128 ? v : null);
  return {
    status: text(value?.status),
    code: text(value?.code),
    dataset: text(value?.runtimePage?.dataset),
    hasRuntimePage:
      value?.runtimePage !== null && value?.runtimePage !== undefined,
  };
}
export function registeredReadbackPublicErrorCode(body) {
  const code = body?.error?.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_:.-]{0,127}$/u.test(code)
    ? code
    : null;
}
export async function runRegisteredTradeCbReadbackBrowserProbe(input) {
  assert.ok(
    input.browser && input.application,
    'EXISTING_BROWSER_AND_APPLICATION_REQUIRED',
  );
  for (const value of Object.values(input.expectedHead ?? {}))
    assert.match(value, /^(0|[1-9][0-9]*)$/u);
  assert.deepEqual(Object.keys(input.expectedHead ?? {}).sort(), [
    'eventSequence',
    'worldVersion',
  ]);
  assert.ok(
    BigInt(input.expectedHead.worldVersion) > 0n,
    'POST_H0_EXPECTATION_REQUIRED',
  );
  if (input.failureEvidencePath !== undefined)
    assert.ok(
      path.isAbsolute(input.failureEvidencePath),
      'ABSOLUTE_FAILURE_EVIDENCE_PATH_REQUIRED',
    );
  const manager = await createRegisteredOfficeBrowserAcceptance(input);
  const records = [],
    network = [],
    forbidden = [];
  const sessions = new Map(),
    observations = [];
  let phase = 'PREFLIGHT_COMPLETE';
  const roles = { trade: 'TRADE', central_bank: 'CENTRAL_BANK' };
  const pins = input.readConfiguration.admittedWorldPins;
  async function open(role) {
    phase = role + ':OPEN';
    const session = await manager.openOffice(role);
    sessions.set(role, session);
    await session.page.route('**/*', async (route) => {
      const p = new URL(route.request().url()).pathname;
      if (['/v1/office-command', '/v1/command-recovery'].includes(p)) {
        forbidden.push({ role, path: p });
        await route.abort('blockedbyclient');
      } else await route.fallback();
    });
    session.page.on('response', (response) => {
      const request = response.request(),
        path = new URL(response.url()).pathname;
      if (path === input.readConfiguration.endpointPins.projectionPath) {
        const observed = {
          role,
          phase,
          method: request.method(),
          path,
          status: response.status(),
          publicErrorCode: null,
        };
        network.push(observed);
        observations.push(
          (async () => {
            try {
              const bytes = await response.body();
              if (bytes.length <= 65536)
                observed.publicErrorCode = registeredReadbackPublicErrorCode(
                  JSON.parse(bytes.toString('utf8')),
                );
            } catch {
              /* Keep observed HTTP status even for a malformed body. */
            }
          })(),
        );
      }
    });
    return session;
  }
  function pageFrom(state, dataset, office) {
    assert.equal(state.status, 'CURRENT_AUTHORIZED_HEAD');
    assert.equal(state.intent, null);
    assert.equal(state.receipt, null);
    const p = state.runtimePage;
    assert.ok(p && ['PAGE', 'EMPTY'].includes(p.status));
    assert.equal(p.dataset, dataset);
    assert.equal(p.authority.identity.officeId, office);
    assert.equal(p.authority.identity.countryId, input.countryId);
    assert.deepEqual(head(p.authority.readback), input.expectedHead);
    assert.equal(p.source.contentHash, pins.contentHash);
    assert.equal(p.source.admissionRef, pins.admissionRef);
    assert.equal(p.source.countryId, input.countryId);
    assert.equal(p.page.returned, p.rows.length);
    assert.match(p.source.sourceVersion, fingerprint);
    return p;
  }
  function record(role, operation, p) {
    phase = role + ':' + operation + ':DONE';
    records.push({
      role,
      operation,
      dataset: p.dataset,
      status: p.status,
      head: head(p.authority.readback),
      sourceVersion: p.source.sourceVersion,
      page: p.page,
      rows: p.rows,
      rowsSha256: sha(p.rows),
      dataNature: p.source.dataNature,
      pageHash: p.source.pageHash,
      returnedRowsHash: p.source.returnedRowsHash,
      prefixFingerprint: (
        p.source.currentTradeCoverage ?? p.source.currentFinancialCoverage
      )?.prefixFingerprint,
      ...(p.source.centralBankOpeningInstruments
        ? {
            centralBankOpeningInstruments:
              p.source.centralBankOpeningInstruments,
          }
        : {}),
    });
  }
  async function reload(role, session) {
    phase = role + ':F5:NAVIGATION';
    await session.page.reload();
    await session.page.waitForFunction(() => !!window.EconMindFixedOfficeProbe);
    // F5 discards the page token/config. Obtain both again from the real fixture.
    phase = role + ':F5:CURRENT_SEAT';
    const current = await manager.currentSeat();
    const authority = current.bindings.find(
      (b) => b.identity.officeId === roles[role],
    );
    assert.ok(authority);
    assert.deepEqual(head(authority.readback), input.expectedHead);
    const bearer = await input.getAccessToken();
    assert.match(bearer, /^Bearer [A-Za-z0-9._-]+$/u);
    phase = role + ':F5:CONFIGURE';
    await session.page.evaluate(
      (supplied) => window.EconMindFixedOfficeProbe.configure(supplied),
      {
        read: {
          identity: authority.identity,
          seatRef: authority.seatRef,
          world: pins,
          endpoints: input.readConfiguration.endpointPins,
          session: { sessionRef: 'READBACK_F5_' + randomUUID() },
        },
        view: { role, countryDisplayId: input.countryDisplayId },
        endpoint: {
          origin: input.readConfiguration.endpointPins.origin,
          path: '/v1/office-command',
          deploymentRef: input.readConfiguration.endpointPins.deploymentRef,
        },
        accessToken: bearer.slice(7),
      },
    );
    await session.page.locator('[data-office-command-action="open"]').click();
    phase = role + ':F5:READ';
    return session.read();
  }
  async function selectTrade(session, action, dataset) {
    phase = 'trade:SELECT:' + dataset;
    await session.page
      .locator(`[data-office-command-action="${action}"]`)
      .click();
    await session.page.waitForFunction((d) => {
      const s = window.EconMindFixedOfficeProbe.state();
      return s.status !== 'READING' && s.runtimePage?.dataset === d;
    }, dataset);
    return pageFrom(await session.state(), dataset, 'TRADE');
  }
  try {
    const trade = await open('trade');
    let inventory = pageFrom(await trade.read(), 'inventory-current', 'TRADE');
    assert.ok(inventory.page.total > 0, 'ACTUAL_INVENTORY_ROWS_REQUIRED');
    assert.equal(
      inventory.source.dataNature,
      'ADMITTED_CURRENT_TRADE_COMPLETE_PREFIX',
    );
    const firstInventory = inventory;
    let returned = 0;
    for (let n = 0; ; n++) {
      assert.ok(n < 64, 'BOUNDED_INVENTORY_PAGES_EXCEEDED');
      assert.equal(inventory.page.offset, returned);
      assert.equal(
        inventory.source.sourceVersion,
        firstInventory.source.sourceVersion,
      );
      assert.deepEqual(
        inventory.source.currentTradeCoverage,
        firstInventory.source.currentTradeCoverage,
      );
      assert.ok(inventory.rows.every((r) => r.countryId === input.countryId));
      returned += inventory.rows.length;
      record('trade', 'INVENTORY_PAGE', inventory);
      if (inventory.page.nextOffset === null) break;
      inventory = await selectTrade(
        trade,
        'trade-next-page',
        'inventory-current',
      );
    }
    assert.equal(returned, firstInventory.page.total);
    const transfers = await selectTrade(
      trade,
      'trade-transfers',
      'goods-transfers-current',
    );
    assert.equal(transfers.status, 'EMPTY');
    assert.equal(transfers.page.total, 0);
    assert.deepEqual(transfers.rows, []);
    record('trade', 'EMPTY_TRANSFERS', transfers);
    const refreshed = pageFrom(
      await trade.read(),
      'goods-transfers-current',
      'TRADE',
    );
    assert.equal(
      refreshed.source.sourceVersion,
      transfers.source.sourceVersion,
    );
    record('trade', 'REFRESH_EMPTY_TRANSFERS', refreshed);
    const restoredInventory = pageFrom(
      await reload('trade', trade),
      'inventory-current',
      'TRADE',
    );
    assert.equal(
      restoredInventory.source.sourceVersion,
      firstInventory.source.sourceVersion,
    );
    assert.deepEqual(restoredInventory.rows, firstInventory.rows);
    record('trade', 'F5_INVENTORY', restoredInventory);
    const cb = await open('central_bank');
    const funds = pageFrom(await cb.read(), 'ledger-balances', 'CENTRAL_BANK');
    assert.ok(funds.rows.length > 0, 'ACTUAL_CURRENT_FUNDS_ROWS_REQUIRED');
    assert.equal(
      funds.source.dataNature,
      'ADMITTED_CURRENT_FINANCIAL_MIXED_POSTING_PREFIX',
    );
    assert.deepEqual(funds.source.observedHead, input.expectedHead);
    assert.equal(
      funds.source.currentFinancialCoverage.prefixFingerprint,
      firstInventory.source.currentTradeCoverage.prefixFingerprint,
    );
    const opening = funds.source.centralBankOpeningInstruments;
    assert.ok(opening, 'BOUND_CB_OPENING_DECLARATION_REQUIRED');
    assert.equal(
      opening.measurement,
      'ADMITTED_OPENING_DECLARATION_NOT_CURRENT_TRADABILITY',
    );
    assert.equal(opening.status, 'NO_DECLARED_DOMESTIC_GOVERNMENT_SECURITY');
    assert.equal(opening.originWorldVersion, '0');
    assert.equal(opening.originEventSequence, '0');
    assert.equal(opening.governmentSecurityHoldingCount, 0);
    assert.equal(opening.countryId, input.countryId);
    assert.equal(opening.seedFingerprint, pins.contentHash);
    assert.equal(opening.admissionRef, pins.admissionRef);
    assert.equal(opening.canonicalSeedSha256, funds.source.canonicalSeedSha256);
    assert.equal(opening.sourceBundleSha256, funds.source.sourceBundleSha256);
    assert.equal(opening.sourcePages.length, 3);
    record('central_bank', 'CURRENT_FUNDS_AND_OPENING_DECLARATION', funds);
    for (const [operation, state] of [
      ['REFRESH_FUNDS', await cb.read()],
      ['F5_FUNDS', await reload('central_bank', cb)],
    ]) {
      const p = pageFrom(state, 'ledger-balances', 'CENTRAL_BANK');
      assert.equal(p.source.sourceVersion, funds.source.sourceVersion);
      assert.deepEqual(p.source.centralBankOpeningInstruments, opening);
      assert.deepEqual(p.rows, funds.rows);
      record('central_bank', operation, p);
    }
    assert.deepEqual(forbidden, []);
    assert.ok(network.length >= 7);
    assert.ok(network.every((r) => r.method === 'POST' && r.status === 200));
    return {
      classification: 'ACTUAL_REGISTERED_NODE_AND_SHIPPED_CHROMIUM_READBACK',
      expectedHead: input.expectedHead,
      records,
      network,
      metadata: manager.evidence.metadata,
      bundleSha256: input.application.bundleSha256,
      economicPosts: 0,
      backendStartedHere: false,
      consumerStartedHere: false,
      clockStartedHere: false,
      fundsCoverage: 'VISIBLE_FIRST_BROWSER_PAGE_NOT_ALL_CB_ACCOUNTS',
      displayCoverage:
        'SHIPPED_COMMAND_DRAWER_AND_VALIDATED_RUNTIME_PAGE_STATE',
      platformTls: 'NOT_VERIFIED_BY_LOOPBACK_PROXY',
    };
  } catch (error) {
    if (input.failureEvidencePath) {
      await Promise.allSettled(observations);
      const states = {};
      for (const [role, session] of sessions) {
        try {
          states[role] = registeredReadbackFailureState(await session.state());
        } catch {
          states[role] = { status: 'STATE_READ_FAILED', code: null };
        }
      }
      try {
        await writeFile(
          input.failureEvidencePath,
          JSON.stringify(
            {
              classification: 'ACTUAL_READBACK_FAILURE_DIAGNOSTICS_NOT_SUCCESS',
              phase,
              states,
              network,
              completedRecords: records,
              metadata: manager.evidence.metadata,
              economicRequestsBlocked: forbidden,
              expectedHead: input.expectedHead,
            },
            null,
            2,
          ) + '\n',
        );
      } catch {
        process.stderr.write(
          'REGISTERED_READBACK_FAILURE_EVIDENCE_WRITE_FAILED\n',
        );
      }
    }
    throw error;
  } finally {
    await manager.close();
  }
}
