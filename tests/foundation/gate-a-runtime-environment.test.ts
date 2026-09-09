import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryRoot = new URL('../..', import.meta.url).pathname;

const commands = [
  {
    label: 'root dev',
    name: 'dev',
    portKeys: ['WORLD_WEB_PORT', 'WORLD_API_PORT', 'WORLD_WORKER_HEALTH_PORT'],
  },
  { label: 'root dev:web', name: 'dev:web', portKeys: ['WORLD_WEB_PORT'] },
  { label: 'root dev:api', name: 'dev:api', portKeys: ['WORLD_API_PORT'] },
  {
    label: 'root dev:worker',
    name: 'dev:worker',
    portKeys: ['WORLD_WORKER_HEALTH_PORT'],
  },
  {
    cwd: 'apps/world-web',
    label: 'world-web start',
    name: 'start',
    portKeys: ['WORLD_WEB_PORT'],
  },
  {
    cwd: 'apps/world-api',
    label: 'world-api start',
    name: 'start',
    portKeys: ['WORLD_API_PORT'],
  },
  {
    cwd: 'apps/world-worker',
    label: 'world-worker start',
    name: 'start',
    portKeys: ['WORLD_WORKER_HEALTH_PORT'],
  },
] as const;

const attacks = [
  {
    name: 'local environment with a production-like database URL',
    values: {
      ECONMIND_ENV: 'local',
      WORLD_DATABASE_URL: 'postgresql://synthetic@example.supabase.co/postgres',
      WORLD_DATABASE_FINGERPRINT: 'world-v2-local',
    },
  },
  {
    name: 'local environment with a production fingerprint',
    values: {
      ECONMIND_ENV: 'local',
      WORLD_DATABASE_URL: 'postgresql://synthetic@127.0.0.1/postgres',
      WORLD_DATABASE_FINGERPRINT: 'world-v2-production',
    },
  },
  {
    name: 'local environment with the public namespace',
    values: { ECONMIND_ENV: 'local', WORLD_DATABASE_NAMESPACE: 'public' },
  },
  {
    name: 'local environment with database mutation enabled',
    values: { ECONMIND_ENV: 'local', WORLD_DATABASE_MUTATION_MODE: 'enabled' },
  },
  {
    name: 'staging environment with a production fingerprint mismatch',
    values: {
      ECONMIND_ENV: 'staging',
      WORLD_DATABASE_URL: 'postgresql://synthetic@staging.invalid/postgres',
      WORLD_DATABASE_FINGERPRINT: 'world-v2-production',
    },
  },
  {
    name: 'production environment with a loopback database',
    values: {
      ECONMIND_ENV: 'production',
      WORLD_DATABASE_URL: 'postgresql://synthetic@127.0.0.1/postgres',
      WORLD_DATABASE_FINGERPRINT: 'world-v2-production',
    },
  },
  ...[
    'localhost.',
    '127.1',
    '2130706433',
    '0x7f000001',
    '[::ffff:127.0.0.1]',
  ].map((host) => ({
    name: `production environment with loopback alias ${host}`,
    values: {
      ECONMIND_ENV: 'production',
      WORLD_DATABASE_URL: `postgresql://synthetic@${host}/postgres`,
      WORLD_DATABASE_FINGERPRINT: 'world-v2-production',
    },
  })),
  { name: 'missing environment identity', values: { ECONMIND_ENV: undefined } },
  { name: 'invalid environment identity', values: { ECONMIND_ENV: 'preview' } },
  {
    name: 'conflicting URL fingerprint and namespace',
    values: {
      ECONMIND_ENV: 'local',
      WORLD_DATABASE_URL: 'postgresql://synthetic@127.0.0.1/a',
      DATABASE_URL: 'postgresql://synthetic@127.0.0.1/b',
      WORLD_DATABASE_FINGERPRINT: 'world-v2-production',
      WORLD_DATABASE_NAMESPACE: 'public',
    },
  },
  {
    name: 'forbidden production credential exposure',
    values: {
      ECONMIND_ENV: 'local',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-not-a-secret',
    },
  },
] as const;

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Unable to allocate a loopback port');
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function uniquePorts(count: number): Promise<number[]> {
  const ports = new Set<number>();
  while (ports.size < count) ports.add(await freePort());
  return [...ports];
}

async function canRebind(port: number): Promise<boolean> {
  const server = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    return true;
  } catch {
    return false;
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}

describe.skipIf(process.platform === 'win32')(
  'GATEA-BLK-01 public runtime environment boundary',
  () => {
    it.each(
      commands.flatMap((command) =>
        attacks.map((attack) => ({
          attack,
          command,
          name: `${command.label} fails closed for ${attack.name}`,
        })),
      ),
    )('$name', { timeout: 15_000 }, async ({ command, attack }) => {
      const ports = await uniquePorts(command.portKeys.length);
      const environment: NodeJS.ProcessEnv = {
        ...process.env,
        ECONMIND_ENV: 'local',
        WORLD_DATABASE_NAMESPACE: 'world_v2',
        WORLD_DATABASE_MUTATION_MODE: 'disabled',
      };
      delete environment.WORLD_DATABASE_URL;
      delete environment.DATABASE_URL;
      delete environment.WORLD_DATABASE_FINGERPRINT;
      delete environment.SUPABASE_SERVICE_ROLE_KEY;
      for (const [key, value] of Object.entries(attack.values)) {
        if (value === undefined) delete environment[key];
        else environment[key] = value;
      }
      command.portKeys.forEach((key, index) => {
        environment[key] = String(ports[index]);
      });

      const child = spawn('pnpm', [command.name], {
        cwd:
          'cwd' in command
            ? path.join(repositoryRoot, command.cwd)
            : repositoryRoot,
        env: environment,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      const exit = new Promise<{
        code: number | null;
        signal: NodeJS.Signals | null;
      }>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) => resolve({ code, signal }));
      });
      const result = await Promise.race([
        exit,
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('unsafe public command did not exit')),
            10_000,
          );
        }),
      ]);
      expect(result.code).not.toBe(0);
      expect(output).not.toContain('LISTENING');
      expect(await Promise.all(ports.map(canRebind))).toEqual(
        ports.map(() => true),
      );
    });
  },
);
