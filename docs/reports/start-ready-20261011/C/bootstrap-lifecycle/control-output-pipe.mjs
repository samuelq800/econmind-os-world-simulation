import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Local regression only. No service, network, database, or shared process.
const mode = process.argv[2];
if (mode === 'grandchild') {
  process.on('SIGTERM', () => console.log('CONTROL_CHILD_TERM_IGNORED'));
  console.log('CONTROL_CHILD_READY');
  process.send?.('ready');
  setTimeout(() => console.log('CONTROL_CHILD_LATE_OUTPUT'), 2_000);
  setTimeout(() => process.exit(0), 4_000); // Bounded natural safety stop.
} else if (mode === 'held-pipe' || mode === 'run-timeout') {
  if (mode === 'run-timeout') {
    process.on('SIGTERM', () => console.log('CONTROL_PARENT_TERM_IGNORED'));
  }
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), 'grandchild'],
    {
      shell: false,
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    },
  );
  child.once('message', () => {
    setTimeout(
      () => {
        console.log('CONTROL_PARENT_EXIT');
        process.exit(1);
      },
      mode === 'run-timeout' ? 4_200 : 300,
    ); // Finite safety stop / ownership window.
  });
} else if (mode === 'fast-exit') {
  process.stdout.write('CONTROL_FINAL_STDOUT\n');
  process.stderr.write('CONTROL_FINAL_STDERR\n');
  process.exitCode = 1;
} else {
  throw new Error('expected held-pipe or fast-exit control');
}
