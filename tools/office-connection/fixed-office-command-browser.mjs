/* global window -- isolated real Chromium application probe. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  access,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../', import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function loopback(value) {
  const u = new URL(value);
  if (
    u.protocol !== 'http:' ||
    u.hostname !== '127.0.0.1' ||
    u.username ||
    u.password ||
    u.pathname !== '/' ||
    u.search ||
    u.hash
  )
    throw Error('OWNED_LOOPBACK_BASE_REQUIRED');
  return u.origin;
}
async function capabilities() {
  const c = {
    playwrightModule:
      process.env.OFFICE_BROWSER_PLAYWRIGHT_MODULE ??
      '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs',
    executable: process.env.OFFICE_BROWSER_EXECUTABLE ?? '/usr/bin/chromium',
    status: 'BLOCKED',
  };
  if (process.platform !== 'linux') return c;
  try {
    for (const [file, permission] of [
      [c.playwrightModule, constants.R_OK],
      [c.executable, constants.X_OK],
    ]) {
      if (!path.isAbsolute(file) || !(await stat(file)).isFile()) return c;
      await access(file, permission);
    }
    c.status = 'AVAILABLE';
  } catch {
    /* Exact capability gap, no installation. */
  }
  return c;
}
/** Builds only the shipped browser module/probe entry. No API, DB, runtime,
 * consumer or Clock starts. Caller owns the returned loopback asset server. */
export async function createFixedOfficeBrowserApplication() {
  const directory = await mkdtemp(path.join(tmpdir(), 'fixed-office-browser-'));
  const entry = path.join(directory, 'entry.ts');
  const source = `import {installOfficeCommand} from ${JSON.stringify(path.join(root, 'apps/world-web/src/office-command/view.ts'))};
import {fixedOfficeCommandFixture} from ${JSON.stringify(path.join(root, 'tests/world-web/office-command-fixed-offices-fixture.ts'))};
export {fixedOfficeCommandFixture};
if(typeof window!=='undefined'){
 let api:any=null,alive=false,listeners=new Set<()=>void>();
 window.EconMindFixedOfficeProbe={configure(input:any){api?.disconnect();alive=true;listeners=new Set();
  const host=document.querySelector('.country-game') as HTMLElement;host.dataset.office=input.view.role;host.dataset.country=input.view.countryDisplayId;
  const identity=Object.freeze({...input.read.identity});const read={...input.read,identity,currentIdentity:()=>alive?identity:null,getAccessToken:async()=>input.accessToken,
   session:{...input.read.session,isCurrent:()=>alive,onInvalidate(fn:()=>void){listeners.add(fn);return()=>listeners.delete(fn);}}};
  if(!api)api=installOfficeCommand(document,window);
  return api.connect({read,view:input.view,endpoint:input.endpoint});
 },state(){return api?.getState();},invalidate(){alive=false;for(const fn of [...listeners])fn();api?.disconnect();}};
}`;
  await writeFile(entry, source);
  let server;
  try {
    const { build } = await import('vite');
    await build({
      configFile: false,
      root,
      logLevel: 'silent',
      build: {
        lib: { entry, formats: ['es'], fileName: () => 'bundle.mjs' },
        outDir: directory,
        emptyOutDir: false,
        minify: false,
      },
    });
    const bundle = await readFile(path.join(directory, 'bundle.mjs'));
    const module = await import(
      pathToFileURL(path.join(directory, 'bundle.mjs')).href
    );
    server = createServer((req, res) => {
      if (req.url === '/bundle.mjs') {
        res.setHeader('content-type', 'text/javascript');
        res.end(bundle);
        return;
      }
      if (req.url === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.url !== '/') {
        res.writeHead(404);
        res.end();
        return;
      }
      res.setHeader('content-type', 'text/html');
      res.end(
        '<!doctype html><html><body><main class="country-game" data-office="trade" data-country="01"><div class="national-tools"></div></main><script type="module" src="/bundle.mjs"></script></body></html>',
      );
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    return {
      baseURL: `http://127.0.0.1:${server.address().port}`,
      bundleSha256: sha(bundle),
      module,
      async close() {
        await new Promise((resolve, reject) =>
          server.close((e) => (e ? reject(e) : resolve())),
        );
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (e) {
    if (server?.listening)
      await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
    throw e;
  }
}
/** Reusable for Native while its actual isolated server is alive. Binding,
 * original request and ephemeral JWT are process-memory inputs; no token,
 * header or HTTP body is logged/returned. This probe starts no backend and
 * never retries a command. The caller explicitly clicks one submit only. */
export async function createFixedOfficeBrowserProbe({
  browser,
  application,
  apiBaseURL,
  applicationOrigin,
  binding,
  accessToken,
}) {
  const assets = loopback(application.baseURL),
    backend = loopback(apiBaseURL);
  const app = new URL(applicationOrigin);
  if (
    app.protocol !== 'https:' ||
    app.origin !== applicationOrigin ||
    app.username ||
    app.password
  )
    throw Error('EXPLICIT_TEST_APPLICATION_ORIGIN_REQUIRED');
  const api = new URL(binding.endpoint.origin);
  if (
    api.protocol !== 'https:' ||
    api.origin !== binding.endpoint.origin ||
    api.origin === app.origin
  )
    throw Error('EXPLICIT_DISTINCT_API_ORIGIN_REQUIRED');
  const context = await browser.newContext(),
    requests = [],
    failures = [];
  const paths = new Set([
    '/v1/postwar-office-runtime',
    '/v1/office-command',
    '/v1/command-recovery',
  ]);
  await context.route('**/*', async (route) => {
    const request = route.request(),
      u = new URL(request.url());
    let destination;
    if (
      u.origin === app.origin &&
      ['/', '/bundle.mjs', '/favicon.ico'].includes(u.pathname)
    )
      destination = assets + u.pathname;
    else if (u.origin === api.origin && paths.has(u.pathname))
      destination = backend + u.pathname + u.search;
    else {
      failures.push('UNEXPECTED_NETWORK_DESTINATION');
      await route.abort('blockedbyclient');
      return;
    }
    requests.push({ method: request.method(), path: u.pathname });
    try {
      const headers = await request.allHeaders();
      delete headers.host;
      delete headers.cookie;
      const response = await context.request.fetch(destination, {
        method: request.method(),
        headers,
        ...(request.postDataBuffer() ? { data: request.postDataBuffer() } : {}),
        maxRedirects: 0,
        timeout: 12000,
      });
      await route.fulfill({ response });
    } catch {
      failures.push('OWNED_LOOPBACK_REQUEST_FAILED');
      await route.abort('failed').catch(() => undefined);
    }
  });
  const page = await context.newPage();
  try {
    await page.goto(applicationOrigin + '/');
    await page.waitForFunction(() => !!window.EconMindFixedOfficeProbe);
    // Only this evaluate input contains the JWT; it is never serialized to an
    // artifact, injected into source text, console, URL, DOM or storage.
    const publicBinding = JSON.parse(
      JSON.stringify({
        read: {
          identity: binding.read.identity,
          world: binding.read.world,
          endpoints: binding.read.endpoints,
          seatRef: binding.read.seatRef,
          session: { sessionRef: binding.read.session.sessionRef },
        },
        endpoint: binding.endpoint,
        view: binding.view,
      }),
    );
    await page.evaluate(
      (input) => window.EconMindFixedOfficeProbe.configure(input),
      { ...publicBinding, accessToken },
    );
    const click = (key) =>
      page.locator(`[data-office-command-action="${key}"]`).click();
    return {
      page,
      requests,
      failures,
      async open() {
        await click('open');
      },
      async read() {
        await click('refresh');
        await page.waitForFunction(
          () =>
            !['READING', 'READY_TO_READ'].includes(
              window.EconMindFixedOfficeProbe.state().status,
            ),
        );
        return this.state();
      },
      async submitOnce(originalRequest) {
        await page
          .locator('[data-office-command-draft]')
          .fill(JSON.stringify(originalRequest));
        await click('stage');
        await click('review');
        await click('confirm');
        await page.waitForFunction(
          () => window.EconMindFixedOfficeProbe.state().status !== 'SUBMITTING',
        );
        return this.state();
      },
      async recover() {
        await click('recover');
        await page.waitForFunction(
          () =>
            !['LOOKING_UP_FINAL', 'READING'].includes(
              window.EconMindFixedOfficeProbe.state().status,
            ),
        );
        return this.state();
      },
      state() {
        return page.evaluate(() => window.EconMindFixedOfficeProbe.state());
      },
      async invalidate() {
        await page.evaluate(() => window.EconMindFixedOfficeProbe.invalidate());
        return this.state();
      },
      async close() {
        await context.close();
      },
    };
  } catch (e) {
    await context.close();
    throw e;
  }
}
async function verify(output, c) {
  const cases = [],
    cleanup = [],
    evidence = {
      classification:
        'TEST_ONLY_SYNTHETIC_PROTOCOL_AND_REAL_UNCONFIGURED_API_NOT_BACKEND_ACCEPTANCE',
      cases,
      cleanup,
    };
  let application, server, browser, probe, trade, bank;
  try {
    application = await createFixedOfficeBrowserApplication();
    const fixtures = {
      trade: application.module.fixedOfficeCommandFixture('trade'),
      central_bank:
        application.module.fixedOfficeCommandFixture('central_bank'),
    };
    const { createPostwarTradeConnection } = await import(
      pathToFileURL(
        path.join(
          root,
          'apps/world-api/dist/runtime/postwar-trade-connection.js',
        ),
      ).href
    );
    const { createPostwarCentralBankConnection } = await import(
      pathToFileURL(
        path.join(
          root,
          'apps/world-api/dist/runtime/postwar-central-bank-connection.js',
        ),
      ).href
    );
    trade = createPostwarTradeConnection(null);
    bank = createPostwarCentralBankConnection(null);
    let role = 'trade',
      actualClosed = false;
    const counts = {
      trade: { submit: 0, recover: 0 },
      central_bank: { submit: 0, recover: 0 },
    };
    server = createServer(async (req, res) => {
      try {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 16384) {
            res.writeHead(413);
            res.end();
            return;
          }
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks).toString(),
          path = new URL(req.url, 'http://127.0.0.1').pathname;
        if (path === '/v1/office-command') counts[role].submit++;
        if (path === '/v1/command-recovery') counts[role].recover++;
        let response;
        if (
          actualClosed &&
          ['/v1/office-command', '/v1/command-recovery'].includes(path)
        ) {
          const connection = role === 'trade' ? trade : bank;
          const result = await connection[
            path === '/v1/office-command' ? 'handleCommand' : 'recover'
          ]({
            request: JSON.parse(body),
            authorization: req.headers.authorization,
          });
          response = Response.json(result.body, { status: result.httpStatus });
        } else
          response = await fixtures[role].fetcher(
            'https://test-only.example.invalid' + path,
            { method: req.method, body },
          );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        res.destroy();
      }
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const { chromium } = await import(pathToFileURL(c.playwrightModule).href);
    browser = await chromium.launch({
      executablePath: c.executable,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const apiBaseURL = `http://127.0.0.1:${server.address().port}`;
    probe = await createFixedOfficeBrowserProbe({
      browser,
      application,
      apiBaseURL,
      applicationOrigin: 'https://app.test-only.example.invalid',
      binding: fixtures.trade.binding,
      accessToken: 'TEST_ONLY_TOKEN_NOT_A_REAL_CREDENTIAL',
    });
    await probe.open();
    let state = await probe.read();
    assert.equal(state.status, 'CURRENT_AUTHORIZED_HEAD');
    assert.equal(state.runtimePage.source.originWorldVersion, '0');
    state = await probe.submitOnce(fixtures.trade.request);
    assert.equal(state.status, 'UNKNOWN');
    assert.equal(state.canConfirm, false);
    state = await probe.recover();
    assert.equal(state.status, 'QUEUE_ACK');
    assert.equal(state.receipt, null);
    fixtures.trade.recover('final');
    fixtures.trade.read('unavailable');
    state = await probe.recover();
    assert.equal(state.receipt.outcome, 'COMMITTED');
    assert.equal(state.status, 'UNAVAILABLE');
    assert.equal(state.completion, false);
    fixtures.trade.read('page');
    state = await probe.read();
    assert.equal(state.currentHead.worldVersion, '3');
    assert.equal(state.completion, false);
    assert.equal(counts.trade.submit, 1);
    cases.push({
      name: 'shipped Trade view UNKNOWN→original recovery→pending→FINAL with unavailable/current page; exactly one submit',
      status: 'PASS',
      source: 'SYNTHETIC_TEST_ONLY_HTTP',
    });
    state = await probe.invalidate();
    assert.equal(state.intent, null);
    assert.equal(state.runtimePage, null);
    assert.equal(state.receipt, null);
    cases.push({
      name: 'session retirement clears the actual browser drawer',
      status: 'PASS',
      source: 'ACTUAL_CHROMIUM_CLIENT_LIFECYCLE',
    });
    await probe.close();
    probe = undefined;
    role = 'central_bank';
    actualClosed = true;
    probe = await createFixedOfficeBrowserProbe({
      browser,
      application,
      apiBaseURL,
      applicationOrigin: 'https://app.test-only.example.invalid',
      binding: fixtures.central_bank.binding,
      accessToken: 'TEST_ONLY_TOKEN_NOT_A_REAL_CREDENTIAL',
    });
    await probe.open();
    await probe.read();
    state = await probe.submitOnce(fixtures.central_bank.request);
    assert.equal(state.status, 'UNKNOWN');
    state = await probe.recover();
    assert.equal(state.status, 'UNKNOWN');
    assert.equal(state.canConfirm, false);
    assert.equal(counts.central_bank.submit, 1);
    cases.push({
      name: 'real unconfigured CB service stays closed; recovery cannot cause a second command',
      status: 'PASS',
      source:
        'ACTUAL_DEFAULT_CLOSED_API_WITH_SYNTHETIC_AUTHORIZED_READ_FIXTURE',
    });
    evidence.browserVersion = browser.version();
    evidence.bundleSha256 = application.bundleSha256;
    evidence.counts = counts;
    evidence.status = 'PASS_TEST_ONLY';
  } catch (e) {
    evidence.status = 'FAIL';
    evidence.failure = {
      name: e?.name ?? 'Error',
      code: 'FIXED_OFFICE_BROWSER_PROBE_FAILED',
    };
  } finally {
    for (const [name, close] of [
      ['probe', () => probe?.close()],
      ['browser', () => browser?.close()],
      ['trade', () => trade?.stop()],
      ['bank', () => bank?.stop()],
      [
        'backend',
        () =>
          server?.listening
            ? new Promise((resolve, reject) => {
                server.close((e) => (e ? reject(e) : resolve()));
                server.closeAllConnections();
              })
            : undefined,
      ],
      ['application', () => application?.close()],
    ]) {
      try {
        await close();
        cleanup.push({ name, status: 'FULFILLED' });
      } catch {
        cleanup.push({ name, status: 'REJECTED' });
        evidence.status = 'FAIL';
      }
    }
    evidence.head = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    evidence.workingTree = 'WIP_SOURCE_HASHES_ARE_BINDING';
    evidence.sourceHashes = await Promise.all(
      [
        'apps/world-web/src/office-command/contract.ts',
        'apps/world-web/src/office-command/controller.ts',
        'apps/world-web/src/office-command/recovery-client.ts',
        'apps/world-web/src/office-command/view.ts',
        'tests/world-web/office-command-fixed-offices-fixture.ts',
        'tools/office-connection/fixed-office-command-browser.mjs',
      ].map(async (p) => ({
        path: p,
        sha256: sha(await readFile(path.join(root, p))),
      })),
    );
    await writeFile(output, JSON.stringify(evidence, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
  }
  return evidence;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const c = await capabilities();
  if (!process.argv.includes('--verify'))
    console.log(
      JSON.stringify({
        mode: 'PLAN_NO_SERVER_BROWSER_DB',
        capabilities: c,
        reusableExports: [
          'createFixedOfficeBrowserApplication',
          'createFixedOfficeBrowserProbe',
        ],
        classification: 'NO_BACKEND_ACCEPTANCE_CLAIM',
      }),
    );
  else {
    const output = process.argv[process.argv.indexOf('--output') + 1];
    if (
      !process.argv.includes('--output') ||
      !output ||
      !path.isAbsolute(output)
    )
      throw Error('EXPLICIT_NEW_ABSOLUTE_OUTPUT_REQUIRED');
    if (c.status !== 'AVAILABLE') {
      await writeFile(
        output,
        JSON.stringify({ status: 'BLOCKED', capabilities: c }) + '\n',
        { flag: 'wx' },
      );
      process.exitCode = 2;
    } else {
      const result = await verify(output, c);
      console.log(
        JSON.stringify({
          status: result.status,
          cases: result.cases.length,
          output,
        }),
      );
      if (result.status !== 'PASS_TEST_ONLY') process.exitCode = 1;
    }
  }
}
