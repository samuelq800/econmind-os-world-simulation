import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, mkdir, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const chromePath =
  process.env.GATE_B_CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const viteCli = path.join(repoRoot, 'node_modules/vite/bin/vite.js');
const viteConfig = path.join(repoRoot, 'apps/world-web/vite.config.ts');
const webDist = path.join(repoRoot, 'apps/world-web/dist');
const scenarioManifest = path.join(
  repoRoot,
  'tests/e2e/gate-b-required-scenarios.json',
);

function minimalLocalEnvironment() {
  const environment = {};
  for (const name of ['PATH', 'TMPDIR', 'LANG']) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  return environment;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function freeLoopbackPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('LOCAL_PORT_UNAVAILABLE');
  }
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function waitForLocalPreview(origin, processHandle) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (processHandle.exitCode !== null || processHandle.signalCode !== null) {
      throw new Error('LOCAL_PREVIEW_EXITED_BEFORE_READY');
    }
    try {
      const response = await fetch(`${origin}/readyz`, {
        signal: AbortSignal.timeout(300),
        redirect: 'error',
      });
      const body = await response.json();
      if (
        response.ok &&
        body.service === 'world-web' &&
        body.ready === true &&
        body.authoritative === false
      )
        return;
    } catch {
      // The bounded local service may not have opened its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('LOCAL_PREVIEW_READY_TIMEOUT');
}

async function dumpRenderedDom(url, profileDir) {
  const { stdout } = await execFileAsync(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profileDir}`,
      '--dump-dom',
      '--timeout=5000',
      url,
    ],
    {
      timeout: 15_000,
      maxBuffer: 8 * 1024 * 1024,
      env: minimalLocalEnvironment(),
    },
  );
  return stdout;
}

async function stopPreview(processHandle) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null)
    return;
  processHandle.kill('SIGTERM');
  const stopped = await Promise.race([
    new Promise((resolve) => processHandle.once('exit', () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 2_000)),
  ]);
  if (
    !stopped &&
    processHandle.exitCode === null &&
    processHandle.signalCode === null
  )
    processHandle.kill('SIGKILL');
}

async function main() {
  await Promise.all([
    stat(path.join(webDist, 'index.html')),
    stat(path.join(webDist, 'command.html')),
    stat(viteCli),
    stat(chromePath),
  ]);
  const manifest = JSON.parse(await readFile(scenarioManifest, 'utf8'));
  if (
    manifest.status !== 'NOT_RUN' ||
    manifest.scenarios.length !== 4 ||
    manifest.scenarios.some((scenario) => scenario.status !== 'NOT_RUN')
  )
    throw new Error('GATE_B_SCENARIO_MANIFEST_INVALID');

  const port = await freeLoopbackPort();
  const origin = `http://127.0.0.1:${port}`;
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), 'econmind-gate-b-browser-'),
  );
  let preview;
  try {
    const environment = {
      ...minimalLocalEnvironment(),
      ECONMIND_ENV: 'local',
      WORLD_WEB_HOST: '127.0.0.1',
      WORLD_WEB_PORT: String(port),
      WORLD_API_HOST: '127.0.0.1',
      WORLD_API_PORT: '4101',
    };
    preview = spawn(
      process.execPath,
      [viteCli, 'preview', '--config', viteConfig],
      {
        cwd: repoRoot,
        env: environment,
        stdio: ['ignore', 'ignore', 'ignore'],
      },
    );
    await waitForLocalPreview(origin, preview);

    const landingProfile = path.join(temporaryRoot, 'landing-profile');
    const commandProfile = path.join(temporaryRoot, 'command-profile');
    await Promise.all([mkdir(landingProfile), mkdir(commandProfile)]);
    const [landingDom, commandDom, chromeVersion] = await Promise.all([
      dumpRenderedDom(`${origin}/`, landingProfile),
      dumpRenderedDom(`${origin}/command.html`, commandProfile),
      execFileAsync(chromePath, ['--version'], {
        timeout: 5_000,
        env: minimalLocalEnvironment(),
      }),
    ]);

    const landingBoundary =
      landingDom.includes('Public preview only.') &&
      landingDom.includes('does not connect to World State');
    const commandBoundary =
      commandDom.includes('PREPARATION ONLY') &&
      commandDom.includes('Typed local mock projection') &&
      commandDom.includes('no command submission');
    const result = {
      schemaVersion: 'GATE_B_BROWSER_PREFLIGHT_V1',
      target: 'EPHEMERAL_LOOPBACK_VITE_PREVIEW',
      browser: chromeVersion.stdout.trim(),
      previewSmoke: landingBoundary && commandBoundary ? 'PASS' : 'FAIL',
      assertions: { landingBoundary, commandBoundary },
      renderedDomSha256: {
        landing: sha256(landingDom),
        command: sha256(commandDom),
      },
      gateBBrowser: 'NOT_RUN',
      scenarios: manifest.scenarios,
      productionAccess: false,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.previewSmoke !== 'PASS') process.exitCode = 1;
  } finally {
    if (preview) await stopPreview(preview);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`GATE_B_BROWSER_PREFLIGHT_FAILED: ${error.message}\n`);
  process.exitCode = 1;
});
