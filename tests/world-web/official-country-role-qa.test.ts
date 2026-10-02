import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  auditMatrix,
  assessCountryRoleSnapshot,
  controlNature,
  countryRoleBrowser,
  countryRoleInputs,
  countryRolePreview,
  localAuditUrl,
  QA_COUNTRIES,
  QA_ROLES,
  runCountryRoleAudit,
} from '../../scripts/country-role-qa.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const inputs = await countryRoleInputs(root, sha);
const country02 = inputs.countries.get('02')!.data;
const financeFields = {
  treasury: '/profile/treasuryCentralBankBalanceGcu',
  maintenance: '/facilities/0/record/maintenanceGcuDay',
  sites: null,
};

function metricData(country: typeof country02) {
  return Object.entries(financeFields).map(([metric, outputPointer]) => {
    const meta = outputPointer
      ? country.officialSource.fields[outputPointer]
      : country.officialSource.collections.facilities;
    return {
      metric,
      outputPointer,
      exact: meta.exact ?? meta.countExact,
      dataset: meta.dataset,
      field: meta.field,
      sourcePointer: meta.sourcePointer ?? meta.rule,
      nature: meta.nature,
      unit: meta.unit,
      rowId: meta.rowId ?? null,
    };
  });
}
function snapshot() {
  return {
    countryId: country02.id,
    countryNumber: '02',
    office: 'finance',
    runtimeRole: 'finance',
    selectedSite: country02.facilities[0].id,
    identityText: country02.name,
    horizontalOverflow: false,
    backgroundRendered: true,
    metrics: metricData(country02),
    heading: 'Inspect a source',
    goal: 'Compare references without executing',
    options: [{ name: 'Read source' }],
    lesson: 'No economic effect',
    boundary: 'Local planning · Not executed',
  };
}

describe('C country-role browser audit accounting and safety', () => {
  it('creates exactly 420 NOT_RUN cells; enumerating combinations is not browser evidence', () => {
    const matrix = auditMatrix();
    expect(matrix).toHaveLength(420);
    expect(
      new Set(matrix.map((row) => `${row.country}:${row.role}`)).size,
    ).toBe(420);
    expect(
      matrix.every(
        (row) =>
          row.technicalStatus === 'NOT_RUN' && row.viewports.length === 0,
      ),
    ).toBe(true);
  });
  it('binds selected country metadata and rejects a different checkout SHA', async () => {
    expect(inputs.baseline).toMatchObject({
      packageId: 'BALANCED_2026_09_28_V1',
      countries: 70,
    });
    expect(inputs.countries.size).toBe(70);
    await expect(countryRoleInputs(root, '0'.repeat(40))).rejects.toThrow(
      'COUNTRY_ROLE_SHA_MISMATCH',
    );
  });
  it('serves real publication modules with JavaScript MIME and rejects writes/outside paths', async () => {
    const preview = await countryRolePreview(root, sha);
    try {
      const moduleResponse = await fetch(
        new URL('shared/season1-bridge.js', preview.baseUrl),
      );
      expect(moduleResponse.status).toBe(200);
      expect(moduleResponse.headers.get('content-type')).toBe(
        'text/javascript',
      );
      expect(
        (
          await fetch(
            new URL('shared/season1-numeric/decimal.mjs', preview.baseUrl),
          )
        ).headers.get('content-type'),
      ).toBe('text/javascript');
      expect((await fetch(new URL('/outside', preview.baseUrl))).status).toBe(
        404,
      );
      expect((await fetch(preview.baseUrl, { method: 'POST' })).status).toBe(
        405,
      );
    } finally {
      await preview.close();
    }
  });
  it('never treats rendered controls or a technical PASS as a playable FINAL chain', () => {
    const result = assessCountryRoleSnapshot(snapshot(), country02, 'finance');
    expect(result.technicalStatus).toBe('PASS');
    expect(result.playability.status).toBe('BLOCKED');
    expect(result.playability.finalReceiptChain).toBe(
      'NOT_EXERCISED_READ_ONLY',
    );
    expect(controlNature({ cmd: 'country-confirm' }, snapshot().boundary)).toBe(
      'LOCAL_ONLY',
    );
    expect(
      controlNature({ cmd: 'submit', claimedNature: 'COMMAND_READY' }, ''),
    ).toBe('COMMAND_READY_CLAIM_UNVERIFIED');
  });
  it('rejects rendered Avenor fallback and wrong exact value even when the source hook exists', () => {
    const wrong = snapshot();
    wrong.countryId = 'visual-territory-01';
    wrong.identityText = 'Avenor';
    const firstMetric = wrong.metrics[0];
    if (!firstMetric) throw new Error('Fixture treasury metric missing');
    firstMetric.exact = '120000000';
    const result = assessCountryRoleSnapshot(wrong, country02, 'finance');
    expect(result.failures).toContain('COUNTRY_OR_OFFICE_RENDER_MISMATCH');
    expect(result.failures).toContain(
      'HUD_EXACT_OR_PROVENANCE_MISMATCH:treasury',
    );
  });
  it('reports absent HUD/source instrumentation as BLOCKED, not PASS', () => {
    const missing = { ...snapshot(), metrics: [] };
    expect(
      assessCountryRoleSnapshot(missing, country02, 'finance').technicalStatus,
    ).toBe('BLOCKED');
  });
  it('refuses remote origins, invalid combinations and premature full coverage claims', async () => {
    expect(() => localAuditUrl('https://samuelq800.github.io/')).toThrow(
      'LOOPBACK_URL_REQUIRED',
    );
    expect(() => localAuditUrl('http://user:secret@127.0.0.1/')).toThrow(
      'LOOPBACK_URL_REQUIRED',
    );
    await expect(
      runCountryRoleAudit({
        inputs,
        baseUrl: 'http://127.0.0.1/',
        countries: QA_COUNTRIES,
        roles: QA_ROLES,
        runKind: 'SAMPLE_LOCAL',
      }),
    ).rejects.toThrow('FULL_RUN_REQUIRES_FIXED_INTEGRATION_CONFIRMATION');
    await expect(
      runCountryRoleAudit({
        inputs,
        baseUrl: 'http://127.0.0.1/',
        countries: ['99'],
        roles: ['finance'],
      }),
    ).rejects.toThrow('SELECTION_INVALID');
  });
});

// Read-only DOM fixtures reuse actual selected country JSON; no economic model,
// receipt generator, mutation endpoint, fake state transition or provider exists.
async function fixtureServer(mode = 'normal') {
  const methods: string[] = [];
  const server = createServer(async (request, response) => {
    methods.push(request.method ?? '');
    const url = new URL(request.url!, 'http://127.0.0.1');
    if (url.pathname.endsWith('/asset.svg')) {
      response.writeHead(200, { 'content-type': 'image/svg+xml' });
      response.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="green"/></svg>',
      );
      return;
    }
    const dataNumber = /\/countries\/data\/(\d{2})\.json$/.exec(
      url.pathname,
    )?.[1];
    if (dataNumber) {
      const bytes = await readFile(
        `${root}apps/world-web/public/season1-immersive/countries/data/${dataNumber}.json`,
      );
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(bytes);
      return;
    }
    const country = url.searchParams.get('country') ?? '02';
    const role = url.searchParams.get('role') ?? 'finance';
    const back = `/season1-immersive/?country=${country}&role=${role}#country`;
    if (url.searchParams.get('atlas')) {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(`<a href="${back}">Return to selected country</a>`);
      return;
    }
    const data = inputs.countries.get(country)!.data;
    const metrics = metricData(data);
    const attrs = (metric: ReturnType<typeof metricData>[number]) =>
      `data-cmd="country-metric" data-metric="${metric.metric}" data-output-pointer="${metric.outputPointer ?? ''}" data-source-exact="${metric.exact}" data-source-dataset="${metric.dataset}" data-source-field="${metric.field ?? ''}" data-source-pointer="${metric.sourcePointer}" data-source-unit="${metric.unit}" data-source-nature="${metric.nature}" data-source-row-id="${metric.rowId ?? ''}"`;
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0}main{min-height:1400px;max-width:100%;padding:12px;box-sizing:border-box}.national-world{height:30px;background-image:url('/asset.svg')}button,select,a{display:block;margin:8px}*:focus{outline:2px solid green}.national-drawer{position:fixed;top:0;background:white;padding:12px}</style></head><body><div id="game"></div><script>
    fetch('countries/data/${country}.json').then(async response=>{
      if(!response.ok){document.querySelector('#game').textContent='Official opening data unavailable. No sample values were substituted.';return;}
      const country=await response.json();
      window.CountryGame={country:()=>country,state:()=>({site:country.facilities[0].id})};window.GameTest={role:()=>new URLSearchParams(location.search).get('role')};
      document.querySelector('#game').innerHTML=${JSON.stringify(`<main class="country-game" data-country="${country}" data-office="${role}" data-data-source="STATIC_BASELINE"><div class="national-world"></div><header class="national-identity">${data.name}</header><section class="national-mission"><h1>Inspect the selected source</h1><p>Compare references; no economic execution</p></section><div class="national-resources">${metrics.map((metric) => `<button ${attrs(metric)}>${metric.metric}</button>`).join('')}</div><p class="national-lesson">Local references do not settle</p><p data-national-status>Local planning · Not executed</p><p class="national-edition">Not connected</p><a class="national-atlas" href="${back.replace('#country', '&atlas=1')}">Country atlas</a><select aria-label="Switch role" data-country-role-switch>${QA_ROLES.map((r) => `<option value="${r}"${r === role ? ' selected' : ''}>${r}</option>`).join('')}</select><nav class="national-tools"><button data-cmd="country-source">Source intel</button></nav><section class="national-play"><button data-cmd="country-confirm" disabled>Confirm allocation</button></section><div class="national-drawer" hidden><div class="national-drawer-head"><button data-cmd="country-dismiss">Close</button></div><article></article></div></main>`)};
      document.querySelector('[data-country-role-switch]').onchange=e=>location.href='/season1-immersive/?country=${country}&role='+e.target.value;
      const metrics=${JSON.stringify(metrics)},hashes=${JSON.stringify(data.officialSource.datasets)};
      document.addEventListener('click',e=>{const b=e.target.closest('[data-cmd]');if(!b)return;const drawer=document.querySelector('.national-drawer');if(b.dataset.cmd==='country-dismiss'){drawer.hidden=true;return;}if(b.dataset.cmd==='country-source'||b.dataset.cmd==='country-metric'){drawer.hidden=false;const metric=metrics.find(m=>m.metric===b.dataset.metric);drawer.querySelector('article').innerHTML=metric? 'Exact: '+metric.exact+'<details><summary>Source record</summary>Source hash: '+hashes[metric.dataset].sha256+'</details>' : 'Static selected source; no live World';}});
      ${mode === 'error' ? "console.error('TEST_CONSOLE_ERROR');setTimeout(()=>{throw Error('TEST_PAGE_ERROR')},0);fetch('/blocked-write',{method:'POST'}).catch(()=>{});" : ''}
    });</script></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw Error('Missing fixture address');
  return {
    methods,
    baseUrl: `http://127.0.0.1:${address.port}/`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

describe.skipIf(process.env.COUNTRY_ROLE_BROWSER_TESTS !== '1')(
  'C actual Chromium fixture rendering (never 420 acceptance)',
  () => {
    it('renders two countries at both viewport sizes, verifies provenance/navigation/focus and leaves 418 NOT_RUN', async () => {
      const runtime = await countryRoleBrowser();
      const server = await fixtureServer();
      try {
        const result = await runCountryRoleAudit({
          browser: runtime.browser,
          inputs,
          baseUrl: server.baseUrl,
          countries: ['02', '70'],
          roles: ['finance'],
          runKind: 'FIXTURE',
        });
        expect(result.coverage).toMatchObject({
          executed: 2,
          notRun: 418,
          full420Executed: false,
        });
        for (const cell of result.matrix.filter(
          (row) => row.technicalStatus !== 'NOT_RUN',
        )) {
          expect(cell.technicalStatus, JSON.stringify(cell.viewports)).toBe(
            'PASS',
          );
          expect(cell.playabilityStatus).toBe('BLOCKED_NOT_FULL_ECONOMIC_LOOP');
        }
        expect(
          result.missingDataProbes.every(
            (row) => row.status === 'PASS_NO_FALLBACK',
          ),
        ).toBe(true);
        expect(
          result.missingDataProbes.every(
            (row) =>
              row.loading.status === 'PASS_NO_FALLBACK_WHILE_SOURCE_PENDING',
          ),
        ).toBe(true);
        expect(result.resourceCache.hits).toBeGreaterThan(0);
        expect(
          server.methods.every((method) =>
            ['GET', 'HEAD', 'OPTIONS'].includes(method),
          ),
        ).toBe(true);
      } finally {
        await runtime.browser.close();
        await server.close();
      }
    });
    it('records console/pageerror and blocks a write before it reaches even the fixture server', async () => {
      const runtime = await countryRoleBrowser();
      const server = await fixtureServer('error');
      try {
        const result = await runCountryRoleAudit({
          browser: runtime.browser,
          inputs,
          baseUrl: server.baseUrl,
          countries: ['02'],
          roles: ['finance'],
          runKind: 'FIXTURE',
        });
        const cell = result.matrix.find(
          (row) => row.country === '02' && row.role === 'finance',
        )!;
        expect(cell.technicalStatus).toBe('FAIL');
        expect(
          cell.viewports.some(
            (row) => row.errors.length && row.consoleErrors.length,
          ),
        ).toBe(true);
        expect(
          cell.viewports.some((row) =>
            row.requests.some(
              (request) =>
                request.status === 'BLOCKED_NON_READ_ONLY_OR_EXTERNAL',
            ),
          ),
        ).toBe(true);
        expect(server.methods).not.toContain('POST');
      } finally {
        await runtime.browser.close();
        await server.close();
      }
    });
  },
);
