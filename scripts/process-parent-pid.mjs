import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execute = promisify(execFile);

/** Launcher ownership polling must not spawn a new process every 25ms on Linux.
 * Read the kernel's parent relationship directly; missing/dead owners fail shut.
 * Keep the existing ps observation on platforms without procfs. */
export async function readProcessParentPid(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return undefined;
  try {
    let parent;
    if (process.platform === 'linux') {
      const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
      // comm is parenthesized and can itself contain spaces/parentheses.
      const end = stat.lastIndexOf(')');
      if (end < 0 || Number(stat.slice(0, stat.indexOf(' '))) !== pid)
        return undefined;
      const [state, ppid] = stat
        .slice(end + 1)
        .trim()
        .split(/\s+/u);
      if (state === 'Z' || state === 'X') return undefined;
      parent = Number(ppid);
    } else if (process.platform === 'win32') {
      return pid;
    } else {
      const { stdout } = await execute('ps', [
        '-p',
        String(pid),
        '-o',
        'ppid=',
      ]);
      parent = Number(stdout.trim());
    }
    return Number.isSafeInteger(parent) && parent > 0 ? parent : undefined;
  } catch {
    return undefined;
  }
}
