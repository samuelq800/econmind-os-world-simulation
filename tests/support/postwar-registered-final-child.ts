/** Parent-owned fixed IPC transport; no SQL or source/authority facts cross RPC. */
import { fork } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import path from 'node:path';
export interface RegisteredChildReply {
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: unknown;
  readonly diagnostics?: unknown;
}
/** Startup only: the measured 434s proof plus 21 x 13.5s publications needs
 * a separate finite budget; the complete one-time 21 utility and POWER
 * phases are additional measured startup work. HTTP/RPC operation bounds remain unchanged. */
export function registeredFinalColdPreparationBudget(
  configuration: unknown,
): number {
  const explicit =
    configuration !== null &&
    typeof configuration === 'object' &&
    'schemaVersion' in configuration &&
    configuration.schemaVersion ===
      'test-only-registered-final-child-host-v1' &&
    'prepareRefinery21Sources' in configuration &&
    configuration.prepareRefinery21Sources === true;
  return explicit &&
    process.env.ECONMIND_REGISTERED_REFINERY21_SOURCE_PREPARATION === '1' &&
    process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE === '1'
    ? 3600000
    : 600000;
}
export async function startPostwarRegisteredFinalNodeChild(input: {
  repositoryRoot: string;
  configuration: unknown;
  logFile: string;
}) {
  // Fail before creating an OS child if its exclusive evidence file cannot open.
  const log = createWriteStream(input.logFile, { flags: 'wx' });
  await once(log, 'open');
  const child = fork(
    path.join(
      input.repositoryRoot,
      'tools/office-connection/native-registered-final-host.mjs',
    ),
    [],
    {
      cwd: input.repositoryRoot,
      execArgv: [],
      env: { ...process.env, ECONMIND_REGISTERED_FINAL_NODE_CHILD: '1' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  let next = 0,
    closing: Promise<unknown> | undefined,
    exitCode: number | null | undefined,
    logFailure: Error | undefined;
  const pending = new Map<
    number,
    {
      resolve: (v: RegisteredChildReply) => void;
      reject: (e: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  log.on('error', (error: Error) => {
    logFailure = error;
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
    child.kill('SIGTERM');
  });
  child.on('message', (message: unknown) => {
    if (
      message &&
      typeof message === 'object' &&
      'id' in message &&
      typeof message.id === 'number'
    ) {
      const item = pending.get(message.id);
      if (item) {
        clearTimeout(item.timer);
        pending.delete(message.id);
        if ('ok' in message && typeof message.ok === 'boolean')
          item.resolve({
            ok: message.ok,
            ...('value' in message ? { value: message.value } : {}),
            ...('error' in message ? { error: message.error } : {}),
            ...('diagnostics' in message
              ? { diagnostics: message.diagnostics }
              : {}),
          });
        else item.reject(Error('REGISTERED_CHILD_REPLY_INVALID'));
      }
    }
  });
  child.on('exit', (code, signal) => {
    exitCode = code;
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(Error('REGISTERED_CHILD_EXITED:' + code + ':' + signal));
    }
    pending.clear();
    log.end();
  });
  const rpc = (
    type: string,
    data: Record<string, unknown> = {},
    timeoutMs = 30000,
  ): Promise<RegisteredChildReply> =>
    new Promise((resolve, reject) => {
      if (!child.connected) {
        reject(Error('REGISTERED_CHILD_NOT_CONNECTED'));
        return;
      }
      const id = ++next,
        timer = setTimeout(() => {
          pending.delete(id);
          reject(Error('REGISTERED_CHILD_RPC_TIMEOUT:' + type));
        }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.send({ id, type, ...data }, (error) => {
        if (error) {
          clearTimeout(timer);
          pending.delete(id);
          reject(error);
        }
      });
    });
  const stop = () =>
    (closing ??= (async () => {
      let result: RegisteredChildReply | undefined, error: unknown;
      try {
        if (child.connected) result = await rpc('CLOSE', {}, 20000);
      } catch (e) {
        error = e;
      }
      if (exitCode === undefined) {
        const timeout = setTimeout(() => child.kill('SIGTERM'), 5000);
        try {
          await once(child, 'exit');
        } finally {
          clearTimeout(timeout);
        }
      }
      if (logFailure) throw logFailure;
      if (error) throw error;
      if (exitCode !== 0)
        throw Error('REGISTERED_CHILD_UNCLEAN_EXIT:' + exitCode);
      return { pid: child.pid, exitCode, close: result };
    })());
  try {
    const ready = await rpc(
      'INIT',
      { configuration: input.configuration },
      // Actual complete 70-country private proof took 392,991ms in the
      // retained offline receipt. This is startup only; online HTTP remains
      // at its existing 10s bound. A JSON proof/cache may not replace it.
      registeredFinalColdPreparationBudget(input.configuration),
    );
    if (!ready.ok)
      throw new Error('REGISTERED_CHILD_PREPARATION_FAILED', {
        cause: ready.error,
      });
    return { pid: child.pid!, ready: ready.value, rpc, stop };
  } catch (error) {
    try {
      await stop();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        'REGISTERED_CHILD_FAILED_AND_CLEANUP_FAILED',
        { cause: cleanup },
      );
    }
    throw error;
  }
}
