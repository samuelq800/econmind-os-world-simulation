/* global window, document -- borrowed actual Chromium page only. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRegisteredOfficeBrowserAcceptance } from './registered-office-browser-acceptance.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const uint = /^(0|[1-9][0-9]*)$/u;
const hash = /^sha256:[a-f0-9]{64}$/u;
const head = (v) => ({
  worldVersion: v.worldVersion,
  eventSequence: v.eventSequence,
});

/** Builds only an additive shipped read component, not another application or
 * backend. The existing browser asset server/proxy remains caller-owned. */
export async function buildSocialServiceBrowserAdapter() {
  const { build } = await import('vite');
  // An absolute virtual entry survives Vite's library-entry normalization.
  const entry = root + '__social-service-read-component.ts';
  const result = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'social-service-read-component',
        resolveId: (id) => (id === entry ? id : undefined),
        load: (id) =>
          id === entry
            ? `
import {installOfficeProjection} from ${JSON.stringify(root + 'apps/world-web/src/office-projection/view.ts')};
let api, alive=false, token='', listeners=new Set();
window.EconMindSocialServiceReadProbe={
 configure(input){api?.disconnect();alive=true;token=input.accessToken;listeners=new Set();
  const identity=Object.freeze({...input.read.identity});
  if(!api)api=installOfficeProjection(document,window);
  return api.connect({...input,read:{...input.read,identity,currentIdentity:()=>alive?identity:null,
   getAccessToken:async()=>token,session:{...input.read.session,isCurrent:()=>alive,
    onInvalidate(fn){listeners.add(fn);return()=>listeners.delete(fn);}}}});
 },state(){return api?.getState();},setAccessToken(value){token=value;},
 invalidate(){alive=false;token='';for(const f of [...listeners])f();api?.disconnect();}
};
const trigger=document.createElement('button');trigger.type='button';
trigger.dataset.moduleCard='social-10';trigger.textContent='现有就业服务（只读组件验收）';
document.querySelector('.country-game').append(trigger);
`
            : undefined,
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['iife'], name: 'SocialServiceReadComponent' },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  assert.equal(outputs.length, 1);
  assert.ok('output' in outputs[0]);
  const chunks = outputs[0].output.filter((o) => o.type === 'chunk');
  assert.equal(chunks.length, 1);
  const code = chunks[0].code;
  return Object.freeze({
    code,
    sha256: createHash('sha256').update(code).digest('hex'),
  });
}

/** Shared assertion for actual observations. Unit tests of this function are
 * observation-contract checks, never actual backend/browser evidence. */
export function assertSocialServiceBrowserObservation(o, expected) {
  assert.equal(
    o.rowsClearedDuringRead,
    true,
    'OLD_ROWS_MUST_CLEAR_BEFORE_REFRESH',
  );
  assert.ok(
    ['PAGE', 'EMPTY', 'DENIED', 'UNAVAILABLE'].includes(expected.status),
  );
  const { dom, wire } = o;
  assert.match(dom.text, /原9个目录输入尚未接通/u);
  if (expected.status === 'DENIED' || expected.status === 'UNAVAILABLE') {
    assert.equal(dom.state.status, expected.status);
    if (expected.status === 'DENIED') assert.equal(o.httpStatus, 403);
    else assert.ok(o.httpStatus >= 500, 'ACTUAL_BACKEND_FAILURE_REQUIRED');
    assert.equal(dom.rows.length, 0);
    assert.doesNotMatch(dom.text, /Source version|此授权页没有既有就业服务池/u);
    assert.match(dom.text, /读取未完成/u);
    return Object.freeze({
      status: expected.status,
      httpStatus: o.httpStatus,
      code: dom.state.code,
    });
  }
  assert.equal(o.httpStatus, 200);
  assert.equal(dom.state.status, 'CURRENT');
  assert.equal(wire.ok, true);
  assert.equal(wire.status, expected.status === 'PAGE' ? 'AVAILABLE' : 'EMPTY');
  assert.equal(wire.dataset, 'service-pools');
  assert.equal(wire.authority.identity.officeId, 'SOCIAL');
  assert.equal(wire.authority.identity.countryId, expected.countryId);
  assert.equal(wire.authority.identity.authSubjectId, expected.authSubject);
  assert.deepEqual(head(wire.authority.readback), expected.head);
  const s = wire.source;
  for (const [key, value] of Object.entries(expected.pins))
    assert.equal(s[key], value);
  assert.equal(s.countryId, expected.countryId);
  assert.equal(s.officeId, 'SOCIAL');
  assert.equal(s.dataNature, 'ADMITTED_CURRENT_SOCIAL_MIXED_FINANCIAL_PREFIX');
  assert.deepEqual(s.observedHead, expected.head);
  assert.match(s.sourceVersion, hash);
  assert.match(s.bindingVersion, hash);
  assert.equal(
    s.currentPrefixCoverage.globalWorldVersion,
    expected.head.worldVersion,
  );
  assert.equal(
    s.currentPrefixCoverage.globalEventSequence,
    expected.head.eventSequence,
  );
  assert.ok(
    uint.test(String(s.originWorldVersion)) &&
      uint.test(String(s.originEventSequence)),
  );
  assert.match(dom.text, new RegExp(`Source version ${s.sourceVersion}`, 'u'));
  assert.ok(
    dom.text.includes(
      `World version ${expected.head.worldVersion} / event ${expected.head.eventSequence}`,
    ),
  );
  assert.ok(
    dom.text.includes(
      `State origin ${s.originWorldVersion} / ${s.originEventSequence}`,
    ),
  );
  assert.ok(dom.text.includes('Unit person'));
  assert.ok(
    dom.text.includes(
      `授权页范围 [${wire.page.offset}, ${wire.page.offset + wire.page.returned}) / ${wire.page.total}`,
    ),
  );
  assert.equal(wire.page.returned, wire.rows.length);
  assert.ok(wire.rows.length <= 25);
  assert.deepEqual(
    dom.rows,
    wire.rows.map((r) => {
      assert.equal(r.countryId, expected.countryId);
      for (const k of [
        'dayIndex',
        'capacitySlots',
        'usedSlots',
        'reservedSlots',
      ])
        assert.match(r[k], uint);
      assert.ok(
        BigInt(r.usedSlots) + BigInt(r.reservedSlots) <=
          BigInt(r.capacitySlots),
      );
      return {
        poolId: r.poolId,
        cells: [
          r.poolId,
          r.locationId,
          r.skill,
          r.dayIndex,
          r.capacitySlots,
          r.usedSlots,
          r.reservedSlots,
          r.ruleVersion,
        ],
      };
    }),
  );
  if (expected.status === 'PAGE') assert.ok(wire.rows.length > 0);
  else {
    assert.equal(wire.rows.length, 0);
    assert.match(dom.text, /此授权页没有既有就业服务池/u);
  }
  return Object.freeze({
    status: expected.status,
    httpStatus: 200,
    head: expected.head,
    sourceVersion: s.sourceVersion,
    bindingVersion: s.bindingVersion,
    origin: {
      worldVersion: s.originWorldVersion,
      eventSequence: s.originEventSequence,
    },
    page: wire.page,
    rows: wire.rows,
  });
}

/** No responses are synthesized. EMPTY, 403 and failure require real caller-
 * arranged backend conditions; absent scenarios remain NOT_RUN. No submit,
 * recovery, consumer, Clock, Node or browser is started here. */
export async function createRegisteredSocialServiceContextBrowserProbe(input) {
  assert.ok(
    input?.browser && input.application,
    'EXISTING_BROWSER_AND_APPLICATION_REQUIRED',
  );
  assert.equal(
    typeof input.getAccessToken,
    'function',
    'ACTUAL_TOKEN_PROVIDER_REQUIRED',
  );
  const manager = await createRegisteredOfficeBrowserAcceptance(input);
  let session;
  try {
    const adapter = await buildSocialServiceBrowserAdapter();
    session = await manager.openOffice('social');
    const page = session.page,
      records = [],
      forbidden = [];
    await page.route('**/*', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (['/v1/office-command', '/v1/command-recovery'].includes(path)) {
        forbidden.push(path);
        await route.abort('blockedbyclient');
      } else await route.fallback();
    });
    async function mount() {
      const metadata = await manager.currentSeat();
      const authority = metadata.bindings.find(
        (b) => b.identity.officeId === 'SOCIAL',
      );
      assert.ok(authority);
      const token = await input.getAccessToken();
      assert.match(token, /^Bearer [A-Za-z0-9._-]+$/u);
      await page.addScriptTag({ content: adapter.code });
      await page.evaluate(
        (binding) => window.EconMindSocialServiceReadProbe.configure(binding),
        {
          read: {
            identity: authority.identity,
            seatRef: authority.seatRef,
            world: input.readConfiguration.admittedWorldPins,
            endpoints: input.readConfiguration.endpointPins,
            session: { sessionRef: 'SOCIAL_READ_COMPONENT_' + randomUUID() },
          },
          view: { role: 'social', countryDisplayId: input.countryDisplayId },
          accessToken: token.slice(7),
        },
      );
      // The borrowed manager opens its command drawer by default. Operate only
      // the separately mounted shipped read component in this stage.
      await page.evaluate(() =>
        document.querySelector('[data-office-command-dialog]')?.close(),
      );
    }
    await mount();
    let closed = false,
      opened = false;
    const report = () => ({
      classification: 'SHIPPED_SOCIAL_READ_COMPONENT_ON_ACTUAL_REGISTERED_NODE',
      componentCoverage: 'ADDITIVE_COMPONENT_NOT_MAIN_APPLICATION_INTEGRATION',
      catalogInputsConnected: 0,
      createService: 'NOT_IMPLEMENTED',
      bundleSha256: input.application.bundleSha256,
      adapterSha256: adapter.sha256,
      records: [...records],
      economicPosts: forbidden.length,
      scenarios: Object.fromEntries(
        ['PAGE', 'EMPTY', 'DENIED', 'UNAVAILABLE'].map((s) => [
          s,
          records.some((r) => r.status === s) ? 'OBSERVED' : 'NOT_RUN',
        ]),
      ),
      backendStartedHere: false,
      consumerStartedHere: false,
      clockStartedHere: false,
      platformTls: 'NOT_VERIFIED_BY_LOOPBACK_PROXY',
    });
    return Object.freeze({
      async read(expected) {
        assert.equal(closed, false);
        if (['PAGE', 'EMPTY'].includes(expected.status)) {
          assert.ok(
            expected.head &&
              uint.test(expected.head.worldVersion) &&
              uint.test(expected.head.eventSequence),
          );
          assert.ok(
            BigInt(expected.head.worldVersion) > 0n,
            'ACTUAL_CURRENT_PUBLICATION_REQUIRED',
          );
        }
        const responsePromise = page.waitForResponse(
          (response) => {
            const request = response.request();
            if (
              request.method() !== 'POST' ||
              new URL(response.url()).pathname !==
                input.readConfiguration.endpointPins.projectionPath
            )
              return false;
            try {
              return request.postDataJSON().dataset === 'service-pools';
            } catch {
              return false;
            }
          },
          { timeout: 15000 },
        );
        // Preserve the primary DOM error without an unhandled pending waiter.
        void responsePromise.catch(() => undefined);
        const rowsClearedDuringRead = await page.evaluate((first) => {
          const button = first
            ? document.querySelector('[data-module-card="social-10"]')
            : [
                ...document.querySelectorAll(
                  '[data-office-projection-dialog] button',
                ),
              ].find((b) => b.textContent === 'Read current authorized page');
          if (!button || button.disabled)
            throw Error('ACTUAL_SOCIAL_READ_BUTTON_REQUIRED');
          button.click();
          return (
            document.querySelectorAll('[data-social-service-pool]').length === 0
          );
        }, !opened);
        opened = true;
        const response = await responsePromise;
        const bytes = await response.body();
        assert.ok(bytes.length <= 65536);
        let wire;
        try {
          wire = JSON.parse(bytes.toString('utf8'));
        } catch {
          wire = null;
        }
        await page.waitForFunction(
          () =>
            window.EconMindSocialServiceReadProbe.state().status !== 'READING',
        );
        const dom = await page.evaluate(() => ({
          state: window.EconMindSocialServiceReadProbe.state(),
          text:
            document.querySelector('[data-social-service-supplemental-context]')
              ?.textContent ?? '',
          rows: [
            ...document.querySelectorAll('[data-social-service-pool]'),
          ].map((r) => ({
            poolId: r.getAttribute('data-social-service-pool'),
            cells: [...r.querySelectorAll('td')].map((c) => c.textContent),
          })),
        }));
        const record = assertSocialServiceBrowserObservation(
          { httpStatus: response.status(), wire, dom, rowsClearedDuringRead },
          {
            ...expected,
            countryId: input.countryId,
            authSubject: input.authSubject,
            pins: Object.fromEntries(
              Object.entries(input.readConfiguration.admittedWorldPins).filter(
                ([k]) => k !== 'minimumWorldVersion',
              ),
            ),
          },
        );
        assert.equal(
          forbidden.length,
          0,
          'READ_ONLY_PROBE_ATTEMPTED_ECONOMIC_REQUEST',
        );
        records.push(record);
        return record;
      },
      async reload() {
        assert.equal(closed, false);
        await page.reload();
        await page.waitForFunction(() => !!window.EconMindFixedOfficeProbe);
        await mount();
        opened = false;
        assert.equal(
          await page.locator('[data-social-service-pool]').count(),
          0,
        );
      },
      async setAccessTokenForNextRead(bearer) {
        assert.equal(closed, false);
        assert.match(bearer, /^Bearer [A-Za-z0-9._-]+$/u);
        await page.evaluate(
          (token) =>
            window.EconMindSocialServiceReadProbe.setAccessToken(token),
          bearer.slice(7),
        );
      },
      report,
      async close() {
        if (!closed) {
          closed = true;
          await manager.close();
        }
      },
    });
  } catch (error) {
    await manager.close();
    throw error;
  }
}
