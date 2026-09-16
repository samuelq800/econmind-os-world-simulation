import { execFile, spawn } from 'node:child_process';
import { constants as osConstants } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { assertSafeEnvironment } from './environment-policy.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const supportedEnvironments = new Set(['local', 'ci', 'staging', 'production']);
const supportedHosts = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);
const serviceDefinitions = Object.freeze([
  {
    command: 'dev:web',
    name: 'world-web',
  },
  {
    command: 'dev:api',
    name: 'world-api',
  },
  {
    command: 'dev:worker',
    name: 'world-worker',
  },
]);

function parsePort(environment, key, fallback) {
  const value = environment[key] ?? String(fallback);
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${key} must be an integer from 1024 to 65535`);
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`${key} must be an integer from 1024 to 65535`);
  }
  return port;
}

function parseHost(environment, key) {
  const host = environment[key] ?? '127.0.0.1';
  if (!supportedHosts.has(host)) {
    throw new Error(`${key} is not an approved local host`);
  }
  return host;
}

function parseDuration(environment, key, fallback, minimum, maximum) {
  const value = environment[key] ?? String(fallback);
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${key} must be an integer from ${minimum} to ${maximum}`);
  }
  const duration = Number(value);
  if (
    !Number.isSafeInteger(duration) ||
    duration < minimum ||
    duration > maximum
  ) {
    throw new Error(`${key} must be an integer from ${minimum} to ${maximum}`);
  }
  return duration;
}

function connectHost(host) {
  if (host === '0.0.0.0') return '127.0.0.1';
  return host.includes(':') ? `[${host}]` : host;
}

function readConfiguration(environment = process.env) {
  const environmentName = environment.ECONMIND_ENV ?? 'local';
  if (!supportedEnvironments.has(environmentName)) {
    throw new Error(`Unsupported ECONMIND_ENV: ${environmentName}`);
  }
  const web = {
    host: parseHost(environment, 'WORLD_WEB_HOST'),
    port: parsePort(environment, 'WORLD_WEB_PORT', 4100),
  };
  const api = {
    host: parseHost(environment, 'WORLD_API_HOST'),
    port: parsePort(environment, 'WORLD_API_PORT', 4101),
  };
  const worker = {
    host: parseHost(environment, 'WORLD_WORKER_HEALTH_HOST'),
    port: parsePort(environment, 'WORLD_WORKER_HEALTH_PORT', 4102),
  };
  const ports = [web.port, api.port, worker.port];
  if (new Set(ports).size !== ports.length) {
    throw new Error('WORLD runtime ports must be distinct');
  }
  return {
    api,
    cleanupTimeoutMs: parseDuration(
      environment,
      'WORLD_BOOTSTRAP_CLEANUP_TIMEOUT_MS',
      7_500,
      100,
      15_000,
    ),
    commitDelayMs: parseDuration(
      environment,
      'WORLD_BOOTSTRAP_COMMIT_DELAY_MS',
      0,
      0,
      1_000,
    ),
    environmentName,
    pollIntervalMs: parseDuration(
      environment,
      'WORLD_BOOTSTRAP_POLL_INTERVAL_MS',
      50,
      10,
      1_000,
    ),
    probeTimeoutMs: parseDuration(
      environment,
      'WORLD_BOOTSTRAP_PROBE_TIMEOUT_MS',
      750,
      50,
      5_000,
    ),
    startupTimeoutMs: parseDuration(
      environment,
      'WORLD_BOOTSTRAP_STARTUP_TIMEOUT_MS',
      30_000,
      100,
      60_000,
    ),
    web,
    worker,
  };
}

function serviceUrl(service, pathName) {
  return `http://${connectHost(service.host)}:${service.port}${pathName}`;
}

async function readSmallJson(response) {
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > 4_096) throw new Error('Operational response too large');
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function singleProbe(url, validate, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref();
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
    });
    if (response.status !== 200) return false;
    return validate(await readSmallJson(response));
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function isObject(value) {
  return typeof value === 'object' && value !== null;
}

function webReady(value) {
  return (
    isObject(value) &&
    value.service === 'world-web' &&
    value.status === 'ok' &&
    value.ready === true &&
    value.authoritative === false
  );
}

function apiReady(value) {
  return (
    isObject(value) &&
    value.service === 'world-api' &&
    value.status === 'ok' &&
    value.ready === true &&
    value.authoritativeMutationEnabled === false
  );
}

function workerReady(value) {
  return (
    isObject(value) &&
    value.service === 'world-worker' &&
    value.status === 'ok' &&
    value.ready === true &&
    value.simulationEnabled === false
  );
}

function webApiReady(value) {
  return (
    isObject(value) &&
    value.service === 'world-web' &&
    value.dependency === 'world-api' &&
    value.status === 'ok'
  );
}

function childAlive(owned) {
  return (
    owned.child.pid !== undefined &&
    owned.child.exitCode === null &&
    owned.child.signalCode === null
  );
}

async function readinessSnapshot(configuration, children) {
  const [web, api, worker, webApi] = await Promise.all([
    singleProbe(
      serviceUrl(configuration.web, '/readyz'),
      webReady,
      configuration.probeTimeoutMs,
    ),
    singleProbe(
      serviceUrl(configuration.api, '/readyz'),
      apiReady,
      configuration.probeTimeoutMs,
    ),
    singleProbe(
      serviceUrl(configuration.worker, '/readyz'),
      workerReady,
      configuration.probeTimeoutMs,
    ),
    singleProbe(
      serviceUrl(configuration.web, '/__bootstrap/api-health'),
      webApiReady,
      configuration.probeTimeoutMs,
    ),
  ]);
  return {
    api,
    childrenAlive: children.every(childAlive),
    ready: web && api && worker && webApi && children.every(childAlive),
    web,
    webApi,
    worker,
  };
}

function delay(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function resultExitCode(result) {
  if (result.code !== null) return result.code;
  if (result.signal === null) return 1;
  const signalNumber = osConstants.signals[result.signal];
  return typeof signalNumber === 'number' ? 128 + signalNumber : 1;
}

async function readProcessTable() {
  if (process.platform === 'win32') return [];
  const { stdout } = await execFileAsync('ps', [
    '-axo',
    'pid=,ppid=,stat=,command=',
  ]);
  return stdout
    .trim()
    .split('\n')
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/u);
      if (!match) return undefined;
      return {
        command: match[4],
        pid: Number(match[1]),
        ppid: Number(match[2]),
        state: match[3],
      };
    })
    .filter(Boolean);
}

function descendantRows(rows, roots) {
  const ownedPids = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (ownedPids.has(row.ppid) && !ownedPids.has(row.pid)) {
        ownedPids.add(row.pid);
        changed = true;
      }
    }
  }
  return rows.filter((row) => ownedPids.has(row.pid));
}

async function liveCapturedRows(captured) {
  if (captured.length === 0) return [];
  const current = await readProcessTable();
  const capturedPids = new Set(captured.map((row) => row.pid));
  return current.filter(
    (row) => capturedPids.has(row.pid) && !row.state.startsWith('Z'),
  );
}

async function cleanupChildren(children, timeoutMs) {
  const roots = children.map((owned) => owned.child.pid).filter(Boolean);
  const captured = descendantRows(await readProcessTable(), roots);
  for (const owned of children) {
    if (childAlive(owned)) owned.child.kill('SIGTERM');
  }
  const deadline = Date.now() + timeoutMs;
  let live = await liveCapturedRows(captured);
  while (live.length > 0 && Date.now() < deadline) {
    await delay(25);
    live = await liveCapturedRows(captured);
  }
  const forced = live.length > 0;
  for (const row of [...live].reverse()) {
    try {
      process.kill(row.pid, 'SIGKILL');
    } catch {
      // The owned process exited between the observation and kill.
    }
  }
  if (forced) {
    const killDeadline = Date.now() + 1_000;
    while ((await liveCapturedRows(captured)).length > 0) {
      if (Date.now() >= killDeadline) break;
      await delay(25);
    }
  }
  await Promise.allSettled(children.map((owned) => owned.exit));
  return { captured: captured.length, forced };
}

async function parentIsPnpm(parentPid) {
  if (process.platform === 'win32') return true;
  try {
    const { stdout } = await execFileAsync('ps', [
      '-p',
      String(parentPid),
      '-o',
      'command=',
    ]);
    return /(?:^|[/\\])pnpm(?:\.(?:cjs|mjs))?(?:\s|$)|\(pnpm\)/u.test(
      stdout.trim(),
    );
  } catch {
    return false;
  }
}

function spawnServices(environment, onExit) {
  const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  return serviceDefinitions.map((definition) => {
    const child = spawn(pnpmCommand, [definition.command], {
      cwd: repositoryRoot,
      env: environment,
      shell: false,
      stdio: 'inherit',
    });
    const exit = new Promise((resolve) => {
      child.once('error', () => {
        const result = { code: 1, signal: null };
        onExit(definition.name, result);
        resolve(result);
      });
      child.once('exit', (code, signal) => {
        const result = { code, signal };
        onExit(definition.name, result);
        resolve(result);
      });
    });
    return { child, definition, exit };
  });
}

function sanitizedReason(error) {
  if (!(error instanceof Error)) return 'unknown-bootstrap-failure';
  if (/Unsupported ECONMIND_ENV/u.test(error.message)) {
    return 'invalid-environment';
  }
  if (/approved local host/u.test(error.message)) return 'invalid-host';
  if (/must be an integer/u.test(error.message)) return 'invalid-number';
  if (/ports must be distinct/u.test(error.message)) return 'port-conflict';
  if (/owned by its pnpm parent/u.test(error.message))
    return 'parent-not-owned';
  return 'bootstrap-internal-failure';
}

async function run() {
  let phase = 'STARTING';
  let outcome;
  let failure = {};
  let readyEmitted = false;
  let children = [];
  let stopping = false;
  let terminalRequested = false;
  let parentWatch;
  let terminalResolve;
  const terminal = new Promise((resolve) => {
    terminalResolve = resolve;
  });
  const originalParentPid = process.ppid;
  const originalParentIsPnpm = await parentIsPnpm(originalParentPid);

  function emit(event, details = {}, error = false) {
    const payload = JSON.stringify({
      event,
      phase,
      outcome: outcome ?? null,
      ...failure,
      ...details,
    });
    (error ? console.error : console.log)(payload);
  }

  function requestTerminal(request) {
    if (stopping || terminalRequested) return;
    terminalRequested = true;
    terminalResolve(request);
  }

  function onChildExit(service, result) {
    if (stopping) return;
    requestTerminal({
      exitCode: resultExitCode(result),
      reason: 'child-exited',
      service,
      signal: result.signal,
      type: 'failure',
    });
  }

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      requestTerminal({ signal, type: 'signal' });
    });
  }

  try {
    assertSafeEnvironment(process.env);
    if (!originalParentIsPnpm || process.ppid !== originalParentPid) {
      throw new Error('bootstrap must remain owned by its pnpm parent');
    }
    const configuration = readConfiguration();
    emit('BOOTSTRAP_START', { environment: configuration.environmentName });
    children = spawnServices(process.env, onChildExit);
    phase = 'WAITING_FOR_DEPENDENCIES';
    emit('BOOTSTRAP_WAITING');

    parentWatch = setInterval(() => {
      if (process.ppid !== originalParentPid) {
        requestTerminal({ signal: 'SIGTERM', type: 'parent-exit' });
      }
    }, 25);

    const readiness = (async () => {
      const deadline = Date.now() + configuration.startupTimeoutMs;
      while (Date.now() < deadline) {
        if (terminalRequested) return { type: 'superseded' };
        const snapshot = await readinessSnapshot(configuration, children);
        if (terminalRequested) return { type: 'superseded' };
        if (snapshot.ready) {
          emit('BOOTSTRAP_READY_CANDIDATE');
          if (configuration.commitDelayMs > 0) {
            await delay(configuration.commitDelayMs);
          } else {
            await new Promise((resolve) => setImmediate(resolve));
          }
          const finalSnapshot = await readinessSnapshot(
            configuration,
            children,
          );
          if (terminalRequested) return { type: 'superseded' };
          if (!finalSnapshot.ready) {
            return {
              reason: 'final-readiness-revalidation-failed',
              service: !finalSnapshot.api ? 'world-api' : 'bootstrap-stack',
              type: 'failure',
            };
          }
          return { type: 'ready' };
        }
        await delay(configuration.pollIntervalMs);
      }
      return {
        reason: 'readiness-timeout',
        service: 'bootstrap-stack',
        type: 'failure',
      };
    })();

    const startupResult = await Promise.race([readiness, terminal]);
    if (startupResult.type === 'ready') {
      phase = 'READY';
      if (!readyEmitted) {
        readyEmitted = true;
        emit('BOOTSTRAP_READY');
      }
      const terminalResult = await terminal;
      if (terminalResult.type === 'failure') {
        outcome = 'FAILED';
        failure = {
          exit_code: terminalResult.exitCode,
          failed_service: terminalResult.service,
          failure_reason: terminalResult.reason,
          signal: terminalResult.signal,
        };
      } else {
        outcome = 'SUCCESS';
      }
    } else if (
      startupResult.type === 'signal' ||
      startupResult.type === 'parent-exit'
    ) {
      outcome = 'CANCELLED';
      failure = { signal: startupResult.signal };
    } else {
      outcome = 'FAILED';
      failure = {
        exit_code: startupResult.exitCode,
        failed_service: startupResult.service,
        failure_reason: startupResult.reason,
        signal: startupResult.signal,
      };
    }

    phase = 'SHUTTING_DOWN';
    stopping = true;
    emit('BOOTSTRAP_SHUTDOWN_START');
    if (parentWatch !== undefined) clearInterval(parentWatch);
    const cleanup = await cleanupChildren(
      children,
      configuration.cleanupTimeoutMs,
    );
    if (cleanup.forced) {
      if (outcome !== 'FAILED') outcome = 'FAILED';
      failure = {
        ...failure,
        failed_service: failure.failed_service ?? 'bootstrap-stack',
        failure_reason: failure.failure_reason ?? 'cleanup-timeout',
      };
    }
    phase = 'STOPPED';
    emit('BOOTSTRAP_STOPPED', {
      cleanup_forced: cleanup.forced,
      owned_processes_observed: cleanup.captured,
      ready_emitted: readyEmitted,
    });
  } catch (error) {
    if (parentWatch !== undefined) clearInterval(parentWatch);
    outcome = 'FAILED';
    failure = {
      failed_service: 'bootstrap-stack',
      failure_reason: sanitizedReason(error),
    };
    phase = 'SHUTTING_DOWN';
    stopping = true;
    emit('BOOTSTRAP_SHUTDOWN_START', {}, true);
    if (children.length > 0) {
      await cleanupChildren(children, 7_500).catch(() => undefined);
    }
    phase = 'STOPPED';
    emit('BOOTSTRAP_STOPPED', { ready_emitted: readyEmitted }, true);
  }

  if (outcome === 'FAILED') process.exitCode = 1;
  if (outcome === 'CANCELLED') {
    const signalNumber = osConstants.signals[failure.signal];
    process.exitCode =
      typeof signalNumber === 'number' ? 128 + signalNumber : 1;
  }
}

await run();
