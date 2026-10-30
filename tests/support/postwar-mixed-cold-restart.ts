/** TEST_ONLY OS-boundary verifier. Import has no effects. No schema/source
 * initialization, grant, publication, worker lease or consumer is started. */
import { fork } from 'node:child_process';
import type { ManualOfficeCommandRequestDto } from '@econmind/core/authenticated-office-command-contract';
import type { createPostwarFinanceSocialFxNativeFixture } from './postwar-finance-social-fx-native-fixture.js';
type Fixture = Awaited<
  ReturnType<typeof createPostwarFinanceSocialFxNativeFixture>
>;
export interface MixedColdGeneration {
  readonly pid: number;
  readonly preparationMs: number;
  readonly rssBefore: number;
  readonly rssAfter: number;
  readonly maxRssKiB: number;
  readonly consumerState: 'PREPARED';
  readonly consumerStarted: false;
  readonly before: Readonly<Record<string, string>>;
  readonly after: Readonly<Record<string, string>>;
  readonly results: readonly Readonly<Record<string, unknown>>[];
}
export interface MixedColdRevokedReport {
  readonly newFxDenied: true;
  readonly finalizedCount: number;
  readonly countsBefore: Readonly<Record<string, string>>;
  readonly countsAfter: Readonly<Record<string, string>>;
  readonly existing: Readonly<Record<string, unknown>>;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('FIXED_COLD_CHILD_OBJECT_REQUIRED');
  return value as Record<string, unknown>;
}
async function startGeneration(configuration: object) {
  const child = fork(
    new URL(
      '../../tools/office-connection/native-mixed-cold-restart-host.mjs',
      import.meta.url,
    ),
    [],
    {
      execPath: process.execPath,
      execArgv: ['--max-old-space-size=2304'],
      serialization: 'advanced',
      env: {
        NODE_ENV: 'test',
        ECONMIND_ENV: 'ci',
        ECONMIND_MIXED_COLD_RESTART_HOST: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  let stderr = '',
    stdout = '',
    closed: Record<string, unknown> | undefined,
    readyResolve!: (value: Record<string, unknown>) => void,
    readyReject!: (error: Error) => void;
  child.stderr?.on('data', (v: Buffer) => {
    stderr = (stderr + v.toString()).slice(-8192);
  });
  child.stdout?.on('data', (v: Buffer) => {
    stdout = (stdout + v.toString()).slice(-8192);
  });
  const ready = new Promise<Record<string, unknown>>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const pending = new Map<
    string,
    {
      resolve(v: Record<string, unknown>): void;
      reject(e: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const exited = new Promise<{ code: number | null; signal: string | null }>(
    (resolve) =>
      child.once('exit', (code, signal) => resolve({ code, signal })),
  );
  child.on('error', readyReject);
  child.on('message', (raw: unknown) => {
    const m = record(raw);
    if (m.type === 'READY') readyResolve(m);
    else if (m.type === 'CLOSED') closed = m;
    else if (m.type === 'ERROR') {
      const e = Error(
        'MIXED_COLD_CHILD:' + String(m.message) + '\n' + String(m.stack),
      );
      if (typeof m.id === 'string' && pending.has(m.id)) {
        const p = pending.get(m.id)!;
        pending.delete(m.id);
        clearTimeout(p.timer);
        p.reject(e);
      } else readyReject(e);
    } else if (m.type === 'RESULT' && typeof m.id === 'string') {
      const p = pending.get(m.id);
      if (p) {
        pending.delete(m.id);
        clearTimeout(p.timer);
        p.resolve(record(m.result));
      }
    }
  });
  child.once('exit', (code, signal) => {
    const e = Error(
      'MIXED_COLD_CHILD_EXIT:' +
        String(code) +
        ':' +
        String(signal) +
        ':' +
        stderr,
    );
    readyReject(e);
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(e);
    }
    pending.clear();
  });
  let stopping: Promise<Readonly<Record<string, unknown>>> | undefined;
  const stop = () =>
    (stopping ??= (async () => {
      const term = setTimeout(() => {
          child.kill('SIGTERM');
        }, 15000),
        kill = setTimeout(() => {
          child.kill('SIGKILL');
        }, 20000);
      try {
        if (child.connected) child.send({ operation: 'CLOSE' });
        const status = await exited;
        if (
          status.code !== 0 ||
          status.signal ||
          !closed ||
          !Array.isArray(closed.errors) ||
          closed.errors.length ||
          !Array.isArray(closed.idleErrors) ||
          closed.idleErrors.length
        )
          throw Error(
            'COLD_OS_CLEAN_EXIT_REQUIRED:' +
              JSON.stringify({ status, closed, stderr, stdout }),
          );
        return Object.freeze({
          pid: child.pid,
          exitCode: status.code,
          signal: status.signal,
          ...closed,
        });
      } finally {
        clearTimeout(term);
        clearTimeout(kill);
      }
    })());
  const timer = setTimeout(
    () => readyReject(Error('COLD_PRODUCT_OFFLINE_PREPARATION_TIMEOUT')),
    240000,
  );
  let generation: MixedColdGeneration;
  try {
    child.send({ operation: 'START', configuration });
    const r = await ready;
    if (
      r.pid !== child.pid ||
      r.consumerState !== 'PREPARED' ||
      r.consumerStarted !== false ||
      !Array.isArray(r.results) ||
      typeof r.preparationMs !== 'number' ||
      typeof r.rssAfter !== 'number' ||
      JSON.stringify(r.before) !== JSON.stringify(r.after)
    )
      throw Error('ACTUAL_COLD_PREPARED_FINAL_REPORT_REQUIRED');
    generation = r as unknown as MixedColdGeneration;
  } catch (error) {
    try {
      await stop();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'COLD_START_AND_CLEANUP_FAILED',
        { cause: cleanupError },
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  let sequence = 0;
  return {
    generation,
    stop,
    async verifyRevokedSource(
      request: ManualOfficeCommandRequestDto,
    ): Promise<MixedColdRevokedReport> {
      const id = String(++sequence);
      try {
        return await new Promise<MixedColdRevokedReport>((resolve, reject) => {
          const timer = setTimeout(() => {
            pending.delete(id);
            reject(Error('COLD_REVOKED_PROBE_TIMEOUT'));
          }, 15000);
          pending.set(id, {
            timer,
            reject,
            resolve: (r) => {
              if (
                r.newFxDenied !== true ||
                !Number.isSafeInteger(r.finalizedCount) ||
                JSON.stringify(r.countsBefore) !== JSON.stringify(r.countsAfter)
              ) {
                reject(Error('ACTUAL_REVOKED_FINAL_COUNTS_REQUIRED'));
                return;
              }
              resolve(r as unknown as MixedColdRevokedReport);
            },
          });
          child.send({ operation: 'VERIFY_REVOKED_SOURCE', id, request });
        });
      } catch (error) {
        try {
          await stop();
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            'COLD_PROBE_AND_CLEANUP_FAILED',
            { cause: cleanupError },
          );
        }
        throw error;
      }
    },
  };
}
/** Old source is stopped before two sequential cold OS hosts. Caller owns the
 * clone/roles and must finally stop finalHost before fixture.cleanup. The last
 * OS only serves fixed source-revoke rejection/FINAL retries, no consumer RPC. */
export async function startPostwarMixedColdRestarts(input: {
  readonly fixture: Fixture;
  readonly requests: readonly ManualOfficeCommandRequestDto[];
  readonly actor: 'ACTOR_TEST_ONLY_MIXED_FX';
  readonly expectedHead: Readonly<{
    worldVersion: string;
    eventSequence: string;
  }>;
}) {
  if (
    process.env.ECONMIND_POSTWAR_MIXED_FX_NATIVE !== '1' ||
    process.env.ECONMIND_POSTWAR_DAY_ONE_FX_NATIVE !== '1'
  )
    throw Error('EXPLICIT_CFC_COLD_NATIVE_OPT_INS_REQUIRED');
  const { fixture } = input;
  if (input.requests.length < 1 || input.requests.length > 6)
    throw Error('SIX_EXISTING_MANUAL_REQUESTS_MAXIMUM');
  const time = await fixture.worker.query<{ sim_time: string }>(
    'select coalesce(max(sim_time),0)::text as sim_time from world_v2.authoritative_event where world_id=$1',
    [fixture.marker.worldId],
  );
  if (time.rows.length !== 1) throw Error('ACTUAL_FROZEN_PREFIX_TIME_REQUIRED');
  const configuration = {
    worldId: fixture.marker.worldId,
    seedId: fixture.marker.seedId,
    seedFingerprint: fixture.marker.seedFingerprint,
    admissionRef: fixture.marker.admissionRef,
    subject: fixture.marker.subject,
    socket: fixture.marker.socket,
    port: fixture.marker.port,
    database: fixture.clone.database,
    workerRole: fixture.workerRole,
    intakeRole: fixture.intakeRole,
    workerId: fixture.workerId,
    modelVersion: String(fixture.header.model_version),
    simTime: time.rows[0]!.sim_time,
    requests: input.requests,
    actor: input.actor,
    expectedHead: input.expectedHead,
  };
  await fixture.connection.stop();
  const first = await startGeneration(configuration),
    firstExit = await first.stop();
  const second = await startGeneration(configuration);
  if (first.generation.pid === second.generation.pid) {
    await second.stop();
    throw Error('DISTINCT_ACTUAL_OS_GENERATIONS_REQUIRED');
  }
  return Object.freeze({
    generations: Object.freeze([
      Object.freeze({ ...first.generation, exit: firstExit }),
      second.generation,
    ]),
    finalHost: Object.freeze({
      verifyRevokedSource: second.verifyRevokedSource,
      stop: second.stop,
    }),
  });
}
